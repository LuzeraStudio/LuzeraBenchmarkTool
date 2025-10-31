import { useCallback } from "react";
import { useToast } from "@/hooks/useToast";
import type { ChartJsChartHandle } from "@/components/ChartJsChart";
import type {
    PerformanceLogEntry,
    ChartAxisKey,
    AvailableMetric,
    BenchmarkRun,
} from "@/types/benchmark";

export const useChartDataExtractor = (
    chartComponentRef: React.RefObject<ChartJsChartHandle | null>,
    processedData: PerformanceLogEntry[],
    xAxisKey: ChartAxisKey,
    activeRuns: BenchmarkRun[],
    sessionNameMap: Map<string, string>,
    selectedMetrics: Set<string>,
    allAvailableMetrics: AvailableMetric[],
) => {
    const { toast } = useToast();

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

        const filteredData = processedData.filter((entry) => {
            const xVal = entry[xAxisKey] as number;
            return typeof xVal === "number" && xVal >= rawMin && xVal <= rawMax;
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

                if (metricValues.some((v) => v !== "N/A")) {
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
        processedData,
        xAxisKey,
        activeRuns,
        sessionNameMap,
        selectedMetrics,
        allAvailableMetrics,
        toast,
    ]);

    return { handleExtractData };
};