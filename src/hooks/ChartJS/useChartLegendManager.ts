import { useState } from "react";
import type { AvailableMetric } from "@/types/benchmark";

interface SessionMeta {
    id: string;
    name: string;
}

export const useChartLegendManager = (
    selectedSessionMetas: SessionMeta[],
    selectedMetricMetas: AvailableMetric[],
) => {
    const [hiddenDatasetLabels, setHiddenDatasetLabels] = useState(
        new Set<string>(),
    );

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

    return {
        hiddenDatasetLabels,
        handleShowAll,
        handleHideAll,
        handleStatHeaderToggle,
        handleLegendToggle,
        handleSessionHeaderToggle,
    };
};