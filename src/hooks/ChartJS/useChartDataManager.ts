import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/hooks/useToast";
import type {
    BenchmarkRun,
    ChartAxisKey,
    PerformanceLogEntry,
    BenchmarkEvent,
} from "@/types/benchmark";
import { getComputedColor } from "@/lib/colorUtils";
import { findClosestIndexBinary } from "@/lib/utils";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
import type { Point } from "chart.js";

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

const DOWNSAMPLE_THRESHOLD = 2000;

export const useChartDataManager = (
    activeRuns: BenchmarkRun[],
    xAxisKey: ChartAxisKey,
    selectedMetrics: Set<string>,
    theme: string,
) => {
    const { toast } = useToast();
    const chartWorkerRef = useRef<Worker | null>(null);
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [processedChartData, setProcessedChartData] =
        useState<ChartDataResult>({
            labels: [],
            datasets: {},
            fullDataForDetails: [],
        });

    // Initialize and manage worker lifecycle
    useEffect(() => {
        chartWorkerRef.current = new Worker(
            new URL("@/workers/chart.worker.ts", import.meta.url),
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

    // Trigger worker processing
    useEffect(() => {
        if (
            chartWorkerRef.current &&
            activeRuns.length > 0 &&
            selectedMetrics.size > 0
        ) {
            setIsChartLoading(true);
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
        } else if (activeRuns.length === 0 || selectedMetrics.size === 0) {
            setProcessedChartData({
                labels: [],
                datasets: {},
                fullDataForDetails: [],
            });
            setIsChartLoading(false);
        }
    }, [activeRuns, xAxisKey, selectedMetrics, toast]);

    // Process annotations
    const { eventAnnotations, burstAnnotations } = useMemo(() => {
        const eventColor = getComputedColor("hsl(var(--destructive))");
        const burstColor = "rgba(255, 0, 0, 0.1)";

        const events: AnnotationOptions[] = [];
        const bursts: AnnotationOptions[] = [];
        const fullData = processedChartData.fullDataForDetails;

        const allEventsMapped: (BenchmarkEvent & {
            runId: string;
            xValue?: number;
        })[] = [];
        activeRuns.forEach((run) => {
            if (!run.events || run.events.length === 0 || !run.performanceLogs || run.performanceLogs.length === 0)
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
                } else if (timeMap.length > 0) {
                    const closestIndex = findClosestIndexBinary(
                        timeMap,
                        eventTimestamp,
                        (item) => item.time,
                    );
                    eventXValue = timeMap[closestIndex]?.x;
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
        const runIds = new Set(activeRuns.map(r => r.id));
        fullData.forEach((entry, index) => {
            const isBursting = Array.from(runIds).some((runId) => {
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
    }, [processedChartData.fullDataForDetails, activeRuns, xAxisKey, theme]); // Rerun on theme change for colors

    return {
        isChartLoading,
        processedChartData,
        eventAnnotations,
        burstAnnotations,
    };
};