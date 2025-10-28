// All data is row-oriented as it comes from the parser worker
export type PerformanceLogEntry = Record<string, number | string | boolean>;
export type StaticData = Record<string, string>;
export type Event = Record<string, any>; // Keep flexible

/**
 * A single benchmark run, typically from one log file.
 * This is the core data structure for a single analysis.
 */
export interface BenchmarkRun {
  id: string; // Unique ID, e.g., filename
  sessionId: string; // ID of the session this run belongs to
  name: string; // Display name
  performanceLogs: PerformanceLogEntry[];
  events: Event[];
  // This will hold all column headers found in the performance log
  availableMetrics: AvailableMetric[];
}

/**
 * Represents a metric available for plotting.
 */
export interface AvailableMetric {
  key: string;
  label: string;
  isPercentage: boolean;
}

/**
 * The top-level data structure for a single imported session.
 * It holds static data and a map of all benchmark runs, keyed by map name.
 */
export interface BenchmarkSession {
  sessionId: string;
  sessionName: string;
  staticData: StaticData | null;
  maps: Record<string, BenchmarkRun[]>; // Key is map name
}

// --- Chart Configuration Types ---

export type ChartAxisKey = "SPLINE.DISTANCE" | "TIMESTAMP";

/**
 * Defines a single series (e.g., a line) to be plotted.
 */
export interface ChartSeriesConfig {
  runId: string; // Which run this data comes from
  dataKey: string; // e.g., "run1_id:FPS.CURRENT"
  name: string; // e.g., "Session 10 - Run 1 - FPS"
  color: string;
  yAxisId: "left" | "right" | "ram";
}

/**
 * The complete configuration object passed to the "dumb" UnifiedChart.
 */
export interface ChartConfig {
  xAxisKey: ChartAxisKey;
  series: ChartSeriesConfig[];
  // We need to map events to their original run for consistency
  events: (Event & { runId: string; distance: number })[];
}

/**
 * Defines a user-saved preset.
 * Note: It just saves keys. The runId will be applied at load time.
 */
export interface Preset {
  name: string;
  metrics: string[]; // Just the metric keys, e.g., "FPS.CURRENT"
}
