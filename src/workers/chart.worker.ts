/// <reference lib="webworker" />
import { LTTB } from "downsample";
import type {
  BenchmarkRun,
  ChartAxisKey,
  PerformanceLogEntry,
} from "@/types/benchmark";
import { findClosestIndexBinary } from "@/lib/utils";

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

interface Point { x: number; y: number | null }

interface ChartJsWorkerDataset {
  [prefixedDataKey: string]: (Point | null)[];
}

const sortLogs = (logs: PerformanceLogEntry[], key: ChartAxisKey): void => {
  logs.sort((a, b) => (a[key] as number) - (b[key] as number));
};

const downsampleData = (
  data: PerformanceLogEntry[],
  xAxisKey: ChartAxisKey,
  firstValidMetricDataKey: string | undefined,
  threshold: number,
): PerformanceLogEntry[] => {
  if (data.length <= threshold) {
    return data;
  }

  if (firstValidMetricDataKey) {
    try {
      const lttbFormattedData = data.map((entry, index) => ({
        originalData: entry, // Keep original entry
        index: index,       // Store original index
        x: entry[xAxisKey] as number,
        y: (entry[firstValidMetricDataKey] ?? 0) as number, // Use first metric for Y
      }));

      const downsampledPoints = LTTB(lttbFormattedData, threshold);

      // Map back to original PerformanceLogEntry
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
    // Fallback if no valid metric key is found
    const factor = Math.ceil(data.length / threshold);
    return data.filter((_, i) => i % factor === 0);
  }
};


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

      activeRuns.forEach((run) => {
        if (run.performanceLogs) {
          sortLogs(run.performanceLogs, xAxisKey);
        }
      });

      // Helper to get the max X value from a run (since logs are sorted)
      const getLastXValue = (run: BenchmarkRun): number => {
        if (!run.performanceLogs || run.performanceLogs.length === 0) {
          return -Infinity;
        }
        const lastEntry = run.performanceLogs[run.performanceLogs.length - 1];
        const value = lastEntry[xAxisKey] as number;
        return (typeof value === 'number' && !isNaN(value)) ? value : -Infinity;
      };

      // Find the run with the largest X-axis value to use as the "base"
      // This ensures the merged data covers the full range of all runs.
      const baseRun = activeRuns.reduce((a, b) =>
        getLastXValue(a) > getLastXValue(b) ? a : b
      );
      const otherRuns = activeRuns.filter(r => r.id !== baseRun.id);

      const otherRunMaxValues = new Map<string, number>();
      otherRuns.forEach(run => {
        otherRunMaxValues.set(run.id, getLastXValue(run));
      });


      const fullMergedData: PerformanceLogEntry[] = [];

      baseRun.performanceLogs.forEach((baseEntry) => {
        const mergedEntry: PerformanceLogEntry = {
          TIMESTAMP: baseEntry.TIMESTAMP,
          [xAxisKey]: baseEntry[xAxisKey],
        };
        const baseRunPrefix = baseRun.id;

        mergedEntry[`${baseRunPrefix}:TIMESTAMP`] = baseEntry.TIMESTAMP;

        baseRun.availableMetrics.forEach((metric) => {
          const metricKey = metric.key;
          if (baseEntry[metricKey] !== undefined) {
            mergedEntry[`${baseRunPrefix}:${metricKey}`] = baseEntry[metricKey];
          }
        });

        mergedEntry[`${baseRunPrefix}:TIMESTAMP`] = baseEntry.TIMESTAMP;
        mergedEntry[`${baseRunPrefix}:SPLINE.DISTANCE`] =
          baseEntry["SPLINE.DISTANCE"];
        mergedEntry[`${baseRunPrefix}:BURST_LOGGING_STATUS`] =
          baseEntry["BURST_LOGGING_STATUS"];

        const baseValue = baseEntry[xAxisKey] as number;
        if (isNaN(baseValue)) return;

        otherRuns.forEach((otherRun) => {
          if (!otherRun.performanceLogs || otherRun.performanceLogs.length === 0) return;

          // Check if baseValue is out of bounds for this otherRun
          const maxOtherRunX = otherRunMaxValues.get(otherRun.id) ?? -Infinity;
          if (baseValue > maxOtherRunX) {
            return; // Skip this run, will result in `null` for this point
          }

          const closestIndex = findClosestIndexBinary(
            otherRun.performanceLogs,
            baseValue,
            (entry) => (entry[xAxisKey] as number) ?? 0,
          );

          if (closestIndex !== -1) {
            const closestEntry = otherRun.performanceLogs[closestIndex];
            const otherRunPrefix = otherRun.id;

            otherRun.availableMetrics.forEach((metric) => {
              const metricKey = metric.key;
              if (closestEntry[metricKey] !== undefined) {
                mergedEntry[`${otherRunPrefix}:${metricKey}`] =
                  closestEntry[metricKey];
              }
            });

            if (closestEntry["BURST_LOGGING_STATUS"] !== undefined) {
              mergedEntry[`${otherRunPrefix}:BURST_LOGGING_STATUS`] =
                closestEntry["BURST_LOGGING_STATUS"];
            }

            if (closestEntry["TIMESTAMP"] !== undefined) {
              mergedEntry[`${otherRunPrefix}:TIMESTAMP`] =
                closestEntry["TIMESTAMP"];
            }
          }
        });
        fullMergedData.push(mergedEntry);
      });

      sortLogs(fullMergedData, xAxisKey);

      let firstValidMetricDataKey: string | undefined = undefined;
      if (selectedMetricKeys.length > 0) {
        firstValidMetricDataKey = `${baseRun.id}:${selectedMetricKeys[0]}`;
      }
      const downsampledResult = downsampleData(
        fullMergedData,
        xAxisKey,
        firstValidMetricDataKey,
        downsampleThreshold,
      );

      const labels = downsampledResult.map(
        (entry) => entry[xAxisKey] as number,
      );
      const chartJsDatasets: ChartJsWorkerDataset = {};

      activeRuns.forEach((run) => {
        selectedMetricKeys.forEach((metricKey) => {
          const dataKey = `${run.id}:${metricKey}`;
          chartJsDatasets[dataKey] = downsampledResult.map((entry) => {
            const yValue = entry[dataKey];
            return {
              x: entry[xAxisKey] as number,
              y: typeof yValue === "number" ? yValue : null,
            };
          });
        });
      });

      self.postMessage({
        type: "DATA_READY",
        payload: {
          labels: labels,
          datasets: chartJsDatasets,
          fullDataForDetails: fullMergedData,
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

export { };