// src/components/ChartController.tsx
import { useState, useMemo, useEffect, useRef, Fragment, } from "react";
// --- Chart.js Imports ---
import { ChartJsChart, type ChartJsChartHandle } from "./ChartJsChart";
import type { ChartData, Point } from "chart.js";
// --- UI Components ---
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger, } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/components/ui/tooltip";
import { PointDetailsDialog } from "./PointDetailsDialog";
// --- Icons ---
import { Save, Check, ZoomIn, ZoomOut, Palette, X, Cog, List, Copy, MapPin, Eye, EyeOff, StretchVertical, ClipboardCopy, } from "lucide-react";
// --- Hooks ---
import { useBenchmarkData } from "@/contexts/BenchmarkContext";
import { useChartSettings, MIN_CHART_HEIGHT, MAX_CHART_HEIGHT, HEIGHT_STEP } from "@/contexts/ChartSettingsContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useBenchmarkSelection } from "@/hooks/ChartJS/useBenchmarkSelection";
import { useChartDataManager } from "@/hooks/ChartJS/useChartDataManager";
import { useChartPresetManager } from "@/hooks/ChartJS/useChartPresetManager";
import { useChartLegendManager } from "@/hooks/ChartJS/useChartLegendManager";
import { usePointDetailsManager } from "@/hooks/ChartJS/usePointDetailsManager";
import { useChartDataExtractor } from "@/hooks/ChartJS/useChartDataExtractor";
import { useChartAxisMax } from "@/hooks/ChartJS/useChartAxisMax";
// --- Other ---
import type { BenchmarkRun, ChartAxisKey } from "@/types/benchmark";
import { cn } from "@/lib/utils";

interface ChartControllerProps {
    runs: BenchmarkRun[];
    mapNames: string[];
}

