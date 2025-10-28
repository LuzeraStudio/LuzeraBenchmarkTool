import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type {
    BenchmarkRun,
    AvailableMetric,
    ChartConfig,
    ChartAxisKey,
    Preset,
    PerformanceLogEntry,
    BenchmarkEvent,
} from "@/types/benchmark";
import { UnifiedChart } from "@/components/UnifiedChart";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Settings,
    Save,
    Check,
    ChevronsUpDown,
    ZoomIn,
    ZoomOut,
    Download,
    Palette,
    X,
    Cog,
    List,
    Copy,
    MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LTTB } from "downsample";
import html2canvas from "html2canvas";
import { useBenchmarkData } from "@/contexts/BenchmarkContext";

interface ChartControllerProps {
    runs: BenchmarkRun[];
    mapNames: string[];
    selectedMap: string;
    onMapChange: (mapName: string) => void;
}

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
const MIN_CHART_HEIGHT = 200;
const MAX_CHART_HEIGHT = 800;
const HEIGHT_STEP = 50;

// --- Default Presets ---
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

// --- downsampleData function (unchanged, omitted) ---
const downsampleData = (
    data: PerformanceLogEntry[],
    xAxisKey: ChartAxisKey,
    firstMetricKey: string | undefined,
    threshold: number,
): PerformanceLogEntry[] => {
    if (data.length <= threshold) {
        return data;
    }
    if (!firstMetricKey) {
        const factor = Math.ceil(data.length / threshold);
        return data.filter((_, i) => i % factor === 0);
    }
    try {
        const lttbFormattedData = data.map((entry) => ({
            ...entry,
            x: entry[xAxisKey] as number,
            y: (entry[firstMetricKey] || 0) as number,
        }));
        return LTTB(lttbFormattedData, threshold) as unknown as PerformanceLogEntry[];
    } catch (e) {
        console.error("LTTB Downsampling failed:", e);
        const factor = Math.ceil(data.length / threshold);
        return data.filter((_, i) => i % factor === 0);
    }
};

// Type for brush range state
interface BrushRange {
    startIndex: number | undefined;
    endIndex: number | undefined;
}

