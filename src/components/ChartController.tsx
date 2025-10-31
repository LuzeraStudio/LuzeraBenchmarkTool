import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
// --- Chart.js Imports ---
import { ChartJsChart, type ChartJsChartHandle } from "./ChartJsChart";
import type { ChartData, Point } from "chart.js";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
// --- Other Imports ---
import type { BenchmarkRun, AvailableMetric, ChartAxisKey, Preset, PerformanceLogEntry, BenchmarkEvent, } from "@/types/benchmark";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger, } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/components/ui/tooltip";
import { Save, Check, ZoomIn, ZoomOut, Palette, X, Cog, List, Copy, MapPin, Eye, EyeOff, StretchVertical, ClipboardCopy, } from "lucide-react";
import { cn, findClosestIndexBinary } from "@/lib/utils";
import { useBenchmarkData } from "@/contexts/BenchmarkContext";
import { getComputedColor } from "@/lib/colorUtils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { useChartSettings, MIN_CHART_HEIGHT, MAX_CHART_HEIGHT, HEIGHT_STEP, } from "@/contexts/ChartSettingsContext";
import { useTheme } from "@/contexts/ThemeContext";

// --- Worker Message Types (Using Worker Output) ---
interface ChartJsWorkerDataset {
    [prefixedDataKey: string]: (Point | null)[];
}
interface ChartDataResult {
    labels: (number | string)[];
    datasets: ChartJsWorkerDataset;
    fullDataForDetails: PerformanceLogEntry[];
}
interface ChartDataResultMessage {
    type: "DATA_READY";
    payload: ChartDataResult;
}
interface ErrorResultMessage {
    type: "ERROR";
    payload: { message: string };
}
type ChartWorkerMessage = ChartDataResultMessage | ErrorResultMessage;

// --- Constants ---
const CHART_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
    "var(--chart-7)",
    "var(--chart-8)",
    "var(--chart-9)",
    "var(--chart-10)",
    "var(--chart-11)",
    "var(--chart-12)",
    "var(--chart-13)",
    "var(--chart-14)",
    "var(--chart-15)",
    "var(--chart-16)",
];
const PRESETS_KEY = "benchmark-presets-v2";
const COLOR_OVERRIDES_KEY = "benchmark-color-overrides-v2";
const DOWNSAMPLE_THRESHOLD = 2000;

const defaultPresets: Preset[] = [
    {
        name: "GPU Data",
        metrics: ["GPU.USAGE", "GPU.VRAM.USAGE", "GPU.TEMPERATURE"],
    },
    {
        name: "CPU & Memory",
        metrics: ["CPU.USAGE", "RAM.USAGE"],
    },
    {
        name: "GPU + CPU + FPS",
        metrics: ["GPU.USAGE", "CPU.USAGE", "FPS.CURRENT"],
    },
    {
        name: "Overall FPS",
        metrics: [
            "FPS.OVERALL.1PERCENTILE",
            "FPS.OVERALL.0.1PERCENTILE",
            "FPS.OVERALL.AVERAGE",
            "FPS.OVERALL.99PERCENTILE",
            "FPS.OVERALL.99.9PERCENTILE",
        ],
    },
    {
        name: "Graph FPS",
        metrics: [
            "FPS.GRAPH.1PERCENTILE",
            "FPS.GRAPH.0.1PERCENTILE",
            "FPS.GRAPH.AVERAGE",
            "FPS.GRAPH.99PERCENTILE",
            "FPS.GRAPH.99.9PERCENTILE",
        ],
    },
];

interface ChartControllerProps {
    runs: BenchmarkRun[];
    mapNames: string[];
}

