import { useMemo } from "react";
import type {
    ChartData,
    Chart as ChartJS,
    ChartOptions,
    InteractionItem,
    Point,
    Scale,
} from "chart.js";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
import type { ChartAxisKey, PerformanceLogEntry } from "@/types/benchmark";
import { findClosestIndexBinary } from "@/lib/utils";

interface ChartZoomState {
    xMin: number | null;
    xMax: number | null;
}

interface UseChartJsOptionsProps {
    datasets: ChartData<
        "line",
        (number | Point | null)[],
        number | string
    >["datasets"];
    chartZoom: ChartZoomState;
    setChartZoom: (zoom: ChartZoomState) => void;
    xAxisKey: ChartAxisKey;
    yAxesConfig: { left?: boolean; right?: boolean; ram?: boolean };
    yLeftMax?: number;
    yRamMax?: number;
    isTooltipEnabled: boolean;
    throttledExternalTooltipHandler: (context: any) => void;
    eventAnnotations: AnnotationOptions[];
    burstAnnotations: AnnotationOptions[];
    onPointClick: (dataPoint: PerformanceLogEntry | null) => void;
    fullDataForDetails: PerformanceLogEntry[];
    titleColor: string;
    gridColor: string;
    tickColor: string;
}

export const useChartJsOptions = ({
    datasets,
    chartZoom,
    setChartZoom,
    xAxisKey,
    yAxesConfig,
    yLeftMax,
    yRamMax,
    isTooltipEnabled,
    throttledExternalTooltipHandler,
    eventAnnotations,
    burstAnnotations,
    onPointClick,
    fullDataForDetails,
    titleColor,
    gridColor,
    tickColor,
}: UseChartJsOptionsProps): ChartOptions<"line"> => {
    return useMemo(() => {
        let xMinFound = Infinity;
        let xMaxFound = -Infinity;
        let hasData = false;

        datasets.forEach((dataset) => {
            if (dataset.data && dataset.data.length > 0) {
                const firstPoint = dataset.data[0];
                if (
                    firstPoint &&
                    typeof firstPoint === "object" &&
                    firstPoint.x !== null &&
                    typeof firstPoint.x === "number"
                ) {
                    if (firstPoint.x < xMinFound) xMinFound = firstPoint.x;
                    hasData = true;
                }

                const lastPoint = dataset.data[dataset.data.length - 1];
                if (
                    lastPoint &&
                    typeof lastPoint === "object" &&
                    lastPoint.x !== null &&
                    typeof lastPoint.x === "number"
                ) {
                    if (lastPoint.x > xMaxFound) xMaxFound = lastPoint.x;
                    hasData = true;
                }
            }
        });

        const xMin = hasData ? xMinFound : undefined;
        const xMax = hasData ? xMaxFound : undefined;

        return {
            maintainAspectRatio: false,
            responsive: true,
            animation: false,
            parsing: false,
            normalized: true,
            spanGaps: false,
            interaction: {
                mode: isTooltipEnabled ? "index" : undefined,
                intersect: isTooltipEnabled ? false : undefined,
            },
            scales: {
                x: {
                    max: chartZoom.xMax ?? xMax,
                    min: chartZoom.xMin ?? xMin,
                    type: "linear",
                    position: "bottom",
                    title: {
                        display: true,
                        text: xAxisKey === "TIMESTAMP" ? "Time (s)" : "Distance",
                        color: titleColor,
                        align: "center",
                    },
                    grid: {
                        color: gridColor,
                        drawOnChartArea: true,
                    },
                    ticks: {
                        color: tickColor,
                        maxRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 30,
                        callback: function (value) {
                            if (typeof value === "number") {
                                return value.toFixed(1);
                            }
                            return value;
                        },
                    },
                },
                ...(yAxesConfig.left && {
                    yLeft: {
                        id: "yLeft",
                        type: "linear",
                        position: "left",
                        min: 0,
                        max: yLeftMax,
                        title: { display: true, text: "Value", color: titleColor },
                        grid: { color: gridColor, drawOnChartArea: true },
                        ticks: { color: tickColor },
                    },
                }),
                ...(yAxesConfig.right && {
                    yRight: {
                        id: "yRight",
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "Percentage (%)", color: titleColor },
                        min: 0,
                        max: 100,
                        grid: { drawOnChartArea: false },
                        ticks: { color: tickColor },
                    },
                }),
                ...(yAxesConfig.ram && {
                    yRam: {
                        id: "yRam",
                        type: "linear",
                        position: "right",
                        min: 0,
                        max: yRamMax,
                        title: { display: true, text: "RAM / VRAM (MB)", color: titleColor },
                        grid: { drawOnChartArea: false },
                        ticks: { color: tickColor },
                    },
                }),
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                    mode: "index",
                    intersect: false,
                    position: "average",
                    external: throttledExternalTooltipHandler,
                },
                zoom: {
                    limits: {
                        x: { min: xMin, max: xMax },
                        yLeft: { min: 0, max: yLeftMax },
                        yRight: { min: 0, max: 100 },
                        yRam: { min: 0, max: yRamMax },
                    },
                    pan: {
                        enabled: true,
                        mode: "x",
                        threshold: 5,
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "x",
                    },
                    onZoomComplete: ({ chart }: { chart: ChartJS }) => {
                        setChartZoom({
                            xMin: chart.scales.x.min,
                            xMax: chart.scales.x.max,
                        });
                    },
                    onPanComplete: ({ chart }: { chart: ChartJS }) => {
                        setChartZoom({
                            xMin: chart.scales.x.min,
                            xMax: chart.scales.x.max,
                        });
                    },
                },
                annotation: {
                    annotations: [...eventAnnotations, ...burstAnnotations],
                },
            },
            onClick: (event, elements: InteractionItem[], chart: ChartJS) => {
                const findDataPoint = (clickedXValue: number | undefined) => {
                    if (
                        clickedXValue === undefined ||
                        clickedXValue === null ||
                        isNaN(clickedXValue)
                    ) {
                        return null;
                    }

                    const sortedXValues = fullDataForDetails
                        .map((d) => d[xAxisKey] as number)
                        .filter((v) => typeof v === "number");
                    const closestDataIndex = findClosestIndexBinary(
                        sortedXValues,
                        clickedXValue,
                        (val) => val,
                    );
                    const targetX = sortedXValues[closestDataIndex];
                    return (
                        fullDataForDetails.find(
                            (d) => (d[xAxisKey] as number) === targetX,
                        ) || null
                    );
                };

                let clickedXValue: number | undefined;

                if (!chart || elements.length === 0) {
                    const canvas = chart.canvas;
                    const rect = canvas.getBoundingClientRect();
                    const xPixel = event.x! - rect.left;
                    const xScale = chart.scales["x"] as Scale | undefined;
                    if (!xScale) {
                        onPointClick(null);
                        return;
                    }
                    clickedXValue = xScale.getValueForPixel(xPixel);
                } else {
                    const firstElement = elements[0];
                    const index = firstElement.index;
                    clickedXValue = chart.data.labels
                        ? (chart.data.labels[index] as number)
                        : undefined;
                }

                const dataPoint = findDataPoint(clickedXValue);
                onPointClick(dataPoint);
            },
        };
    }, [
        datasets,
        chartZoom,
        setChartZoom,
        xAxisKey,
        yAxesConfig,
        yLeftMax,
        yRamMax,
        isTooltipEnabled,
        throttledExternalTooltipHandler,
        eventAnnotations,
        burstAnnotations,
        onPointClick,
        fullDataForDetails,
        titleColor,
        gridColor,
        tickColor,
    ]);
};