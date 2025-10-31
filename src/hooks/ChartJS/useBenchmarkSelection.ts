import { useMemo, useEffect, useRef } from "react";
import type { BenchmarkRun, BenchmarkSession, AvailableMetric } from "@/types/benchmark";
import type { ChartSettingsContextType } from "@/contexts/ChartSettingsContext";
import { useBenchmarkData } from "@/contexts/BenchmarkContext";

export const useBenchmarkSelection = (
  runs: BenchmarkRun[],
  sessions: BenchmarkSession[],
  chartSettings: ChartSettingsContextType,
) => {
  const { deleteSession } = useBenchmarkData();
  const {
    selectedMetrics,
    setSelectedMetrics,
    selectedSessionIds,
    setSelectedSessionIds,
    isInitialSessionLoadDone,
    setIsInitialSessionLoadDone,
  } = chartSettings;

  const allAvailableMetrics = useMemo((): AvailableMetric[] => {
    const metricsMap = new Map<string, AvailableMetric>();
    runs.forEach((run) => {
      run.availableMetrics.forEach((metric) => {
        if (!metricsMap.has(metric.key)) {
          metricsMap.set(metric.key, metric);
        }
      });
    });
    return Array.from(metricsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [runs]);

  const sessionNameMap = useMemo(
    () => new Map(sessions.map((s) => [s.sessionId, s.sessionName])),
    [sessions],
  );

  const uniqueSessionsInRuns = useMemo(() => {
    const sessionMap = new Map<string, { id: string; name: string }>();
    runs.forEach((run) => {
      if (!sessionMap.has(run.sessionId)) {
        sessionMap.set(run.sessionId, {
          id: run.sessionId,
          name: sessionNameMap.get(run.sessionId) || "Unknown Session",
        });
      }
    });
    return Array.from(sessionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [runs, sessionNameMap]);

  const prevAvailableSessionIdsRef = useRef<Set<string>>(
    new Set(uniqueSessionsInRuns.map((s) => s.id)),
  );

  const selectedMetricMetas = useMemo(() => {
    return allAvailableMetrics
      .filter((m) => selectedMetrics.has(m.key))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allAvailableMetrics, selectedMetrics]);

  const selectedSessionMetas = useMemo(() => {
    return uniqueSessionsInRuns
      .filter((s) => selectedSessionIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [uniqueSessionsInRuns, selectedSessionIds]);

  const activeRuns = useMemo(() => {
    return runs.filter((run) => selectedSessionIds.has(run.sessionId));
  }, [runs, selectedSessionIds]);

  // Effect to set default metrics
  useEffect(() => {
    if (selectedMetrics.size === 0 && allAvailableMetrics.length > 0) {
      const defaults = new Set<string>();
      allAvailableMetrics.forEach((metric) => {
        if (
          metric.key === "FPS.CURRENT" ||
          metric.key === "CPU.USAGE" ||
          metric.key === "GPU.USAGE"
        ) {
          defaults.add(metric.key);
        }
      });
      if (defaults.size > 0) {
        setSelectedMetrics(defaults);
      } else if (allAvailableMetrics.length > 0) {
        setSelectedMetrics(new Set([allAvailableMetrics[0].key]));
      }
    }
  }, [allAvailableMetrics, selectedMetrics.size, setSelectedMetrics]);

  // Effect to initialize selected sessions
  useEffect(() => {
    if (
      !isInitialSessionLoadDone &&
      selectedSessionIds.size === 0 &&
      uniqueSessionsInRuns.length > 0
    ) {
      const allSessionIds = new Set(uniqueSessionsInRuns.map((s) => s.id));
      setSelectedSessionIds(allSessionIds);
      setIsInitialSessionLoadDone(true);
    }
  }, [
    uniqueSessionsInRuns,
    selectedSessionIds.size,
    setSelectedSessionIds,
    isInitialSessionLoadDone,
    setIsInitialSessionLoadDone,
  ]);

  // Effect to synchronize selected sessions when runs change
  useEffect(() => {
    if (!isInitialSessionLoadDone) return;

    const availableSessionIds = new Set(uniqueSessionsInRuns.map((s) => s.id));
    const currentSessionIds = new Set(selectedSessionIds);
    const prevAvailableSessionIds = prevAvailableSessionIdsRef.current;

    let newSelectedIds = new Set(currentSessionIds);
    let changed = false;

    for (const id of currentSessionIds) {
      if (!availableSessionIds.has(id)) {
        newSelectedIds.delete(id);
        changed = true;
      }
    }

    for (const id of availableSessionIds) {
      if (!prevAvailableSessionIds.has(id)) {
        newSelectedIds.add(id);
        changed = true;
      }
    }

    prevAvailableSessionIdsRef.current = availableSessionIds;

    if (changed) {
      setSelectedSessionIds(newSelectedIds);
    }
  }, [
    uniqueSessionsInRuns,
    selectedSessionIds,
    setSelectedSessionIds,
    isInitialSessionLoadDone,
  ]);

  const toggleMetric = (key: string) => {
    const newSet = new Set(selectedMetrics);
    newSet.has(key) ? newSet.delete(key) : newSet.add(key);
    setSelectedMetrics(newSet);
  };

  const toggleSession = (sessionId: string) => {
    const newSet = new Set(selectedSessionIds);
    newSet.has(sessionId) ? newSet.delete(sessionId) : newSet.add(sessionId);
    setSelectedSessionIds(newSet);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSession(sessionId);
  };

  return {
    allAvailableMetrics,
    sessionNameMap,
    uniqueSessionsInRuns,
    selectedMetricMetas,
    selectedSessionMetas,
    activeRuns,
    toggleMetric,
    toggleSession,
    handleDeleteSession,
  };
};