export const ChartController = ({
    runs,
    mapNames,
}: ChartControllerProps) => {
    const { theme } = useTheme();
    const { toast } = useToast();
    const { sessions, deleteSession } = useBenchmarkData();
    const {
        selectedMap,
        selectedMetrics,
        setSelectedMap,
        setSelectedMetrics,
        xAxisKey,
        setXAxisKey,
        selectedSessionIds,
        setSelectedSessionIds,
        isInitialSessionLoadDone,
        setIsInitialSessionLoadDone,
        chartHeight,
        setChartHeight,
        isTooltipEnabled,
        setIsTooltipEnabled,
        chartZoom,
        setChartZoom,
    } = useChartSettings();
    const [hiddenDatasetLabels, setHiddenDatasetLabels] = useState(
        new Set<string>(),
    );
    const [debouncedTheme, setDebouncedTheme] = useState(theme);
    const chartComponentRef = useRef<ChartJsChartHandle>(null);

    const handleShowAll = () => {
        setHiddenDatasetLabels(new Set());
    };

    const handleHideAll = () => {
        const allLabels = new Set<string>();
        selectedSessionMetas.forEach((session) => {
            selectedMetricMetas.forEach((metric) => {
                allLabels.add(`${session.name} - ${metric.label}`);
            });
        });
        setHiddenDatasetLabels(allLabels);
    };

    const handleStatHeaderToggle = (metricKey: string) => {
        const metric = selectedMetricMetas.find((m) => m.key === metricKey);
        if (!metric) return;

        const metricLabel = metric.label;
        const targetLabels = selectedSessionMetas.map(
            (session) => `${session.name} - ${metricLabel}`,
        );

        const allHidden = targetLabels.every((label) =>
            hiddenDatasetLabels.has(label),
        );

        setHiddenDatasetLabels((prev) => {
            const newSet = new Set(prev);
            if (allHidden) {
                targetLabels.forEach((label) => newSet.delete(label));
            } else {
                targetLabels.forEach((label) => newSet.add(label));
            }
            return newSet;
        });
    };

    const handleLegendToggle = (datasetLabel: string) => {
        setHiddenDatasetLabels((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(datasetLabel)) {
                newSet.delete(datasetLabel);
            } else {
                newSet.add(datasetLabel);
            }
            return newSet;
        });
    };

    const handleSessionHeaderToggle = (sessionId: string) => {
        const session = selectedSessionMetas.find((s) => s.id === sessionId);
        if (!session) return;

        const sessionName = session.name;
        const targetLabels = selectedMetricMetas.map(
            (metric) => `${sessionName} - ${metric.label}`,
        );

        const allHidden = targetLabels.every((label) =>
            hiddenDatasetLabels.has(label),
        );

        setHiddenDatasetLabels((prev) => {
            const newSet = new Set(prev);
            if (allHidden) {
                targetLabels.forEach((label) => newSet.delete(label));
            } else {
                targetLabels.forEach((label) => newSet.add(label));
            }
            return newSet;
        });
    };

    const allAvailableMetrics = useMemo((): AvailableMetric[] => {
        const metricsMap = new Map<string, AvailableMetric>();
        runs.forEach((run) => {
            run.availableMetrics.forEach((metric) => {
                if (!metricsMap.has(metric.key)) {
                    metricsMap.set(metric.key, metric);
                }
            });
        });
        return Array.from(metricsMap.values()).sort((a, b) =>
            a.key.localeCompare(b.key),
        );
    }, [runs]);

    const sessionNameMap = useMemo(
        () => new Map(sessions.map((s) => [s.sessionId, s.sessionName])),
        [sessions],
    );

    const uniqueSessionsInRuns = useMemo(() => {
        const sessionMap = new Map<string, { id: string; name: string }>();
        runs.forEach((run) => {
            if (!sessionMap.has(run.sessionId)) {
                sessionMap.set(run.sessionId, {
                    id: run.sessionId,
                    name: sessionNameMap.get(run.sessionId) || "Unknown Session",
                });
            }
        });
        return Array.from(sessionMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }, [runs, sessionNameMap]);

    const prevAvailableSessionIdsRef = useRef<Set<string>>(
        new Set(uniqueSessionsInRuns.map((s) => s.id)),
    );

    const selectedMetricMetas = useMemo(() => {
        return allAvailableMetrics
            .filter((m) => selectedMetrics.has(m.key))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [allAvailableMetrics, selectedMetrics]);

    const selectedSessionMetas = useMemo(() => {
        return uniqueSessionsInRuns
            .filter((s) => selectedSessionIds.has(s.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [uniqueSessionsInRuns, selectedSessionIds]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTheme(theme);
        }, 0);

        return () => clearTimeout(timer);
    }, [theme]);

    const chartWorkerRef = useRef<Worker | null>(null);
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [processedChartData, setProcessedChartData] =
        useState<ChartDataResult>({
            labels: [],
            datasets: {},
            fullDataForDetails: [],
        });

    const [isPresetPopoverOpen, setIsPresetPopoverOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isMetricsPopoverOpen, setIsMetricsPopoverOpen] = useState(false);
    const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);
    const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
        {},
    );
    const [clickedPointDetails, setClickedPointDetails] =
        useState<PerformanceLogEntry | null>(null);
    const [isPointDialogOpen, setIsPointDialogOpen] = useState(false);

    useEffect(() => {
        if (selectedMetrics.size === 0 && allAvailableMetrics.length > 0) {
            const defaults = new Set<string>();
            allAvailableMetrics.forEach((metric) => {
                if (
                    metric.key === "FPS.CURRENT" ||
                    metric.key === "CPU.USAGE" ||
                    metric.key === "GPU.USAGE"
                ) {
                    defaults.add(metric.key);
                }
            });
            if (defaults.size > 0) {
                setSelectedMetrics(defaults);
            } else if (allAvailableMetrics.length > 0) {
                setSelectedMetrics(new Set([allAvailableMetrics[0].key]));
            }
        }
    }, [allAvailableMetrics, selectedMetrics.size, setSelectedMetrics]);

    useEffect(() => {
        if (
            !isInitialSessionLoadDone &&
            selectedSessionIds.size === 0 &&
            uniqueSessionsInRuns.length > 0
        ) {
            const allSessionIds = new Set(uniqueSessionsInRuns.map((s) => s.id));
            setSelectedSessionIds(allSessionIds);
            setIsInitialSessionLoadDone(true);
        }
    }, [
        uniqueSessionsInRuns,
        selectedSessionIds.size,
        setSelectedSessionIds,
        isInitialSessionLoadDone,
        setIsInitialSessionLoadDone,
    ]);

    useEffect(() => {
        if (!isInitialSessionLoadDone) return;

        const availableSessionIds = new Set(uniqueSessionsInRuns.map((s) => s.id));
        const currentSessionIds = new Set(selectedSessionIds);
        const prevAvailableSessionIds = prevAvailableSessionIdsRef.current;

        let newSelectedIds = new Set(currentSessionIds);
        let changed = false;

        for (const id of currentSessionIds) {
            if (!availableSessionIds.has(id)) {
                newSelectedIds.delete(id);
                changed = true;
            }
        }

        for (const id of availableSessionIds) {
            if (!prevAvailableSessionIds.has(id)) {
                newSelectedIds.add(id);
                changed = true;
            }
        }

        prevAvailableSessionIdsRef.current = availableSessionIds;

        if (changed) {
            setSelectedSessionIds(newSelectedIds);
        }
    }, [
        uniqueSessionsInRuns,
        selectedSessionIds,
        setSelectedSessionIds,
        isInitialSessionLoadDone,
    ]);

    const selectedRunIds = useMemo(() => {
        const runIds = new Set<string>();
        runs.forEach((run) => {
            if (selectedSessionIds.has(run.sessionId)) {
                runIds.add(run.id);
            }
        });
        return runIds;
    }, [runs, selectedSessionIds]);

    const getMetricColor = useCallback(
        (metricKey: string): string => {
            const override = colorOverrides[metricKey];
            if (override) return override;

            const metricIndex = allAvailableMetrics.findIndex(
                (m) => m.key === metricKey,
            );
            if (metricIndex === -1 || CHART_COLORS.length === 0) {
                return getComputedColor("hsl(var(--primary))") || "#8884d8";
            }
            return getComputedColor(CHART_COLORS[metricIndex % CHART_COLORS.length]);
        },
        [colorOverrides, allAvailableMetrics],
    );

    const chartJsDisplayData = useMemo(() => {
        const { labels, datasets: workerDatasets } = processedChartData;
        if (
            !labels ||
            labels.length === 0 ||
            !workerDatasets ||
            Object.keys(workerDatasets).length === 0
        ) {
            return { finalLabels: [], finalDatasets: [], yAxesConfig: {} };
        }

        const finalDatasets: ChartData<
            "line",
            (number | Point | null)[],
            number | string
        >["datasets"] = [];
        const yAxesConfig: { left?: boolean; right?: boolean; ram?: boolean } = {};
        const activeRuns = runs.filter((run) => selectedRunIds.has(run.id));

        activeRuns.forEach((run) => {
            const sessionName = sessionNameMap.get(run.sessionId) || "Unknown";
            selectedMetrics.forEach((metricKey) => {
                const dataKey = `${run.id}:${metricKey}`;
                const metricMeta = allAvailableMetrics.find(
                    (m) => m.key === metricKey,
                );

                if (metricMeta && workerDatasets[dataKey]) {
                    let yAxisID: "yLeft" | "yRight" | "yRam";
                    if (
                        metricKey.startsWith("RAM.") ||
                        (metricKey.startsWith("GPU.VRAM.") &&
                            !metricKey.includes("PERCENTAGE"))
                    ) {
                        yAxisID = "yRam";
                        yAxesConfig.ram = true;
                    } else if (metricMeta.isPercentage) {
                        yAxisID = "yRight";
                        yAxesConfig.right = true;
                    } else {
                        yAxisID = "yLeft";
                        yAxesConfig.left = true;
                    }

                    finalDatasets.push({
                        label: `${sessionName} - ${metricMeta.label}`,
                        data: workerDatasets[dataKey],
                        borderColor: getMetricColor(metricKey),
                        backgroundColor: getMetricColor(metricKey),
                        borderWidth: 1.5,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHitRadius: 10,
                        tension: 0,
                        yAxisID: yAxisID,
                        parsing: false,
                        spanGaps: false,
                    });
                }
            });
        });

        return { finalLabels: labels, finalDatasets, yAxesConfig };
    }, [
        processedChartData.labels,
        processedChartData.datasets,
        runs,
        selectedRunIds,
        selectedMetrics,
        sessionNameMap,
        allAvailableMetrics,
        getMetricColor,
        debouncedTheme,
    ]);

    const yRamMax = useMemo(() => {
        let overallMaxRam = 0;

        if (selectedSessionIds.size === 0) {
            return undefined;
        }

        for (const sessionId of selectedSessionIds) {
            const staticData = sessions.find(
                (s) => s.sessionId === sessionId,
            )?.staticData;

            if (staticData) {
                const ramString = staticData["Total RAM (MB)"];
                const totalRam = ramString ? parseFloat(ramString) : 0;
                const validRam = !isNaN(totalRam) ? totalRam : 0;

                const vramString = staticData["Total VRAM (MB)"];
                const totalVram = vramString ? parseFloat(vramString) : 0;
                const validVram = !isNaN(totalVram) ? totalVram : 0;

                const sessionMax = Math.max(validRam, validVram);
                if (sessionMax > overallMaxRam) {
                    overallMaxRam = sessionMax;
                }
            }
        }

        if (overallMaxRam === 0) {
            return undefined;
        }

        return overallMaxRam;
    }, [sessions, selectedSessionIds]);

    const yLeftMax = useMemo(() => {
        let max = -Infinity;
        let foundLeftAxis = false;

        chartJsDisplayData.finalDatasets.forEach((dataset) => {
            if (dataset.yAxisID === "yLeft") {
                foundLeftAxis = true;
                dataset.data.forEach((point) => {
                    if (point && typeof point === "object" && typeof point.y === "number") {
                        if (point.y > max) {
                            max = point.y;
                        }
                    }
                });
            }
        });

        if (foundLeftAxis && max > -Infinity) {
            return max * 1.05;
        }

        return undefined;
    }, [chartJsDisplayData.finalDatasets]);

    const colorInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem(PRESETS_KEY);
        setPresets(stored ? JSON.parse(stored) : defaultPresets);
        const storedColors = localStorage.getItem(COLOR_OVERRIDES_KEY);
        if (storedColors) setColorOverrides(JSON.parse(storedColors));
    }, []);

    const savePresets = (newPresets: Preset[]) => {
        localStorage.setItem(PRESETS_KEY, JSON.stringify(newPresets));
        setPresets(newPresets);
    };
    const saveColorOverrides = (newOverrides: Record<string, string>) => {
        localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(newOverrides));
        setColorOverrides(newOverrides);
    };

    const handleColorChange = (metricKey: string, color: string) => {
        saveColorOverrides({ ...colorOverrides, [metricKey]: color });
    };

    const triggerColorInput = (metricKey: string) => {
        if (colorInputRef.current) {
            colorInputRef.current.dataset.metricKey = metricKey;
            colorInputRef.current.value = getMetricColor(metricKey);
            colorInputRef.current.click();
        }
    };

    const toggleMetric = (key: string) => {
        const newSet = new Set(selectedMetrics);
        newSet.has(key) ? newSet.delete(key) : newSet.add(key);
        setSelectedMetrics(newSet);
    };

    const toggleSession = (sessionId: string) => {
        const newSet = new Set(selectedSessionIds);
        newSet.has(sessionId) ? newSet.delete(sessionId) : newSet.add(sessionId);
        setSelectedSessionIds(newSet);
    };

    const handleDeleteSession = (sessionId: string) => {
        deleteSession(sessionId);
    };

    const loadPreset = (preset: Preset) => {
        const validMetrics = preset.metrics.filter((m) =>
            allAvailableMetrics.some((am) => am.key === m),
        );
        setSelectedMetrics(new Set(validMetrics));
        toast({ title: "Preset loaded", description: `Loaded "${preset.name}"` });
    };

    const saveNewPreset = () => {
        const name = newPresetName.trim();
        if (!name) {
            toast({
                title: "Error",
                description: "Please enter a preset name",
                variant: "destructive",
            });
            return;
        }
        if (selectedMetrics.size === 0) {
            toast({
                title: "Error",
                description: "Select at least one metric",
                variant: "destructive",
            });
            return;
        }
        if (presets.some((p) => p.name === name)) {
            toast({
                title: "Error",
                description: `Preset "${name}" already exists`,
                variant: "destructive",
            });
            return;
        }
        const newPreset: Preset = { name, metrics: Array.from(selectedMetrics) };
        const updatedPresets = [...presets, newPreset].sort((a, b) =>
            a.name.localeCompare(b.name),
        );
        savePresets(updatedPresets);
        setNewPresetName("");
        toast({ title: "Preset saved", description: `"${name}" saved` });
    };

    const deletePreset = (presetName: string) => {
        const updatedPresets = presets.filter((p) => p.name !== presetName);
        savePresets(updatedPresets);
        toast({ title: "Preset deleted", description: `"${presetName}" removed.` });
    };

    useEffect(() => {
        chartWorkerRef.current = new Worker(
            new URL("../workers/chart.worker.ts", import.meta.url),
            { type: "module" },
        );
        chartWorkerRef.current.onmessage = (
            e: MessageEvent<ChartWorkerMessage>,
        ) => {
            if (e.data.type === "DATA_READY") {
                setProcessedChartData(e.data.payload);
                setIsChartLoading(false);
            } else if (e.data.type === "ERROR") {
                toast({
                    variant: "destructive",
                    title: "Chart Processing Error",
                    description: e.data.payload.message,
                });
                setIsChartLoading(false);
                setProcessedChartData({
                    labels: [],
                    datasets: {},
                    fullDataForDetails: [],
                });
            }
        };
        chartWorkerRef.current.onerror = (e) => {
            console.error("Chart worker error:", e);
            toast({
                variant: "destructive",
                title: "Chart Worker Failed",
                description: "Worker error.",
            });
            setIsChartLoading(false);
            setProcessedChartData({
                labels: [],
                datasets: {},
                fullDataForDetails: [],
            });
        };
        return () => {
            chartWorkerRef.current?.terminate();
            chartWorkerRef.current = null;
        };
    }, [toast]);

    useEffect(() => {
        if (
            chartWorkerRef.current &&
            runs.length > 0 &&
            selectedRunIds.size > 0 &&
            selectedMetrics.size > 0
        ) {
            setIsChartLoading(true);
            const activeRuns = runs.filter((run) => selectedRunIds.has(run.id));
            if (activeRuns.length > 0) {
                try {
                    const runsForWorker = activeRuns.map((r) => ({
                        id: r.id,
                        sessionId: r.sessionId,
                        name: r.name,
                        performanceLogs: r.performanceLogs,
                        events: r.events,
                        availableMetrics: r.availableMetrics,
                    }));

                    const messagePayload = {
                        activeRuns: structuredClone(runsForWorker),
                        xAxisKey,
                        selectedMetricKeys: Array.from(selectedMetrics),
                        downsampleThreshold: DOWNSAMPLE_THRESHOLD,
                    };
                    chartWorkerRef.current.postMessage({
                        type: "PROCESS_DATA",
                        payload: messagePayload,
                    });
                } catch (cloneError) {
                    console.error("Failed to clone data for worker:", cloneError);
                    toast({
                        variant: "destructive",
                        title: "Data Error",
                        description: "Cannot prepare data.",
                    });
                    setIsChartLoading(false);
                }
            } else {
                setProcessedChartData({
                    labels: [],
                    datasets: {},
                    fullDataForDetails: [],
                });
                setIsChartLoading(false);
            }
        } else if (
            runs.length > 0 &&
            (selectedRunIds.size === 0 || selectedMetrics.size === 0)
        ) {
            setProcessedChartData({
                labels: [],
                datasets: {},
                fullDataForDetails: [],
            });
            setIsChartLoading(false);
        }
    }, [runs, selectedRunIds, xAxisKey, selectedMetrics, toast]);

    const { eventAnnotations, burstAnnotations } = useMemo(() => {
        const eventColor = getComputedColor("hsl(var(--destructive))");
        const burstColor = "rgba(255, 0, 0, 0.1)";

        const events: AnnotationOptions[] = [];
        const bursts: AnnotationOptions[] = [];

        const activeRuns = runs.filter((run) => selectedRunIds.has(run.id));
        const fullData = processedChartData.fullDataForDetails;

        const allEventsMapped: (BenchmarkEvent & {
            runId: string;
            xValue?: number;
        })[] = [];
        activeRuns.forEach((run) => {
            if (
                !run.events ||
                run.events.length === 0 ||
                !run.performanceLogs ||
                run.performanceLogs.length === 0
            )
                return;

            const timeMap = fullData
                .map((entry) => ({
                    x: entry[xAxisKey] as number,
                    time: entry[`${run.id}:TIMESTAMP`] as number,
                }))
                .filter(
                    (p) =>
                        typeof p.time === "number" &&
                        !isNaN(p.time) &&
                        typeof p.x === "number" &&
                        !isNaN(p.x),
                );

            timeMap.sort((a, b) => a.time - b.time);

            run.events.forEach((event) => {
                const eventTimestamp = (event.Timestamp as number) ?? 0;
                let eventXValue: number | undefined = undefined;

                if (xAxisKey === "TIMESTAMP") {
                    eventXValue = eventTimestamp;
                } else {
                    if (timeMap.length > 0) {
                        const closestIndex = findClosestIndexBinary(
                            timeMap,
                            eventTimestamp,
                            (item) => item.time,
                        );
                        eventXValue = timeMap[closestIndex]?.x;
                    }
                }
                allEventsMapped.push({ ...event, runId: run.id, xValue: eventXValue });
            });
        });

        allEventsMapped.forEach((event, idx) => {
            if (event.xValue !== undefined && !isNaN(event.xValue)) {
                events.push({
                    type: "line",
                    scaleID: "x",
                    value: event.xValue,
                    borderColor: eventColor,
                    borderWidth: 2,
                    borderDash: [6, 6],
                    label: {
                        content: event.EventName || `Event ${idx}`,
                        display: true,
                        position: "start",
                        backgroundColor: getComputedColor("hsl(var(--destructive))"),
                        color: "#fff",
                        font: { size: 10 },
                        padding: { x: 3, y: 2 },
                        yAdjust: 0,
                        borderRadius: 2,
                    },
                });
            }
        });

        let burstStart: number | null = null;
        fullData.forEach((entry, index) => {
            const isBursting = Array.from(selectedRunIds).some((runId) => {
                const burstKey = `${runId}:BURST_LOGGING_STATUS`;
                return entry[burstKey] === true || entry[burstKey] === "true";
            });

            const xValue = entry[xAxisKey] as number;
            if (isNaN(xValue)) return;

            if (isBursting && burstStart === null) {
                burstStart = xValue;
            } else if (
                (!isBursting || index === fullData.length - 1) &&
                burstStart !== null
            ) {
                const xMax = xValue;
                if (
                    burstStart !== null &&
                    !isNaN(burstStart) &&
                    !isNaN(xMax) &&
                    burstStart !== xMax
                ) {
                    bursts.push({
                        type: "box",
                        xScaleID: "x",
                        xMin: burstStart,
                        xMax: xMax,
                        backgroundColor: burstColor,
                        borderColor: "transparent",
                        borderWidth: 0,
                        drawTime: "beforeDatasetsDraw",
                    });
                }
                burstStart = isBursting ? xValue : null;
            }
        });

        return { eventAnnotations: events, burstAnnotations: bursts };
    }, [
        processedChartData.fullDataForDetails,
        runs,
        selectedRunIds,
        xAxisKey,
        chartJsDisplayData.yAxesConfig,
        debouncedTheme,
    ]);

    const handlePointClick = useCallback(
        (dataPoint: PerformanceLogEntry | null) => {
            setClickedPointDetails(dataPoint);
            setIsPointDialogOpen(!!dataPoint);
        },
        [],
    );

    const comparisonData = useMemo(() => {
        if (!clickedPointDetails) {
            return { headers: [], rows: [], runIds: [] };
        }
        const metricData = new Map<string, any>();

        const pointXValue = clickedPointDetails[xAxisKey];
        const pointTimestamp = clickedPointDetails.TIMESTAMP;

        for (const [prefixedKey, value] of Object.entries(clickedPointDetails)) {
            const parts = prefixedKey.split(":");
            if (parts.length < 2) continue;
            const runId = parts[0];
            const metricKey = parts.slice(1).join(":");
            if (!selectedRunIds.has(runId)) continue;

            if (
                metricKey === "BURST_LOGGING_STATUS" ||
                metricKey === "TIMESTAMP" ||
                metricKey === xAxisKey
            )
                continue;

            if (!metricData.has(metricKey)) {
                const metricMeta = allAvailableMetrics.find(
                    (m) => m.key === metricKey,
                );
                metricData.set(metricKey, {
                    metric: metricMeta?.label || metricKey.replace(/\./g, " "),
                });
            }
            metricData.get(metricKey)![runId] = value;
        }
        const orderedRunIds = Array.from(selectedRunIds).sort((a, b) => {
            const nameA =
                sessionNameMap.get(runs.find((r) => r.id === a)?.sessionId || "") || a;
            const nameB =
                sessionNameMap.get(runs.find((r) => r.id === b)?.sessionId || "") || b;
            return nameA.localeCompare(nameB);
        });

        const headers = [
            "Metric",
            ...orderedRunIds.map(
                (id) =>
                    sessionNameMap.get(runs.find((r) => r.id === id)?.sessionId || "") ||
                    "Unknown",
            ),
        ];
        const rows = Array.from(metricData.values()).sort((a, b) =>
            a.metric.localeCompare(b.metric),
        );

        return { headers, rows, runIds: orderedRunIds, pointXValue, pointTimestamp };
    }, [
        clickedPointDetails,
        selectedRunIds,
        runs,
        sessionNameMap,
        allAvailableMetrics,
        xAxisKey,
    ]);

    const handleExtractData = useCallback(() => {
        if (!chartComponentRef.current) {
            toast({
                variant: "destructive",
                title: "Extract Error",
                description: "Chart is not ready.",
            });
            return;
        }

        const { xMin: rawMin, xMax: rawMax } =
            chartComponentRef.current.getZoomRange();

        if (typeof rawMin !== "number" || typeof rawMax !== "number") {
            toast({
                variant: "destructive",
                title: "Extract Error",
                description: "Could not determine chart zoom range.",
            });
            return;
        }

        const xMin = rawMin;
        const xMax = rawMax;
        const fullData = processedChartData.fullDataForDetails;

        const filteredData = fullData.filter((entry) => {
            const xVal = entry[xAxisKey] as number;
            return typeof xVal === "number" && xVal >= xMin && xVal <= xMax;
        });

        if (filteredData.length === 0) {
            toast({
                title: "Extract Data",
                description: "No data found in the selected zoom range.",
            });
            return;
        }

        const metricKeys = Array.from(selectedMetrics);
        const metricLabels = metricKeys.map(
            (key) =>
                allAvailableMetrics.find((m) => m.key === key)?.label.replace(/ /g, ".") ||
                key,
        );

        const headers = [
            "Run",
            "Session",
            xAxisKey,
            "TIMESTAMP",
            ...metricLabels,
        ].join(",");

        let csvContent = headers + "\n";
        const rows: string[] = [];

        const activeRuns = runs.filter((r) => selectedRunIds.has(r.id));

        for (const entry of filteredData) {
            const xVal = (entry[xAxisKey] as number)?.toFixed(3) || "";

            for (const run of activeRuns) {
                const runId = run.id;
                const sessionName = sessionNameMap.get(run.sessionId) || "Unknown";
                const runName = run.name;

                const timestampKey = `${runId}:TIMESTAMP`;
                const timestamp = (entry[timestampKey] as number)?.toFixed(3) || "";

                const metricValues = metricKeys.map((key) => {
                    const dataKey = `${runId}:${key}`;
                    const val = entry[dataKey];
                    if (typeof val === "number") return val.toFixed(3);
                    if (typeof val === "boolean") return val.toString();
                    if (typeof val === "string" && val.trim() !== "") return val;
                    return "N/A";
                });

                if (metricValues.some((v) => v !== "")) {
                    rows.push(
                        [
                            `"${runName}"`,
                            `"${sessionName}"`,
                            xVal,
                            timestamp,
                            ...metricValues,
                        ].join(","),
                    );
                }
            }
        }

        csvContent += rows.join("\n");

        navigator.clipboard
            .writeText(csvContent)
            .then(() => {
                toast({
                    title: "Data Extracted",
                    description: `Copied ${rows.length} rows to clipboard.`,
                });
            })
            .catch((err) => {
                console.error("Clipboard copy failed:", err);
                toast({
                    variant: "destructive",
                    title: "Copy Failed",
                    description: "Could not copy data to clipboard.",
                });
            });
    }, [
        chartComponentRef,
        processedChartData.fullDataForDetails,
        xAxisKey,
        selectedRunIds,
        runs,
        sessionNameMap,
        selectedMetrics,
        allAvailableMetrics,
        toast,
    ]);

    useEffect(() => {
        chartComponentRef.current?.resetZoom();
    }, [selectedMap, xAxisKey]);

    return (
        <div className="space-y-4 relative">
            {isChartLoading && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                    <p className="text-lg font-semibold animate-pulse">
                        Processing chart data...
                    </p>
                </div>
            )}

            <TooltipProvider delayDuration={100}>
                <div className="flex flex-wrap items-start justify-between gap-2 p-2 rounded-lg bg-card border sticky top-[73px] z-20">
                    <div className="flex flex-wrap gap-2">
                        <Select
                            value={selectedMap}
                            onValueChange={setSelectedMap}
                            disabled={mapNames.length <= 1}
                        >
                            <SelectTrigger
                                className="w-[180px] h-9 text-xs justify-between"
                                aria-label="Select Map"
                            >
                                <MapPin className="h-4 w-4 mr-2 shrink-0" />
                                <span className="truncate w-full">
                                    {selectedMap || "Select map"}
                                </span>
                                <span />
                            </SelectTrigger>
                            <SelectContent>
                                {mapNames.length > 0 ? (
                                    mapNames.map((map) => (
                                        <SelectItem key={map} value={map}>
                                            {map}
                                        </SelectItem>
                                    ))
                                ) : (
                                    <div className="p-2 text-xs text-muted-foreground">
                                        No maps found
                                    </div>
                                )}
                            </SelectContent>
                        </Select>
                        <Popover
                            open={isSessionPopoverOpen}
                            onOpenChange={setIsSessionPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    role="combobox"
                                    className="w-[180px] h-9 justify-between text-xs"
                                    aria-label="Select Sessions"
                                >
                                    <Copy className="h-4 w-4 mr-2 shrink-0" />
                                    Sessions ({selectedSessionIds.size}/
                                    {uniqueSessionsInRuns.length})
                                    <span />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="max-w-[500px] w-auto p-0"
                                align="start"
                            >
                                <Command>
                                    <CommandInput placeholder="Search sessions..." />
                                    <CommandEmpty>No sessions found.</CommandEmpty>
                                    <CommandList className="max-h-[300px] overflow-auto">
                                        <CommandGroup>
                                            {uniqueSessionsInRuns.map((session) => (
                                                <CommandItem
                                                    key={session.id}
                                                    value={session.name}
                                                    onSelect={() => toggleSession(session.id)}
                                                    className="flex justify-between items-center cursor-pointer group/item"
                                                >
                                                    <div className="flex items-center overflow-hidden">
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4 shrink-0",
                                                                selectedSessionIds.has(session.id)
                                                                    ? "opacity-100"
                                                                    : "opacity-0",
                                                            )}
                                                        />
                                                        <span className="text-sm truncate">
                                                            {session.name}
                                                        </span>
                                                    </div>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-auto p-1 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteSession(session.id);
                                                                }}
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right">
                                                            <p>Delete {session.name}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <div className="flex">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setChartHeight((h) =>
                                                Math.max(MIN_CHART_HEIGHT, h - HEIGHT_STEP),
                                            )
                                        }
                                        disabled={chartHeight <= MIN_CHART_HEIGHT}
                                        className="rounded-r-none h-9"
                                    >
                                        <ZoomOut className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Zoom Out Vertically</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => chartComponentRef.current?.resetZoom()}
                                        className="rounded-none h-9 border-l-0"
                                    >
                                        <StretchVertical className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Reset Horizontal Zoom</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setChartHeight((h) =>
                                                Math.min(MAX_CHART_HEIGHT, h + HEIGHT_STEP),
                                            )
                                        }
                                        disabled={chartHeight >= MAX_CHART_HEIGHT}
                                        className="rounded-l-none h-9 border-l-0"
                                    >
                                        <ZoomIn className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Zoom In Vertically</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsTooltipEnabled(!isTooltipEnabled)}
                                    className="h-9"
                                >
                                    {isTooltipEnabled ? (
                                        <Eye className="h-4 w-4" />
                                    ) : (
                                        <EyeOff className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{isTooltipEnabled ? "Hide Tooltip" : "Show Tooltip"}</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExtractData}
                                    className="h-9"
                                >
                                    <ClipboardCopy className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Extract visible data to clipboard</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Select
                            value={xAxisKey}
                            onValueChange={(v: ChartAxisKey) => setXAxisKey(v)}
                        >
                            <SelectTrigger
                                className="w-[120px] h-9 text-xs"
                                aria-label="Select X-Axis"
                            >
                                <SelectValue placeholder="X-Axis" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SPLINE.DISTANCE">X: Distance</SelectItem>
                                <SelectItem value="TIMESTAMP">X: Time</SelectItem>
                            </SelectContent>
                        </Select>
                        <Popover
                            open={isPresetPopoverOpen}
                            onOpenChange={setIsPresetPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-[130px] h-9 justify-start text-xs"
                                    aria-label="Open Stat Presets"
                                >
                                    <Cog className="h-4 w-4 mr-2 shrink-0" />
                                    Stat Presets
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[300px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search presets..." />
                                    <CommandEmpty>No presets found.</CommandEmpty>
                                    <CommandGroup heading="Save Current Selection">
                                        <div className="flex items-center gap-2 p-2">
                                            <Input
                                                placeholder="New preset name"
                                                value={newPresetName}
                                                onChange={(e) => setNewPresetName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") saveNewPreset();
                                                }}
                                                className="h-8 text-xs"
                                            />
                                            <Button
                                                onClick={saveNewPreset}
                                                size="sm"
                                                className="px-3 h-8 shrink-0"
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CommandGroup>
                                    <CommandList>
                                        <CommandGroup heading="Available Presets">
                                            {presets.length === 0 ? (
                                                <div className="p-2 text-center text-xs text-muted-foreground">
                                                    No presets saved
                                                </div>
                                            ) : (
                                                presets.map((preset) => (
                                                    <CommandItem
                                                        key={preset.name}
                                                        onSelect={() => {
                                                            loadPreset(preset);
                                                            setIsPresetPopoverOpen(false);
                                                        }}
                                                        className="flex justify-between items-center text-xs cursor-pointer group/item"
                                                    >
                                                        <span className="truncate">
                                                            {preset.name} ({preset.metrics.length})
                                                        </span>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-auto p-1 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deletePreset(preset.name);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="right">
                                                                <p>Delete preset</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </CommandItem>
                                                ))
                                            )}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <Popover
                            open={isMetricsPopoverOpen}
                            onOpenChange={setIsMetricsPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    role="combobox"
                                    className="max-w-[180px] h-9 justify-start text-xs"
                                    aria-label="Select Stats"
                                >
                                    <List className="h-4 w-4 mr-2 shrink-0" />
                                    Stats ({selectedMetrics.size})
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0" align="end">
                                <Command>
                                    <CommandInput placeholder="Search stats..." />
                                    <CommandEmpty>No stats found.</CommandEmpty>
                                    <CommandList className="max-h-[300px] overflow-auto">
                                        <CommandGroup>
                                            {allAvailableMetrics.map((metric) => (
                                                <CommandItem
                                                    key={metric.key}
                                                    value={metric.key}
                                                    onSelect={() => toggleMetric(metric.key)}
                                                    className="cursor-pointer text-xs group/item"
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4 shrink-0",
                                                            selectedMetrics.has(metric.key)
                                                                ? "opacity-100"
                                                                : "opacity-0",
                                                        )}
                                                    />
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className="flex items-center gap-1.5 mr-2 cursor-pointer shrink-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    triggerColorInput(metric.key);
                                                                }}
                                                            >
                                                                <div
                                                                    className="w-3 h-3 rounded-full border"
                                                                    style={{
                                                                        backgroundColor: getMetricColor(metric.key),
                                                                    }}
                                                                />
                                                                <Palette className="h-3 w-3 text-muted-foreground opacity-0 group-hover/item:opacity-100" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Change color for {metric.label}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    <span className="truncate">{metric.label}</span>
                                                    {metric.isPercentage && (
                                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                                            (%)
                                                        </span>
                                                    )}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <input
                        type="color"
                        ref={colorInputRef}
                        className="absolute w-0 h-0 opacity-0 -z-10"
                        onChange={(e) => {
                            const key = e.target.dataset.metricKey;
                            if (key) handleColorChange(key, e.target.value);
                        }}
                    />

                    {chartJsDisplayData.finalLabels.length > 0 &&
                        chartJsDisplayData.finalDatasets.length > 0 ? (
                        <>
                            <ChartJsChart
                                yRamMax={yRamMax}
                                yLeftMax={yLeftMax}
                                ref={chartComponentRef}
                                key={selectedMap + xAxisKey}
                                datasets={chartJsDisplayData.finalDatasets}
                                labels={chartJsDisplayData.finalLabels}
                                xAxisKey={xAxisKey}
                                yAxesConfig={chartJsDisplayData.yAxesConfig}
                                eventAnnotations={eventAnnotations}
                                burstAnnotations={burstAnnotations}
                                chartHeight={chartHeight}
                                onPointClick={handlePointClick}
                                fullDataForDetails={processedChartData.fullDataForDetails}
                                hiddenDatasetLabels={hiddenDatasetLabels}
                                isTooltipEnabled={isTooltipEnabled}
                                chartZoom={chartZoom}
                                setChartZoom={setChartZoom}
                            />
                            {selectedSessionMetas.length > 0 &&
                                selectedMetricMetas.length > 0 && (
                                    <div className="mt-4 border-t border-b w-[100%] ">
                                        <div
                                            className="grid overflow-x-scroll"
                                            style={{
                                                gridTemplateColumns: `max-content repeat(${selectedMetricMetas.length}, max-content)`,
                                            }}
                                        >
                                            <div
                                                className="sticky top-0 left-0 z-30 h-12 p-2 flex items-center justify-center gap-2 border-b border-r bg-muted"
                                                style={{ minWidth: "100px" }}
                                            >
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={handleShowAll}
                                                    aria-label="Show All"
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={handleHideAll}
                                                    aria-label="Hide All"
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <EyeOff className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            {selectedMetricMetas.map((metric) => {
                                                const allHidden = selectedSessionMetas.every(
                                                    (session) =>
                                                        hiddenDatasetLabels.has(
                                                            `${session.name} - ${metric.label}`,
                                                        ),
                                                );

                                                return (
                                                    <div
                                                        key={metric.key}
                                                        role="button"
                                                        tabIndex={0}
                                                        data-state={allHidden ? "hidden" : "visible"}
                                                        onClick={() => handleStatHeaderToggle(metric.key)}
                                                        onKeyDown={(e) =>
                                                            (e.key === "Enter" || e.key === " ") &&
                                                            handleStatHeaderToggle(metric.key)
                                                        }
                                                        aria-label={`Toggle all ${metric.label}`}
                                                        className={cn(
                                                            "h-12 p-3 text-xs font-semibold text-right cursor-pointer border-b border-r bg-background hover:bg-accent/80",
                                                            "flex items-center justify-center gap-1.5 min-w-[8rem]",
                                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                                            "transition-opacity data-[state=hidden]:opacity-40",
                                                        )}
                                                    >
                                                        <div
                                                            className="w-2.5 h-2.5 rounded-full border flex-none"
                                                            style={{
                                                                backgroundColor: getMetricColor(metric.key),
                                                            }}
                                                        />
                                                        <span className="truncate">{metric.label}</span>
                                                    </div>
                                                );
                                            })}

                                            {selectedSessionMetas.map((session) => (
                                                <Fragment key={session.id}>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        data-state={
                                                            selectedMetricMetas.every((m) =>
                                                                hiddenDatasetLabels.has(
                                                                    `${session.name} - ${m.label}`,
                                                                ),
                                                            )
                                                                ? "hidden"
                                                                : "visible"
                                                        }
                                                        onClick={() =>
                                                            handleSessionHeaderToggle(session.id)
                                                        }
                                                        onKeyDown={(e) =>
                                                            (e.key === "Enter" || e.key === " ") &&
                                                            handleSessionHeaderToggle(session.id)
                                                        }
                                                        aria-label={`Toggle all ${session.name}`}
                                                        className={cn(
                                                            "sticky left-0 z-20 h-12 px-3 py-2 text-xs font-medium border-b border-r bg-background flex items-center gap-1.5 cursor-pointer hover:bg-accent/80",
                                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                                            "transition-opacity data-[state=hidden]:opacity-40",
                                                        )}
                                                    >
                                                        <span className="truncate">{session.name}</span>
                                                    </div>

                                                    {selectedMetricMetas.map((metric) => {
                                                        const datasetLabel = `${session.name} - ${metric.label}`;
                                                        const isHidden =
                                                            hiddenDatasetLabels.has(datasetLabel);

                                                        return (
                                                            <div
                                                                key={`${session.id}-${metric.key}`}
                                                                role="button"
                                                                tabIndex={0}
                                                                data-state={isHidden ? "hidden" : "visible"}
                                                                onClick={() => handleLegendToggle(datasetLabel)}
                                                                onKeyDown={(e) =>
                                                                    (e.key === "Enter" || e.key === " ") &&
                                                                    handleLegendToggle(datasetLabel)
                                                                }
                                                                aria-label={`Toggle ${datasetLabel}`}
                                                                className={cn(
                                                                    "flex h-12 w-full items-center justify-center border-b border-r cursor-pointer hover:bg-accent/80",
                                                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                                                )}
                                                            >
                                                                <div
                                                                    className="w-2.5 h-2.5 rounded-full border transition-opacity data-[state=hidden]:opacity-20"
                                                                    data-state={isHidden ? "hidden" : "visible"}
                                                                    style={{
                                                                        backgroundColor: getMetricColor(
                                                                            metric.key,
                                                                        ),
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )}
                        </>
                    ) : (
                        <div
                            style={{ height: `${chartHeight}px` }}
                            className="flex w-full items-center justify-center border-2 border-dashed rounded-lg mt-4"
                        >
                            <p className="text-muted-foreground text-sm">
                                {isChartLoading
                                    ? "Loading chart data..."
                                    : selectedRunIds.size === 0 || selectedMetrics.size === 0
                                        ? "Select sessions and stats to display."
                                        : "No data available for the current selection."}
                            </p>
                        </div>
                    )}
                </div>
            </TooltipProvider>

            <Dialog open={isPointDialogOpen} onOpenChange={setIsPointDialogOpen}>
                <DialogContent className="w-auto max-w-[90vw] max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Data Point Comparison</DialogTitle>
                        <DialogDescription>
                            Details near {xAxisKey}:{" "}
                            {typeof comparisonData.pointXValue === "number"
                                ? comparisonData.pointXValue.toFixed(2)
                                : "N/A"}
                            {` (Time: ${typeof comparisonData.pointTimestamp === "number"
                                ? comparisonData.pointTimestamp.toFixed(2)
                                : "N/A"
                                }s)`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto min-h-0">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    {comparisonData.headers.map((h) => (
                                        <TableHead
                                            key={h}
                                            className={cn(
                                                "text-xs whitespace-nowrap px-2",
                                                h !== "Metric" ? "text-right" : "",
                                            )}
                                        >
                                            {h}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonData.rows.map((row) => (
                                    <TableRow key={row.metric}>
                                        <TableCell className="font-medium text-xs whitespace-nowrap px-2">
                                            {row.metric}
                                        </TableCell>
                                        {comparisonData.runIds.map((runId) => {
                                            const value = row[runId];
                                            return (
                                                <TableCell
                                                    key={runId}
                                                    className="text-right text-xs px-2"
                                                >
                                                    {typeof value === "number"
                                                        ? value.toFixed(2)
                                                        : value === true
                                                            ? "True"
                                                            : value === false
                                                                ? "False"
                                                                : value !== null && value !== undefined
                                                                    ? String(value)
                                                                    : "N/A"}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};