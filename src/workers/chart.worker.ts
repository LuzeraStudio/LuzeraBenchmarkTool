// src/workers/chart.worker.ts

/// <reference lib="webworker" />
import { LTTB } from "downsample";
import type {
  BenchmarkRun,
  ChartAxisKey,
  PerformanceLogEntry,
} from "@/types/benchmark";

// --- Types for Worker Communication ---

interface ProcessChartDataPayload {
  activeRuns: BenchmarkRun[];
  xAxisKey: ChartAxisKey;
  selectedMetricKeys: string[];
  downsampleThreshold: number;
}

interface ProcessChartDataMessage {
  type: "PROCESS_DATA";
  payload: ProcessChartDataPayload;
}

// Chart.js Point type (simplified)
interface Point { x: number; y: number | null }

// UPDATED: Output message types
interface ChartJsWorkerDataset {
  [prefixedDataKey: string]: (Point | null)[]; // Store {x, y} data per series key
}

// --- Helper Functions ---

const sortLogs = (logs: PerformanceLogEntry[], key: ChartAxisKey): void => {
  logs.sort((a, b) => (a[key] as number) - (b[key] as number));
};

const findClosestIndexBinary = (
  sortedLogs: PerformanceLogEntry[],
  targetValue: number,
  key: ChartAxisKey,
): number => {
  let low = 0;
  let high = sortedLogs.length - 1;
  let closestIndex = 0;
  let minDiff = Infinity;

  if (sortedLogs.length === 0) return -1;

  const lowValue = (sortedLogs[low]?.[key] as number) ?? -Infinity;
  const highValue = (sortedLogs[high]?.[key] as number) ?? Infinity;

  if (targetValue <= lowValue) return low;
  if (targetValue >= highValue) return high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = (sortedLogs[mid]?.[key] as number) ?? 0;
    const diff = Math.abs(midValue - targetValue);

    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = mid;
    }

    if (midValue < targetValue) {
      low = mid + 1;
    } else if (midValue > targetValue) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  // Check neighbors
  if (closestIndex > 0 && Math.abs(((sortedLogs[closestIndex - 1]?.[key] as number) ?? 0) - targetValue) < minDiff) {
    closestIndex = closestIndex - 1;
    minDiff = Math.abs(((sortedLogs[closestIndex]?.[key] as number) ?? 0) - targetValue);
  }
  if (closestIndex < sortedLogs.length - 1 && Math.abs(((sortedLogs[closestIndex + 1]?.[key] as number) ?? 0) - targetValue) < minDiff) {
    closestIndex = closestIndex + 1;
  }
  return closestIndex;
};

// Downsample function remains largely the same internally, but returns PerformanceLogEntry[]
const downsampleData = (
  data: PerformanceLogEntry[],
  xAxisKey: ChartAxisKey,
  firstValidMetricDataKey: string | undefined,
  threshold: number,
): PerformanceLogEntry[] => { // Return type is still the array of log entries
  if (data.length <= threshold) {
    return data;
  }

  if (firstValidMetricDataKey) {
    try {
      // Add original index before formatting for LTTB
      const lttbFormattedData = data.map((entry, index) => ({
        originalData: entry, // Keep original entry
        index: index,       // Store original index
        x: entry[xAxisKey] as number,
        y: (entry[firstValidMetricDataKey] ?? 0) as number, // Use first metric for Y
      }));

      // LTTB downsampling
      const downsampledPoints = LTTB(lttbFormattedData, threshold);

      // Map back to original PerformanceLogEntry using the index stored earlier
      // Ensure downsampledPoints is correctly typed or cast if necessary
      const result = (downsampledPoints as unknown as { originalData: PerformanceLogEntry }[]).map(
        (p) => p.originalData
      );
      return result;

    } catch (e) {
      console.error("LTTB Downsampling failed in worker:", e);
      const factor = Math.ceil(data.length / threshold);
      return data.filter((_, i) => i % factor === 0);
    }
  } else {
    const factor = Math.ceil(data.length / threshold);
    return data.filter((_, i) => i % factor === 0);
  }
};


// --- Main Worker Logic ---

