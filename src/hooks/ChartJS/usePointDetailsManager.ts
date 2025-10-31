import { useState, useCallback, useMemo } from "react";
import type {
    PerformanceLogEntry,
    AvailableMetric,
    BenchmarkRun,
} from "@/types/benchmark";

export const usePointDetailsManager = (
    selectedRunIds: Set<string>,
    allAvailableMetrics: AvailableMetric[],
    sessionNameMap: Map<string, string>,
    runs: BenchmarkRun[],
) => {
    const [clickedPointDetails, setClickedPointDetails] =
        useState<PerformanceLogEntry | null>(null);
    const [isPointDialogOpen, setIsPointDialogOpen] = useState(false);

    const handlePointClick = useCallback(
        (dataPoint: PerformanceLogEntry | null) => {
            setClickedPointDetails(dataPoint);
            setIsPointDialogOpen(!!dataPoint);
        },
        [],
    );

    const comparisonData = useMemo(() => {
        if (!clickedPointDetails) {
            return { headers: [], rows: [], runIds: [], pointDistance: null, pointTimestamp: null };
        }
        const metricData = new Map<string, any>();

        const findPrefixedValue = (suffix: string) => {
            // Find the first key in the object that ends with the suffix
            const entry = Object.entries(clickedPointDetails).find(([key]) =>
                key.endsWith(suffix),
            );
            return entry ? entry[1] : null; // Return the value (or null if not found)
        };

        const pointDistance = findPrefixedValue(":SPLINE.DISTANCE");
        const pointTimestamp = findPrefixedValue(":TIMESTAMP");

        for (const [prefixedKey, value] of Object.entries(clickedPointDetails)) {
            const parts = prefixedKey.split(":");
            if (parts.length < 2) continue;
            const runId = parts[0];
            const metricKey = parts.slice(1).join(":");
            if (!selectedRunIds.has(runId)) continue;

            if (
                metricKey === "BURST_LOGGING_STATUS" ||
                metricKey === "TIMESTAMP" ||
                metricKey === "SPLINE.DISTANCE"
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
            { key: "metric", label: "Metric" },
            ...orderedRunIds.map((id) => ({
                key: id, // Use the run ID as the key, which is unique
                label:
                    sessionNameMap.get(runs.find((r) => r.id === id)?.sessionId || "") ||
                    "Unknown", // Use the session name as the label
            })),
        ];

        const rows = Array.from(metricData.values()).sort((a, b) =>
            a.metric.localeCompare(b.metric),
        );

        return { headers, rows, runIds: orderedRunIds, pointDistance, pointTimestamp };
    }, [
        clickedPointDetails,
        selectedRunIds,
        runs,
        sessionNameMap,
        allAvailableMetrics,
    ]);

    const pointDialogProps = {
        open: isPointDialogOpen,
        onOpenChange: setIsPointDialogOpen,
        comparisonData
    }

    return {
        handlePointClick,
        pointDialogProps,
    };
};