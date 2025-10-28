/// <reference lib="webworker" />
import Papa from "papaparse";
import type {
  BenchmarkSession,
  BenchmarkRun,
  Event,
  PerformanceLogEntry,
  StaticData,
  AvailableMetric,
} from "@/types/benchmark";

const parseCSV = <T>(content: string): T[] => {
  const result = Papa.parse(content.trim(), {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn("CSV parsing errors:", result.errors);
    throw new Error(
      `Error parsing CSV: ${result.errors[0].message} on row ${result.errors[0].row}`,
    );
  }

  return result.data as T[];
};
const parseStaticData = (content: string): StaticData => {
  const lines = content.trim().split("\n");
  const data: StaticData = {};
  const startIdx = lines[0].toLowerCase().startsWith("stat,value") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(/^"?([^",]+)"?,(.+)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^"|"$/g, "");
      data[key] = value;
    }
  }
  return data;
};
const discoverMetrics = (logs: PerformanceLogEntry[]): AvailableMetric[] => {
  if (logs.length === 0) return [];

  const firstEntry = logs[0];
  const metrics: AvailableMetric[] = [];

  Object.keys(firstEntry).forEach((key) => {
    if (
      key !== "TIMESTAMP" &&
      key !== "SPLINE.DISTANCE" &&
      key !== "SPLINE.PERCENTAGE" &&
      key !== "BURST_LOGGING_STATUS"
    ) {
      let isPercentage =
        key.includes("USAGE") ||
        key.includes("PERCENTAGE") ||
        key.includes("PERCENT");

      if (key.startsWith("FPS.") && key.includes("PERCENTILE"))
        isPercentage = false;

      metrics.push({
        key,
        label: key.replace(/\./g, " "),
        isPercentage,
      });
    }
  });
  return metrics;
};

self.onmessage = async (
  e: MessageEvent<{ files: File[]; sessionId: string; sessionName: string }>,
) => {
  const { files, sessionId, sessionName } = e.data;

  const newSessionData: Omit<BenchmarkSession, "sessionId" | "sessionName"> = {
    staticData: null,
    maps: {},
  };

  const tempEvents: { mapName: string | null; events: Event[] }[] = [];

  const processingErrors: { file: string; error: string }[] = [];
  let filesProcessedCount = 0;

  for (const file of files) {
    try {
      const content = await file.text();
      const fileName = file.name;
      const fileNameLower = fileName.toLowerCase();

      if (fileNameLower.includes("staticdata")) {
        newSessionData.staticData = parseStaticData(content);
        filesProcessedCount++;
      } else if (fileNameLower.includes("performancelog")) {
        const match = fileName.match(/^(.+?)-PerformanceLog\.csv$/i);
        const mapName = match ? match[1] : "UnknownMap";

        if (!newSessionData.maps[mapName]) {
          newSessionData.maps[mapName] = [];
        }

        const perfLogs = parseCSV<PerformanceLogEntry>(content);
        const metrics = discoverMetrics(perfLogs);

        const run: BenchmarkRun = {
          id: `${sessionId}-${fileName}`,
          sessionId: sessionId,
          name: fileName.replace(/-PerformanceLog\.csv$/i, ""),
          performanceLogs: perfLogs,
          events: [],
          availableMetrics: metrics,
        };

        newSessionData.maps[mapName].push(run);
        filesProcessedCount++;
      } else if (fileNameLower.includes("events")) {
        const match = fileName.match(/^(.+?)-Events\.csv$/i);
        const mapName = match ? match[1] : null;
        const parsedEvents = parseCSV<Event>(content);
        filesProcessedCount++;

        tempEvents.push({ mapName, events: parsedEvents });
      }
    } catch (err: any) {
      console.error(`Error processing file ${file.name}:`, err);
      processingErrors.push({
        file: file.name,
        error: err.message || "Unknown error",
      });
    }
  }

  for (const eventData of tempEvents) {
    const { mapName, events } = eventData;
    if (mapName && newSessionData.maps[mapName]) {
      newSessionData.maps[mapName].forEach((run) => {
        run.events.push(...events);
      });
    } else {
      console.warn(
        `[DEBUG 2/6] Event file had no map name. Associating ${events.length} events with ALL maps.`,
      );
      Object.values(newSessionData.maps).forEach((runs) => {
        runs.forEach((run) => run.events.push(...events));
      });
    }
  }

  const session: BenchmarkSession = {
    sessionId: sessionId,
    sessionName: sessionName,
    staticData: newSessionData.staticData,
    maps: newSessionData.maps,
  };

  self.postMessage({
    benchmarkSession: session,
    filesProcessedCount,
    totalFiles: files.length,
    errors: processingErrors,
  });
};