self.onmessage = (e: MessageEvent<ProcessChartDataMessage>) => {
  if (e.data.type === "PROCESS_DATA") {
    const { activeRuns, xAxisKey, selectedMetricKeys, downsampleThreshold } =
      e.data.payload;

    try {
      if (activeRuns.length === 0) {
        self.postMessage({
          type: "DATA_READY",
          payload: { labels: [], datasets: {}, fullDataForDetails: [] },
        });
        return;
      }

      // 1. Sort logs for each run (by xAxisKey for merging AND by TIMESTAMP for events if needed later)
      activeRuns.forEach((run) => {
        if (run.performanceLogs) {
          sortLogs(run.performanceLogs, xAxisKey); // Primary sort for merging/display
        }
      });

      // --- FIX: Identify the run with the largest max X value ---
      // Helper to get the max X value from a run (since logs are sorted)
      const getLastXValue = (run: BenchmarkRun): number => {
        if (!run.performanceLogs || run.performanceLogs.length === 0) {
          return -Infinity;
        }
        const lastEntry = run.performanceLogs[run.performanceLogs.length - 1];
        const value = lastEntry[xAxisKey] as number; // Use the dynamic xAxisKey
        return (typeof value === 'number' && !isNaN(value)) ? value : -Infinity;
      };

      // Find the run with the truly largest X-axis value
      const baseRun = activeRuns.reduce((a, b) => 
        getLastXValue(a) > getLastXValue(b) ? a : b
      );
      const otherRuns = activeRuns.filter(r => r.id !== baseRun.id);
      
      // --- Store max X values for other runs for quick lookup ---
      const otherRunMaxValues = new Map<string, number>();
      otherRuns.forEach(run => {
        otherRunMaxValues.set(run.id, getLastXValue(run));
      });
      // --- END FIX ---


      // 2. Merge Data using Binary Search (Produces fullMergedData: PerformanceLogEntry[])
      const fullMergedData: PerformanceLogEntry[] = [];

      baseRun.performanceLogs.forEach((baseEntry) => {
        const mergedEntry: PerformanceLogEntry = {
          TIMESTAMP: baseEntry.TIMESTAMP,
          [xAxisKey]: baseEntry[xAxisKey],
        };
        const baseRunPrefix = baseRun.id;

        mergedEntry[`${baseRunPrefix}:TIMESTAMP`] = baseEntry.TIMESTAMP;

        // --- MODIFICATION: Add ALL available metrics, not just selected ones ---
        baseRun.availableMetrics.forEach((metric) => {
          const metricKey = metric.key;
          if (baseEntry[metricKey] !== undefined) {
            mergedEntry[`${baseRunPrefix}:${metricKey}`] = baseEntry[metricKey];
          }
        });
        // --- END MODIFICATION ---

        if (baseEntry['BURST_LOGGING_STATUS'] !== undefined) {
          mergedEntry[`${baseRunPrefix}:BURST_LOGGING_STATUS`] = baseEntry['BURST_LOGGING_STATUS'];
        }

        const baseValue = baseEntry[xAxisKey] as number;
        if (isNaN(baseValue)) return;

        otherRuns.forEach((otherRun) => {
          if (!otherRun.performanceLogs || otherRun.performanceLogs.length === 0) return;

          // --- NEW FIX: Check if baseValue is out of bounds for this otherRun ---
          const maxOtherRunX = otherRunMaxValues.get(otherRun.id) ?? -Infinity;
          if (baseValue > maxOtherRunX) {
            return; // Skip this run, will result in `null` for this point
          }
          // --- END NEW FIX ---

          const closestIndex = findClosestIndexBinary(otherRun.performanceLogs, baseValue, xAxisKey);
          if (closestIndex !== -1) {
            const closestEntry = otherRun.performanceLogs[closestIndex];
            const otherRunPrefix = otherRun.id;

            // --- MODIFICATION: Add ALL available metrics, not just selected ones ---
            otherRun.availableMetrics.forEach((metric) => {
              const metricKey = metric.key;
              if (closestEntry[metricKey] !== undefined) {
                mergedEntry[`${otherRunPrefix}:${metricKey}`] = closestEntry[metricKey];
              }
            });
            // --- END MODIFICATION ---

            // Also copy burst status if present
            if (closestEntry['BURST_LOGGING_STATUS'] !== undefined){
                 mergedEntry[`${otherRunPrefix}:BURST_LOGGING_STATUS`] = closestEntry['BURST_LOGGING_STATUS'];
            }

            // <<< FIX 3: Add prefixed TIMESTAMP for other runs
            if (closestEntry['TIMESTAMP'] !== undefined) {
                mergedEntry[`${otherRunPrefix}:TIMESTAMP`] = closestEntry['TIMESTAMP'];
            }
          }
        });
        fullMergedData.push(mergedEntry);
      });

      // Ensure fullMergedData is sorted by xAxisKey before downsampling
      sortLogs(fullMergedData, xAxisKey);


      // 3. Downsample the merged data (Produces downsampledResult: PerformanceLogEntry[])
      let firstValidMetricDataKey: string | undefined = undefined;
      // --- FIX: Use baseRun for finding the first valid key ---
      if (selectedMetricKeys.length > 0) {
        firstValidMetricDataKey = `${baseRun.id}:${selectedMetricKeys[0]}`;
      }
      const downsampledResult = downsampleData(
        fullMergedData,
        xAxisKey,
        firstValidMetricDataKey,
        downsampleThreshold,
      );

      // 4. Format data for Chart.js
      const labels = downsampledResult.map(entry => entry[xAxisKey] as number); // Assuming X is numeric
      const chartJsDatasets: ChartJsWorkerDataset = {};

      activeRuns.forEach(run => {
        selectedMetricKeys.forEach(metricKey => { // This is still correct, we only *plot* selected metrics
          const dataKey = `${run.id}:${metricKey}`;
          // Map downsampled data to {x, y} format for this specific series
          chartJsDatasets[dataKey] = downsampledResult.map(entry => {
            const yValue = entry[dataKey];
            return {
              x: entry[xAxisKey] as number,
              y: typeof yValue === 'number' ? yValue : null // Use null for gaps
            };
          });
        });
      });

      // 5. Post results back to the main thread
      self.postMessage({
        type: "DATA_READY",
        payload: {
          labels: labels,
          datasets: chartJsDatasets,
          fullDataForDetails: fullMergedData, // Send the full merged (but NOT downsampled) data
        },
      });
    } catch (error: any) {
      console.error("Error processing chart data in worker:", error);
      self.postMessage({
        type: "ERROR",
        payload: { message: error.message || "Unknown worker error" },
      });
    }
  }
};

// Export {} to make it a module (necessary for TypeScript workers)
export { };