export const ChartController = ({
    runs,
    mapNames,
}: ChartControllerProps) => {
    // --- Core Contexts ---
    const { theme } = useTheme();
    const { sessions } = useBenchmarkData();
    const chartSettings = useChartSettings();
    const { selectedMap, setSelectedMap, xAxisKey, setXAxisKey, selectedMetrics, setSelectedMetrics, isTooltipEnabled, setIsTooltipEnabled, chartHeight, setChartHeight, chartZoom, setChartZoom, } = chartSettings;
    const chartComponentRef = useRef<ChartJsChartHandle>(null);
    const [debouncedTheme, setDebouncedTheme] = useState(theme);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedTheme(theme);
        }, 0);
        return () => clearTimeout(timer);
    }, [theme]);

    // --- 1. Selection & Data Derivation ---
    const { allAvailableMetrics, sessionNameMap, uniqueSessionsInRuns, selectedMetricMetas, selectedSessionMetas, activeRuns, toggleMetric, toggleSession, handleDeleteSession, } = useBenchmarkSelection(runs, sessions, chartSettings);
    const selectedRunIds = useMemo(() => new Set(activeRuns.map(run => run.id)), [
        activeRuns,
    ]);
    // --- 2. Preset & Color Management ---
    const { presets, newPresetName, setNewPresetName, isPresetPopoverOpen, setIsPresetPopoverOpen, loadPreset, saveNewPreset, deletePreset, getMetricColor, handleColorChange, triggerColorInput, colorInputRef, } = useChartPresetManager(allAvailableMetrics, setSelectedMetrics, selectedMetrics);

    // --- 3. Chart Data Processing (Worker) ---
    const { isChartLoading, processedChartData, eventAnnotations, burstAnnotations, } = useChartDataManager(activeRuns, xAxisKey, selectedMetrics, debouncedTheme);

    // --- 4. Legend Visibility ---
    const { hiddenDatasetLabels, handleShowAll, handleHideAll, handleStatHeaderToggle, handleLegendToggle, handleSessionHeaderToggle, } = useChartLegendManager(selectedSessionMetas, selectedMetricMetas);

    // --- 5. Point Details Dialog ---
    const { handlePointClick, pointDialogProps } = usePointDetailsManager(
        selectedRunIds, allAvailableMetrics, sessionNameMap, runs);

    // --- 6. Data Extractor ---
    const { handleExtractData } = useChartDataExtractor(
        chartComponentRef, processedChartData.fullDataForDetails, xAxisKey, activeRuns, sessionNameMap, selectedMetrics, allAvailableMetrics,);

    // --- 7. Chart Data & Axis Calculation ---
    const chartJsDisplayData = useMemo(() => {
        const { labels, datasets: workerDatasets } = processedChartData;
        if (!labels || labels.length === 0 || !workerDatasets || Object.keys(workerDatasets).length === 0) {
            return { finalLabels: [], finalDatasets: [], yAxesConfig: {} };
        }

        const finalDatasets: ChartData<"line", (number | Point | null)[], number | string>['datasets'] = [];
        const yAxesConfig: { left?: boolean; right?: boolean; ram?: boolean } = {};

        activeRuns.forEach((run) => {
            const sessionName = sessionNameMap.get(run.sessionId) || "Unknown";
            selectedMetrics.forEach((metricKey) => {
                const dataKey = `${run.id}:${metricKey}`;
                const metricMeta = allAvailableMetrics.find((m) => m.key === metricKey);

                if (metricMeta && workerDatasets[dataKey]) {
                    let yAxisID: "yLeft" | "yRight" | "yRam";
                    if (metricKey.startsWith("RAM.") || (metricKey.startsWith("GPU.VRAM.") && !metricKey.includes("PERCENTAGE"))) {
                        yAxisID = "yRam"; yAxesConfig.ram = true;
                    } else if (metricMeta.isPercentage) {
                        yAxisID = "yRight"; yAxesConfig.right = true;
                    } else {
                        yAxisID = "yLeft"; yAxesConfig.left = true;
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
        processedChartData,
        activeRuns,
        selectedMetrics,
        sessionNameMap,
        allAvailableMetrics,
        getMetricColor,
        debouncedTheme,
    ]);

    const { yRamMax, yLeftMax } = useChartAxisMax(
        sessions,
        chartSettings.selectedSessionIds,
        chartJsDisplayData.finalDatasets,
    );

    // --- Local UI State (Popovers) ---
    const [isMetricsPopoverOpen, setIsMetricsPopoverOpen] = useState(false);
    const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);

    // --- Effects ---
    useEffect(() => {
        chartComponentRef.current?.resetZoom();
    }, [selectedMap, xAxisKey]);

    // --- JSX Rendering ---
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
                {/* Controls Bar */}
                <div className="flex flex-wrap items-start justify-between gap-2 p-2 rounded-lg bg-card border sticky top-[73px] z-20">
                    {/* Left Side: Map and Sessions */}
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
                                    Sessions ({selectedSessionMetas.length}/
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
                                                                chartSettings.selectedSessionIds.has(session.id)
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

                    {/* Center: Zoom and Export */}
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

                    {/* Right Side: Axis, Presets, Metrics */}
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
                                                        onSelect={() => loadPreset(preset)}
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
                    {/* Hidden color input */}
                    <input
                        type="color"
                        ref={colorInputRef}
                        className="absolute w-0 h-0 opacity-0 -z-10"
                        onChange={(e) => {
                            const key = e.target.dataset.metricKey;
                            if (key) handleColorChange(key, e.target.value);
                        }}
                    />

                    {/* Chart */}
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
                            {/* Legend */}
                            {selectedSessionMetas.length > 0 &&
                                selectedMetricMetas.length > 0 && (
                                    <div className="mt-4 border-t border-b w-[100%] ">
                                        <div
                                            className="grid overflow-x-scroll"
                                            style={{
                                                gridTemplateColumns: `max-content repeat(${selectedMetricMetas.length}, max-content)`,
                                            }}
                                        >
                                            {/* Corner Cell */}
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

                                            {/* Stat Header Cells */}
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

                                            {/* Data Rows */}
                                            {selectedSessionMetas.map((session) => (
                                                <Fragment key={session.id}>
                                                    {/* Session Name Cell */}
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

                                                    {/* Toggle Cells */}
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
                                    : activeRuns.length === 0 || selectedMetrics.size === 0
                                        ? "Select sessions and stats to display."
                                        : "No data available for the current selection."}
                            </p>
                        </div>
                    )}
                </div>
            </TooltipProvider>

            {/* Point Details Dialog */}
            <PointDetailsDialog {...pointDialogProps} />
        </div>
    );
};