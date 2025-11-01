/// <reference lib="webworker" />
import Papa from "papaparse";
import type {
  BenchmarkSession,
  BenchmarkRun,
  BenchmarkEvent,
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

  // Store runs by their *full path prefix* (e.g., "2025-10-22_14-38-18/Demo" or just "Demo")
  const runsByPathPrefix = new Map<string, BenchmarkRun>();
  const mapNameToRuns = new Map<string, BenchmarkRun[]>();

  const tempEvents: { pathPrefix: string | null; events: BenchmarkEvent[]; fileName: string }[] = [];

  const processingErrors: { file: string; error: string }[] = [];
  let filesProcessedCount = 0;

  for (const file of files) {
    try {
      const content = await file.text();
      // Use the full relative path provided by the browser
      const relativePath = file.webkitRelativePath || file.name;
      const fileName = file.name;
      const fileNameLower = fileName.toLowerCase();

      if (fileNameLower.includes("staticdata")) {
        // StaticData can be at the root or in a subfolder.
        // We'll just take the *first* one we find for the whole session.
        if (!newSessionData.staticData) {
          newSessionData.staticData = parseStaticData(content);
        }
        filesProcessedCount++;

      } else if (fileNameLower.includes("performancelog")) {
        // This regex now handles both:
        // 1. "Demo-PerformanceLog.csv" (folderPath=undefined, mapAndRunName="Demo")
        // 2. "2025-10-22_14-38-18/Demo-PerformanceLog.csv" (folderPath="2025-10-22_14-38-18", mapAndRunName="Demo")
        const match = relativePath.match(/^(?:(.*)\/)?([^/]+?)-PerformanceLog\.csv$/i);

        if (match) {
          const folderPath = match[1]; // e.g., "2025-10-22_14-38-18" or undefined
          const mapAndRunName = match[2]; // e.g., "Demo" or "Demo-Run1"

          // pathPrefix: "2025-10-22_14-38-18/Demo" or "Demo"
          const pathPrefix = folderPath ? `${folderPath}/${mapAndRunName}` : mapAndRunName;
          // mapName: "Demo" (for grouping in UI)
          const mapName = mapAndRunName.replace(/-Run\d+$/i, "");
          // runName: "2025-10-22_14-38-18 - Demo" or "Demo" (for display)
          const runName = folderPath ? `${folderPath} - ${mapAndRunName}` : mapAndRunName;

          if (!mapNameToRuns.has(mapName)) {
            mapNameToRuns.set(mapName, []);
          }

          const perfLogs = parseCSV<PerformanceLogEntry>(content);
          const metrics = discoverMetrics(perfLogs);

          const run: BenchmarkRun = {
            id: `${sessionId}-${relativePath}`, // Unique ID for React
            sessionId: sessionId,
            name: runName, // Unique display name
            performanceLogs: perfLogs,
            events: [],
            availableMetrics: metrics,
          };

          mapNameToRuns.get(mapName)!.push(run);
          runsByPathPrefix.set(pathPrefix, run); // Store by unique path key
          filesProcessedCount++;
        }

      } else if (fileNameLower.includes("events")) {
        // Handles "Demo-Events.csv" or "2025-10-22_14-38-18/Demo-Events.csv"
        const match = relativePath.match(/^(?:(.*)\/)?([^/]+?)-Events\.csv$/i);
        if (match) {
          const folderPath = match[1];
          const mapAndRunName = match[2];
          
          // pathPrefix: "2025-10-22_14-38-18/Demo" or "Demo"
          const pathPrefix = folderPath ? `${folderPath}/${mapAndRunName}` : mapAndRunName;

          const parsedEvents = parseCSV<BenchmarkEvent>(content);
          filesProcessedCount++;
          tempEvents.push({ pathPrefix: pathPrefix, events: parsedEvents, fileName: relativePath });
        }
      }
    } catch (err: any) {
      console.error(`Error processing file ${file.webkitRelativePath || file.name}:`, err);
      processingErrors.push({
        file: file.webkitRelativePath || file.name,
        error: err.message || "Unknown error",
      });
    }
  }

  // --- Event Association Logic ---
  // Assign runs to the session maps structure
  mapNameToRuns.forEach((runs, mapName) => {
    newSessionData.maps[mapName] = runs;
  });

  // Now, associate events
  for (const eventData of tempEvents) {
    const { pathPrefix, events } = eventData;
    let foundMatch = false;

    if (pathPrefix) {
      // 1. Try to find a run with the *exact* same path prefix
      // e.g., "2025-10-22_14-38-18/Demo" or "Demo"
      const exactMatchRun = runsByPathPrefix.get(pathPrefix);
      if (exactMatchRun) {
        exactMatchRun.events.push(...events);
        foundMatch = true;
      }
    }

    // 2. Fallback (should be rare)
    if (!foundMatch) {
      console.warn(`[Parser] Event file ${eventData.fileName} had no matching run. Associating with ALL runs.`);
      runsByPathPrefix.forEach(run => run.events.push(...events));
    }
  }

  // --- End Logic ---

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