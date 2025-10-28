import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
    PerformanceLogEntry,
    ChartConfig,
    BenchmarkRun,
} from "@/types/benchmark";
import { useState, useMemo } from "react";
import {
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Brush,
    ComposedChart,
    Area,
    type LegendType,
    type LegendPayload
} from "recharts";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface UnifiedChartProps {
    title: string;
    data: any[];
    fullDataForDetails: any[];
    allRuns: BenchmarkRun[];
    selectedRunIds: Set<string>;
    config: ChartConfig;
    chartHeight: number;
    syncId: string;
    brushStartIndex: number | undefined;
    brushEndIndex: number | undefined;
    onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void;
}

export const UnifiedChart = ({
    title,
    data,
    allRuns,
    selectedRunIds,
    config,
    chartHeight,
    syncId,
    brushStartIndex,
    brushEndIndex,
    onBrushChange,
}: UnifiedChartProps) => {
    const [clickedPoint, setClickedPoint] = useState<PerformanceLogEntry | null>(
        null,
    );
    const [isPointDialogOpen, setIsPointDialogOpen] = useState(false);

    // Memoize which axes are needed
    const { hasLeftAxis, hasRightAxis, hasRamAxis } = useMemo(() => {
        const hasLeft = config.series.some((s) => s.yAxisId === "left");
        const hasRight = config.series.some((s) => s.yAxisId === "right");
        const hasRam = config.series.some((s) => s.yAxisId === "ram");

        const hasBurst = allRuns.some(
            (run) =>
                run.performanceLogs.length > 0 &&
                run.performanceLogs[0]["BURST_LOGGING_STATUS"] !== undefined,
        );

        return {
            hasLeftAxis: hasLeft,
            hasRightAxis: hasRight || hasBurst,
            hasRamAxis: hasRam,
        };
    }, [config.series, allRuns]);

    // chartDataWithBurst
    const chartDataWithBurst = useMemo(() => {
        return data.map((entry) => {
            const isBursting = Object.keys(entry).some(
                (key) =>
                    key.endsWith(":BURST_LOGGING_STATUS") &&
                    (entry[key] === true || entry[key] === "true"),
            );
            return {
                ...entry,
                burstHighlight: isBursting ? 100 : 0,
            };
        });
    }, [data]);

    const handleChartClick = (e: any) => {
        if (!e || e.activeLabel === undefined || e.activeLabel === null) return;

        const clickedXValue = e.activeLabel as number;
        const activeRuns = allRuns.filter((r) => selectedRunIds.has(r.id));

        const mergedPoint: PerformanceLogEntry = {
            [config.xAxisKey]: clickedXValue,
        };
        let lastTimestamp = 0;

        activeRuns.forEach((run) => {
            if (!run.performanceLogs || run.performanceLogs.length === 0) return;

            const firstEntry = run.performanceLogs[0];
            const lastEntry = run.performanceLogs[run.performanceLogs.length - 1];
            const minX = firstEntry[config.xAxisKey] as number;
            const maxX = lastEntry[config.xAxisKey] as number;

            if (clickedXValue < minX || clickedXValue > maxX) return;

            const closestEntry = run.performanceLogs.reduce((prev, curr) => {
                const prevDiff = Math.abs(
                    (prev[config.xAxisKey] as number) - clickedXValue,
                );
                const currDiff = Math.abs(
                    (curr[config.xAxisKey] as number) - clickedXValue,
                );
                return currDiff < prevDiff ? curr : prev;
            });

            lastTimestamp = closestEntry.TIMESTAMP as number;

            Object.keys(closestEntry).forEach((key) => {
                mergedPoint[`${run.id}:${key}`] = closestEntry[key];
            });
        });

        mergedPoint.TIMESTAMP = lastTimestamp;
        setClickedPoint(mergedPoint);
        setIsPointDialogOpen(true);
    };

    const customLegendPayload = useMemo((): LegendPayload[] => {
        const linePayloads: LegendPayload[] = config.series.map((series) => ({
            value: series.name,
            type: "line" as LegendType,
            id: series.dataKey,
            color: series.color,
        }));

        const hasBurstData = allRuns.some(
            (run) =>
                run.performanceLogs.length > 0 &&
                run.performanceLogs[0]["BURST_LOGGING_STATUS"] !== undefined,
        );

        if (hasBurstData && hasRightAxis) {
            linePayloads.push({
                value: "Burst Logging",
                type: "square",
                id: "burstHighlight",
                color: "hsl(var(--destructive))",
            });
        }

        return linePayloads;
    }, [config.series, allRuns, hasRightAxis]);

    const comparisonData = useMemo(() => {
        if (!clickedPoint) {
            return { headers: [], rows: [], runIds: [] };
        }

        const metricData = new Map<string, any>();
        const runIdsInPoint = new Set<string>();

        for (const [prefixedKey, value] of Object.entries(clickedPoint)) {
            const parts = prefixedKey.split(":");
            if (parts.length < 2) continue;

            const runId = parts[0];
            const metricKey = parts.slice(1).join(":");

            runIdsInPoint.add(runId);

            if (!metricData.has(metricKey)) {
                metricData.set(metricKey, {
                    metric: metricKey.replace(/\./g, " "),
                });
            }

            const row = metricData.get(metricKey)!;
            row[runId] = value;
        }

        const orderedRunIds = Array.from(selectedRunIds);

        const getRobustSessionName = (runId: string): string => {
            const series = config.series.find((s) => s.runId === runId);
            if (series) {
                return series.name.split(" - ")[0] || "Unknown Run";
            }
            const run = allRuns.find((r) => r.id === runId);
            if (run) {
                 return `Session ${run.sessionId.slice(-4)}`;
            }
            return "Unknown";
        };

        const headers = [
            "Metric",
            ...orderedRunIds.map((id) => getRobustSessionName(id)),
        ];

        const rows = Array.from(metricData.values()).sort((a, b) =>
            a.metric.localeCompare(b.metric),
        );

        return { headers, rows, runIds: orderedRunIds };
    }, [clickedPoint, config, allRuns, selectedRunIds]); // Added selectedRunIds

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {chartDataWithBurst.length === 0 ? (
                    <div
                        style={{ height: `${chartHeight}px` }}
                        className="flex items-center justify-center border-2 border-dashed rounded-lg"
                    >
                        <p className="text-muted-foreground">No data to display</p>
                    </div>
                ) : (
                    <div id={`chart-export-${syncId}`}>
                        <ResponsiveContainer width="100%" height={chartHeight}>
                            <ComposedChart
                                data={chartDataWithBurst}
                                onClick={handleChartClick}
                                margin={{ top: 30, right: 20, left: 0, bottom: 35 }}
                                syncId={syncId}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    className="stroke-border"
                                />

                                <XAxis
                                    dataKey={config.xAxisKey}
                                    label={{
                                        value:
                                            config.xAxisKey === "TIMESTAMP" ? "Time (s)" : "Distance",
                                        position: "insideBottom",
                                        offset: -5,
                                    }}
                                    className="text-xs"
                                    type="number"
                                    domain={["dataMin", "dataMax"]}
                                    tickFormatter={(value) =>
                                        typeof value === "number" ? value.toFixed(1) : value
                                    }
                                />

                                {hasLeftAxis && (
                                    <YAxis
                                        yAxisId="left"
                                        label={{
                                            value: "Value",
                                            angle: -90,
                                            position: "insideLeft",
                                        }}
                                        className="text-xs"
                                    />
                                )}
                                {hasRightAxis && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        label={{
                                            value: "Percentage (%)",
                                            angle: 90,
                                            position: "outsideRight",
                                        }}
                                        className="text-xs"
                                        domain={[0, 100]}
                                    />
                                )}
                                {hasRamAxis && (
                                    <YAxis
                                        yAxisId="ram"
                                        orientation="right"
                                        label={{
                                            value: "RAM / VRAM (MB)",
                                            angle: 90,
                                            position: "insideRight", // Will be outermost right
                                        }}
                                        className="text-xs"
                                        domain={["auto", "auto"]} // Auto-scale for RAM
                                    />
                                )}

                                <Tooltip
                                    content={
                                        <CustomTooltip
                                            xAxisLabel={
                                                config.xAxisKey === "TIMESTAMP"
                                                    ? "Timestamp"
                                                    : "Distance"
                                            }
                                        />
                                    }
                                    isAnimationActive={false}
                                />

                                {config.series.length > 0 && (
                                    <Legend payload={customLegendPayload} />
                                )}

                                {hasRightAxis && (
                                    <Area
                                        type="stepAfter"
                                        dataKey="burstHighlight"
                                        fill="hsla(0, 100%, 50%, 0.15)"
                                        stroke="none"
                                        yAxisId="right"
                                        isAnimationActive={false}
                                        name="Burst Logging"
                                    />
                                )}

                                {config.series.map((metric) => (
                                    <Line
                                        key={metric.dataKey}
                                        type="monotone"
                                        dataKey={metric.dataKey}
                                        stroke={metric.color}
                                        name={metric.name}
                                        dot={false}
                                        strokeWidth={2}
                                        yAxisId={metric.yAxisId}
                                        isAnimationActive={false}
                                        connectNulls={false}
                                    />
                                ))}

                                {(hasLeftAxis || hasRightAxis) &&
                                    config.events.map((event, idx) => (
                                        <ReferenceLine
                                            key={idx}
                                            x={
                                                config.xAxisKey === "TIMESTAMP"
                                                    ? event.Timestamp
                                                    : event.distance
                                            }
                                            stroke="hsl(var(--destructive))"
                                            strokeDasharray="4 8"
                                            strokeWidth={2}
                                            yAxisId={hasLeftAxis ? "left" : "right"}
                                            label={{
                                                value: event.EventName,
                                                position: "top",
                                                offset: 5,
                                                fill: "hsl(var(--destructive))",
                                                fontSize: 14,
                                            }}
                                        />
                                    ))}

                                <Brush
                                    data={chartDataWithBurst}
                                    dataKey={config.xAxisKey}
                                    height={30}
                                    stroke="hsl(var(--primary))"
                                    y={chartHeight - 30}
                                    travellerWidth={10}
                                    startIndex={brushStartIndex}
                                    endIndex={brushEndIndex}
                                    onChange={onBrushChange}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>

            {/* Point Details Dialog */}
            <Dialog open={isPointDialogOpen} onOpenChange={setIsPointDialogOpen}>
                <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Data Point Comparison</DialogTitle>
                        <DialogDescription>
                            All metrics at {config.xAxisKey}:{" "}
                            {clickedPoint?.[config.xAxisKey]?.toFixed(2)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto min-h-0">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    {comparisonData.headers.map((header) => (
                                        <TableHead
                                            key={header}
                                            className={header !== "Metric" ? "text-right" : ""}
                                        >
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonData.rows.map((row) => (
                                    <TableRow key={row.metric}>
                                        <TableCell className="font-medium">{row.metric}</TableCell>
                                        {/* This loop now correctly renders N/A for missing data */}
                                        {comparisonData.runIds.map((runId) => {
                                            const value = row[runId];
                                            return (
                                                <TableCell key={runId} className="text-right">
                                                    {typeof value === "number"
                                                        ? value.toFixed(2)
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
        </Card>
    );
};

// Custom Tooltip
const CustomTooltip = ({ active, payload, label, xAxisLabel }: any) => {
    if (active && payload && payload.length) {

        const metrics = new Map<string, any>();
        const sessionNames = new Set<string>();
        let hasBurst = false;

        payload.forEach((pld: any) => {
            if (pld.dataKey === "burstHighlight") {
                if (pld.value === 100) {
                    hasBurst = true;
                }
                return;
            }
            if (pld.value === undefined || pld.value === null) {
                return;
            }

            const parts = pld.name.split(" - ");
            const sessionName = parts[0] || "Unknown";
            const metricLabel = parts.slice(1).join(" - ") || pld.dataKey;

            sessionNames.add(sessionName);

            if (!metrics.has(metricLabel)) {
                metrics.set(metricLabel, {});
            }

            const metricRow = metrics.get(metricLabel)!;
            metricRow[sessionName] = {
                value: pld.value,
                color: pld.stroke || pld.color,
            };
        });

        const orderedSessions = Array.from(sessionNames);
        const orderedMetrics = Array.from(metrics.keys()).sort();

        return (
            <div className="bg-background border border-border p-3 rounded-md shadow-lg min-w-[200px]">
                <p className="font-semibold mb-2">{`${xAxisLabel}: ${label?.toFixed(2) ?? "N/A"}`}</p>

                {hasBurst && (
                    <p
                        style={{ color: "hsl(var(--destructive))" }}
                        className="font-semibold text-sm"
                    >
                        Burst Logging: true
                    </p>
                )}

                <table
                    className="w-full text-xs"
                    style={{ borderCollapse: "separate", borderSpacing: "0 4px" }}
                >
                    <thead>
                        <tr>
                            <th className="text-left font-medium text-muted-foreground pr-2">
                                Metric
                            </th>
                            {orderedSessions.map((session) => (
                                <th
                                    key={session}
                                    className="text-right font-medium text-muted-foreground px-2"
                                >
                                    {session}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {orderedMetrics.map((metricLabel) => {
                            const metricRow = metrics.get(metricLabel)!;
                            return (
                                <tr key={metricLabel}>
                                    <td className="text-left font-semibold pr-2">
                                        {metricLabel}
                                    </td>
                                    {orderedSessions.map((session) => {
                                        const data = metricRow[session];
                                        return (
                                            <td
                                                key={session}
                                                className="text-right font-semibold px-2"
                                                style={{ color: data?.color || "inherit" }}
                                            >
                                                {data ? data.value.toFixed(2) : "N/A"}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }
    return null;
};