export const ChartController = ({
    runs,
    mapNames,
    selectedMap,
    onMapChange,
}: ChartControllerProps) => {
    const { toast } = useToast();
    const { sessions, deleteSession } = useBenchmarkData();

    // --- Component State (unchanged) ---
    const [isPresetPopoverOpen, setIsPresetPopoverOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [presets, setPresets] = useState<Preset[]>([]);
    const [isMetricsPopoverOpen, setIsMetricsPopoverOpen] = useState(false);
    const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);
    const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(
        {},
    );
    const [chartHeight, setChartHeight] = useState(400);
    const [xAxisKey, setXAxisKey] = useState<ChartAxisKey>("SPLINE.DISTANCE");
    const [brushRange, setBrushRange] = useState<BrushRange>({
        startIndex: undefined,
        endIndex: undefined,
    });

    // --- State for selections (unchanged) ---
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

    const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(() => {
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
        return defaults;
    });

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
        return Array.from(sessionMap.values());
    }, [runs, sessionNameMap]);

    const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
        () => new Set(uniqueSessionsInRuns.map((s) => s.id)),
    );

    useEffect(() => {
        const newSessionIds = new Set(uniqueSessionsInRuns.map((s) => s.id));
        const currentSessionIds = new Set(selectedSessionIds);
        if (
            newSessionIds.size !== currentSessionIds.size ||
            !Array.from(newSessionIds).every((id) => currentSessionIds.has(id))
        ) {
            setSelectedSessionIds(newSessionIds);
        }
        const validSelectedIds = Array.from(selectedSessionIds).filter((id) =>
            newSessionIds.has(id),
        );
        if (validSelectedIds.length !== selectedSessionIds.size) {
            setSelectedSessionIds(new Set(validSelectedIds));
        }
    }, [uniqueSessionsInRuns, selectedSessionIds]);

    const selectedRunIds = useMemo(() => {
        const runIds = new Set<string>();
        runs.forEach((run) => {
            if (selectedSessionIds.has(run.sessionId)) {
                runIds.add(run.id);
            }
        });
        return runIds;
    }, [runs, selectedSessionIds]);

    const colorInputRef = useRef<HTMLInputElement>(null);

    // --- Load/Save Presets ---
    useEffect(() => {
        const stored = localStorage.getItem(PRESETS_KEY);
        if (stored) {
            setPresets(JSON.parse(stored));
        } else {
            setPresets(defaultPresets);
        }

        const storedColors = localStorage.getItem(COLOR_OVERRIDES_KEY);
        if (storedColors) setColorOverrides(JSON.parse(storedColors));
    }, []);

    // --- Preset/Color functions ---
    const savePresets = (newPresets: Preset[]) => {
        setPresets(newPresets);
        localStorage.setItem(PRESETS_KEY, JSON.stringify(newPresets));
    };

    const saveColorOverrides = (newOverrides: Record<string, string>) => {
        setColorOverrides(newOverrides);
        localStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(newOverrides));
    };

    const getMetricColor = useCallback(
        (metricKey: string): string => {
            if (colorOverrides[metricKey]) return colorOverrides[metricKey];
            const metricIndex = allAvailableMetrics.findIndex(
                (m) => m.key === metricKey,
            );
            return CHART_COLORS[metricIndex % CHART_COLORS.length];
        },
        [colorOverrides, allAvailableMetrics],
    );
    const handleColorChange = (metricKey: string, color: string) => {
        saveColorOverrides({ ...colorOverrides, [metricKey]: color });
    };

    const triggerColorInput = (metricKey: string) => {
        if (colorInputRef.current) {
            colorInputRef.current.dataset.metricKey = metricKey;
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
        if (!newPresetName.trim()) {
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
                description: "Please select at least one metric",
                variant: "destructive",
            });
            return;
        }
        const newPreset: Preset = {
            name: newPresetName.trim(),
            metrics: Array.from(selectedMetrics),
        };
        savePresets([...presets, newPreset]);
        setNewPresetName("");
        toast({
            title: "Preset saved",
            description: `"${newPreset.name}" has been saved`,
        });
    };

    const deletePreset = (presetName: string) => {
        savePresets(presets.filter((p) => p.name !== presetName));
        toast({ title: "Preset deleted", description: `"${presetName}" removed.` });
    };

    // --- Chart Config ---
    const chartConfig = useMemo((): ChartConfig => {
        const series: ChartConfig["series"] = [];
        const allEvents: (BenchmarkEvent & { runId: string; distance: number })[] = [];
        const activeRuns = runs.filter((run) => selectedRunIds.has(run.id));

        activeRuns.forEach((run) => {
            const sessionName = sessionNameMap.get(run.sessionId) || "Unknown";
            const runPrefix = run.id;

            run.availableMetrics
                .filter((m) => selectedMetrics.has(m.key))
                .forEach((metric) => {
                    let yAxisId: "left" | "right" | "ram";
                    if (
                        metric.key.startsWith("RAM.") ||
                        (metric.key.startsWith("GPU.VRAM.") &&
                            !metric.key.includes("PERCENTAGE"))
                    ) {
                        yAxisId = "ram";
                    } else if (metric.isPercentage) {
                        yAxisId = "right";
                    } else {
                        yAxisId = "left";
                    }

                    series.push({
                        runId: run.id,
                        dataKey: `${runPrefix}:${metric.key}`,
                        name: `${sessionName} - ${metric.label}`,
                        color: getMetricColor(metric.key),
                        yAxisId: yAxisId,
                    });
                });

            // Process Events
            const runFullData = run.performanceLogs;
            // Check if runFullData is usable before mapping events
            const events = (runFullData && runFullData.length > 0 && run.events)
                ? run.events.map((event) => {
                    // Ensure event.Timestamp exists and provide a fallback number (e.g., 0)
                    const eventTimestamp = (event.Timestamp as number) ?? 0;

                    const closestEntry = runFullData.reduce((prev, curr) => {
                        // Assert prev and curr TIMESTAMPS as numbers, provide fallbacks
                        const prevTs = (prev?.TIMESTAMP as number) ?? Infinity;
                        const currTs = (curr?.TIMESTAMP as number) ?? Infinity;

                        // Perform the comparison using the guaranteed numbers
                        return Math.abs(currTs - eventTimestamp) <
                            Math.abs(prevTs - eventTimestamp)
                            ? curr
                            : prev;
                    }, runFullData[0]); // Provide initial value for reduce

                    return {
                        ...event,
                        runId: run.id,
                        // Safely access SPLINE.DISTANCE with optional chaining and fallback
                        distance: (closestEntry?.["SPLINE.DISTANCE"] as number) ?? 0,
                    };
                })
                : []; // Return an empty array if runFullData or events are missing

            allEvents.push(...events);
        });

        return {
            xAxisKey,
            series,
            events: allEvents,
        };
    }, [
        runs,
        selectedRunIds,
        selectedMetrics,
        xAxisKey,
        sessionNameMap,
        getMetricColor,
    ]);

    // --- Data Processing & Downsampling ---
    const { downsampledData, fullDataForDetails } = useMemo(() => {
        const activeRuns = runs.filter((run) => selectedRunIds.has(run.id));
        if (activeRuns.length === 0) {
            return { downsampledData: [], fullDataForDetails: [] };
        }

        const sortedActiveRuns = activeRuns.sort((a, b) =>
            a.name.localeCompare(b.name),
        );
        const baseRun = sortedActiveRuns[0];
        const otherRuns = sortedActiveRuns.slice(1);

        const fullData: PerformanceLogEntry[] = baseRun.performanceLogs.map(
            (baseEntry) => {
                const mergedEntry: PerformanceLogEntry = {
                    TIMESTAMP: baseEntry.TIMESTAMP,
                    [xAxisKey]: baseEntry[xAxisKey],
                };

                const baseRunPrefix = baseRun.id;
                for (const key in baseEntry) {
                    if (key !== "TIMESTAMP" && key !== xAxisKey) {
                        mergedEntry[`${baseRunPrefix}:${key}`] = baseEntry[key];
                    }
                }

                const baseValue = baseEntry[xAxisKey] as number;
                if (isNaN(baseValue)) return mergedEntry;

                otherRuns.forEach((otherRun) => {
                    if (
                        !otherRun.performanceLogs ||
                        otherRun.performanceLogs.length === 0
                    )
                        return;

                    const otherRunPrefix = otherRun.id;
                    const firstEntry = otherRun.performanceLogs[0];
                    const lastEntry =
                        otherRun.performanceLogs[otherRun.performanceLogs.length - 1];
                    const minX = firstEntry[xAxisKey] as number;
                    const maxX = lastEntry[xAxisKey] as number;

                    if (baseValue < minX || baseValue > maxX) {
                        return;
                    }

                    const closestEntry = otherRun.performanceLogs.reduce((prev, curr) => {
                        const prevDiff = Math.abs((prev[xAxisKey] as number) - baseValue);
                        const currDiff = Math.abs((curr[xAxisKey] as number) - baseValue);
                        return currDiff < prevDiff ? curr : prev;
                    });

                    for (const key in closestEntry) {
                        if (key !== "TIMESTAMP" && key !== xAxisKey) {
                            mergedEntry[`${otherRunPrefix}:${key}`] = closestEntry[key];
                        }
                    }
                });

                return mergedEntry;
            },
        );

        const firstMetricKey = chartConfig.series[0]?.dataKey;
        const downsampled = downsampleData(
            fullData,
            xAxisKey,
            firstMetricKey,
            DOWNSAMPLE_THRESHOLD,
        );

        return { downsampledData: downsampled, fullDataForDetails: fullData };
    }, [runs, selectedRunIds, xAxisKey, chartConfig.series]);

    // --- Export Chart Logic ---
    const exportChart = () => {
        const chartElement = document.getElementById(
            "chart-export-main-chart-sync",
        );
        const title =
            runs
                .filter((r) => selectedRunIds.has(r.id))
                .map((r) => r.name)
                .join("_vs_") || "chart";

        if (chartElement) {
            html2canvas(chartElement, { backgroundColor: null })
                .then((canvas) => {
                    const link = document.createElement("a");
                    link.download = `${title.toLowerCase().replace(/ /g, "_")}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                    toast({
                        title: "Chart Exported",
                        description: "Chart saved as PNG.",
                    });
                })
                .catch((err) => {
                    console.error("Error exporting chart:", err);
                    toast({
                        title: "Error",
                        description: "Could not export chart.",
                        variant: "destructive",
                    });
                });
        } else {
            toast({
                title: "Error",
                description: "Chart element not found.",
                variant: "destructive",
            });
        }
    };

    // --- Chart Title Logic ---
    const activeSessionNames = [
        ...new Set(
            runs
                .filter((r) => selectedRunIds.has(r.id))
                .map((r) => sessionNameMap.get(r.sessionId) || "Unknown"),
        ),
    ];
    const chartTitle = activeSessionNames.join(" vs ") || "Performance";

    const handleBrushChange = useCallback(
        (range: { startIndex?: number; endIndex?: number }) => {
            if (range.startIndex !== undefined && range.endIndex !== undefined) {
                setBrushRange({
                    startIndex: range.startIndex,
                    endIndex: range.endIndex,
                });
            }
        },
        [],
    );

    return (
        <div className="space-y-4">
            <TooltipProvider>
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-card border">
                    <div className="flex gap-2">
                        {/* --- MAP SELECTOR --- */}
                        <Select
                            value={selectedMap}
                            onValueChange={(value: string) => onMapChange(value)}
                        >
                            <SelectTrigger className="w-[180px] h-9 text-xs justify-start">
                                <MapPin className="h-4 w-4 mr-2" />
                                <span className="truncate w-full">
                                    {selectedMap || "Select a map"}
                                </span>
                            </SelectTrigger>
                            <SelectContent>
                                {mapNames.map((mapName) => (
                                    <SelectItem key={mapName} value={mapName}>
                                        {mapName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* --- SESSIONS POPOVER --- */}
                        <Popover
                            open={isSessionPopoverOpen}
                            onOpenChange={setIsSessionPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    role="combobox"
                                    className="w-[180px] h-9 justify-start"
                                >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Sessions ({selectedSessionIds.size}/
                                    {uniqueSessionsInRuns.length})
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="max-w-[500px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search sessions..." />
                                    <CommandEmpty>No sessions found for this map.</CommandEmpty>
                                    <CommandList className="max-h-[300px] overflow-auto">
                                        <CommandGroup>
                                            {uniqueSessionsInRuns.map((session) => (
                                                <CommandItem
                                                    key={session.id}
                                                    value={session.name}
                                                    onSelect={() => toggleSession(session.id)}
                                                    className="flex justify-between items-center"
                                                >
                                                    <div className="flex items-center">
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedSessionIds.has(session.id)
                                                                    ? "opacity-100"
                                                                    : "opacity-0",
                                                            )}
                                                        />
                                                        <span className="text-sm">{session.name}</span>
                                                    </div>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-auto p-1 text-muted-foreground hover:text-destructive"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteSession(session.id);
                                                                }}
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Delete session {session.name}</p>
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

                    <div className="flex gap-2">
                        {/* Vertical Zoom */}
                        <div className="flex">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setChartHeight((h) =>
                                        Math.max(MIN_CHART_HEIGHT, h - HEIGHT_STEP),
                                    )
                                }
                                disabled={chartHeight <= MIN_CHART_HEIGHT}
                                className="rounded-tr-none h-9 rounded-br-none"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setChartHeight((h) =>
                                        Math.min(MAX_CHART_HEIGHT, h + HEIGHT_STEP),
                                    )
                                }
                                disabled={chartHeight >= MAX_CHART_HEIGHT}
                                className="rounded-tl-none h-9 rounded-bl-none"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button variant="outline" size="sm" onClick={exportChart} className="h-9">
                            <Download className="h-4 w-4 mr-2" />
                            PNG
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        {/* X-Axis Select */}
                        <Select
                            value={xAxisKey}
                            onValueChange={(value: ChartAxisKey) => setXAxisKey(value)}
                        >
                            <SelectTrigger className="w-[120px] h-9 text-xs">
                                <SelectValue placeholder="X-Axis" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SPLINE.DISTANCE">X: Distance</SelectItem>
                                <SelectItem value="TIMESTAMP">X: Time</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* --- PRESET POPOVER --- */}
                        <Popover
                            open={isPresetPopoverOpen}
                            onOpenChange={setIsPresetPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-[130px] h-9 justify-start"
                                >
                                    <Cog className="h-4 w-4 mr-2" />
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
                                            />
                                            <Button
                                                onClick={saveNewPreset}
                                                size="sm"
                                                className="px-3"
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CommandGroup>
                                    <CommandList>
                                        <CommandGroup heading="Available Presets">
                                            {presets.length === 0 ? (
                                                <div className="p-2 text-center text-sm text-muted-foreground">
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
                                                        className="flex justify-between items-center"
                                                    >
                                                        <span>
                                                            {preset.name} ({preset.metrics.length})
                                                        </span>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-auto p-1 text-muted-foreground hover:text-destructive"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deletePreset(preset.name);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
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

                        {/* --- METRICS POPOVER --- */}
                        <Popover
                            open={isMetricsPopoverOpen}
                            onOpenChange={setIsMetricsPopoverOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    role="combobox"
                                    className="max-w-[180px] h-9 justify-start"
                                >
                                    <List className="h-4 w-4 mr-2" />
                                    Stats ({selectedMetrics.size})
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[500px] p-0" align="start">
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
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            selectedMetrics.has(metric.key)
                                                                ? "opacity-100"
                                                                : "opacity-0",
                                                        )}
                                                    />
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className="flex items-center gap-1.5 mr-2 cursor-pointer"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    triggerColorInput(metric.key);
                                                                }}
                                                            >
                                                                <div
                                                                    className="w-4 h-4 rounded-full border"
                                                                    style={{
                                                                        backgroundColor: getMetricColor(metric.key),
                                                                    }}
                                                                />
                                                                <Palette className="h-3 w-3 text-muted-foreground" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Change color</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    {metric.label}
                                                    {metric.isPercentage && (
                                                        <span className="text-xs text-muted-foreground ml-2">
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
                </div>
            </TooltipProvider>

            <UnifiedChart
                title={chartTitle}
                data={downsampledData}
                fullDataForDetails={fullDataForDetails}
                allRuns={runs}
                selectedRunIds={selectedRunIds}
                config={chartConfig}
                chartHeight={chartHeight}
                syncId="main-chart-sync"
                brushStartIndex={brushRange.startIndex}
                brushEndIndex={brushRange.endIndex}
                onBrushChange={handleBrushChange}
            />
        </div>
    );
};
