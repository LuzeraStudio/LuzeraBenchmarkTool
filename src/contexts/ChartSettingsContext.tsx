// src/contexts/ChartSettingsContext.tsx
import { createContext, useState, useContext, useMemo, type ReactNode, useCallback } from "react";
import type { ChartAxisKey } from "@/types/benchmark";

const MIN_CHART_HEIGHT = 200;
const MAX_CHART_HEIGHT = 800;
const HEIGHT_STEP = 50;
const DEFAULT_CHART_HEIGHT = 400;

interface ChartZoomState {
  xMin: number | null;
  xMax: number | null;
}

interface ChartSettings {
  selectedMap: string;
  selectedMetrics: Set<string>; // Use Set internally for easier management
  xAxisKey: ChartAxisKey;
  selectedSessionIds: Set<string>;
  isInitialSessionLoadDone: boolean;
  chartHeight: number;
  isTooltipEnabled: boolean; // <-- ADDED
  chartZoom: ChartZoomState;
}

interface ChartSettingsContextType extends ChartSettings {
  setSelectedMap: (map: string) => void;
  setSelectedMetrics: (metrics: Set<string>) => void;
  setXAxisKey: (key: ChartAxisKey) => void;
  setSelectedSessionIds: (sessionIds: Set<string>) => void;
  setIsInitialSessionLoadDone: (done: boolean) => void;
  setChartHeight: (height: number | ((prevHeight: number) => number)) => void;
  setIsTooltipEnabled: (enabled: boolean) => void; // <-- ADDED
  setChartZoom: (zoom: ChartZoomState) => void;
}

const defaultSettings: ChartSettings = {
  selectedMap: "",
  selectedMetrics: new Set<string>(), // Default to empty, initial population handled in ChartController
  xAxisKey: "SPLINE.DISTANCE",
  selectedSessionIds: new Set<string>(),
  isInitialSessionLoadDone: false,
  chartHeight: DEFAULT_CHART_HEIGHT,
  isTooltipEnabled: true, // <-- ADDED
  chartZoom: { xMin: null, xMax: null },
};

// Create the context with a default value (will be overridden by Provider)
const ChartSettingsContext = createContext<ChartSettingsContextType | undefined>(undefined);

// Create the Provider component
export const ChartSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [selectedMap, setSelectedMap] = useState<string>(defaultSettings.selectedMap);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(defaultSettings.selectedMetrics);
  const [xAxisKey, setXAxisKey] = useState<ChartAxisKey>(defaultSettings.xAxisKey);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(defaultSettings.selectedSessionIds);
  const [isInitialSessionLoadDone, setIsInitialSessionLoadDone] = useState<boolean>(defaultSettings.isInitialSessionLoadDone);
  const [chartHeight, setChartHeight] = useState<number>(defaultSettings.chartHeight);
  const [isTooltipEnabled, setIsTooltipEnabled] = useState<boolean>(defaultSettings.isTooltipEnabled); // <-- ADDED
  const [chartZoom, setChartZoom] = useState<ChartZoomState>(defaultSettings.chartZoom); // <-- ADDED

  const updateChartHeight = useCallback((newHeightOrFn: number | ((prevHeight: number) => number)) => {
    setChartHeight(prev => {
      const newHeight = typeof newHeightOrFn === 'function' ? newHeightOrFn(prev) : newHeightOrFn;
      return Math.max(MIN_CHART_HEIGHT, Math.min(MAX_CHART_HEIGHT, newHeight));
    });
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    selectedMap,
    selectedMetrics,
    xAxisKey,
    selectedSessionIds,
    isInitialSessionLoadDone,
    chartHeight,
    isTooltipEnabled, // <-- ADDED
    chartZoom,
    setSelectedMap,
    setSelectedMetrics,
    setXAxisKey,
    setSelectedSessionIds,
    setIsInitialSessionLoadDone,
    setChartHeight: updateChartHeight,
    setIsTooltipEnabled, // <-- ADDED
    setChartZoom,
  }), [selectedMap, selectedMetrics, xAxisKey, selectedSessionIds, isInitialSessionLoadDone, chartHeight, isTooltipEnabled, chartZoom]); // <-- ADDED DEPENDENCY

  return (
    <ChartSettingsContext.Provider value={value}>
      {children}
    </ChartSettingsContext.Provider>
  );
};

// Create the custom hook for easy consumption
export const useChartSettings = (): ChartSettingsContextType => {
  const context = useContext(ChartSettingsContext);
  if (context === undefined) {
    throw new Error("useChartSettings must be used within a ChartSettingsProvider");
  }
  return context;
};

export {
  MIN_CHART_HEIGHT,
  MAX_CHART_HEIGHT,
  HEIGHT_STEP
};