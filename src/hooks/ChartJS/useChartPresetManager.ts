import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/useToast";
import type { Preset, AvailableMetric } from "@/types/benchmark";
import { getComputedColor } from "@/lib/colorUtils";

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

export const useChartPresetManager = (
    allAvailableMetrics: AvailableMetric[],
    setSelectedMetrics: (metrics: Set<string>) => void,
    selectedMetrics: Set<string>
) => {
    const { toast } = useToast();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [newPresetName, setNewPresetName] = useState("");
    const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
    const [isPresetPopoverOpen, setIsPresetPopoverOpen] = useState(false);
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

    const getMetricColor = useCallback(
        (metricKey: string): string => {
            const override = colorOverrides[metricKey];
            if (override) return override;

            const metricIndex = allAvailableMetrics.findIndex((m) => m.key === metricKey);
            if (metricIndex === -1 || CHART_COLORS.length === 0) {
                return getComputedColor("hsl(var(--primary))") || "#8884d8";
            }
            return getComputedColor(CHART_COLORS[metricIndex % CHART_COLORS.length]);
        },
        [colorOverrides, allAvailableMetrics],
    );

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

    const loadPreset = (preset: Preset) => {
        const validMetrics = preset.metrics.filter((m) =>
            allAvailableMetrics.some((am) => am.key === m),
        );
        setSelectedMetrics(new Set(validMetrics));
        toast({ title: "Preset loaded", description: `Loaded "${preset.name}"` });
        setIsPresetPopoverOpen(false);
    };

    const saveNewPreset = () => {
        const name = newPresetName.trim();
        if (!name) {
            toast({ title: "Error", description: "Please enter a preset name", variant: "destructive" });
            return;
        }
        if (selectedMetrics.size === 0) {
            toast({ title: "Error", description: "Select at least one metric", variant: "destructive" });
            return;
        }
        if (presets.some((p) => p.name === name)) {
            toast({ title: "Error", description: `Preset "${name}" already exists`, variant: "destructive" });
            return;
        }
        const newPreset: Preset = { name, metrics: Array.from(selectedMetrics) };
        const updatedPresets = [...presets, newPreset].sort((a, b) => a.name.localeCompare(b.name));
        savePresets(updatedPresets);
        setNewPresetName("");
        toast({ title: "Preset saved", description: `"${name}" saved` });
    };

    const deletePreset = (presetName: string) => {
        const updatedPresets = presets.filter((p) => p.name !== presetName);
        savePresets(updatedPresets);
        toast({ title: "Preset deleted", description: `"${presetName}" removed.` });
    };

    return {
        presets,
        newPresetName,
        setNewPresetName,
        isPresetPopoverOpen,
        setIsPresetPopoverOpen,
        loadPreset,
        saveNewPreset,
        deletePreset,
        getMetricColor,
        handleColorChange,
        triggerColorInput,
        colorInputRef,
    };
};