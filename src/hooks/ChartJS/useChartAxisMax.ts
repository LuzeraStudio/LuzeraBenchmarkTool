import { useMemo } from "react";
import type { BenchmarkSession } from "@/types/benchmark";
import type { ChartData, Point } from "chart.js";

type ChartJsDatasets = ChartData<"line", (number | Point | null)[], number | string>['datasets'];

export const useChartAxisMax = (
    sessions: BenchmarkSession[],
    selectedSessionIds: Set<string>,
    finalDatasets: ChartJsDatasets,
) => {
    const yRamMax = useMemo(() => {
        let overallMaxRam = 0;
        if (selectedSessionIds.size === 0) return undefined;

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
        return overallMaxRam > 0 ? overallMaxRam : undefined;
    }, [sessions, selectedSessionIds]);

    const yLeftMax = useMemo(() => {
        let max = -Infinity;
        let foundLeftAxis = false;

        finalDatasets.forEach((dataset) => {
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

        return (foundLeftAxis && max > -Infinity) ? (max * 1.05) : undefined;
    }, [finalDatasets]);

    return { yRamMax, yLeftMax };
};