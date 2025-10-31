import {
  useRef,
  useEffect,
  useMemo,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Line } from "react-chartjs-2";
import {
  type Chart as ChartJS,
  type ChartData,
  type Point,
} from "chart.js";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
import type { ChartAxisKey, PerformanceLogEntry } from "@/types/benchmark";
import { useTheme } from "@/contexts/ThemeContext";
import { getComputedColor } from "@/lib/colorUtils";
import { useChartJsTooltip } from "@/hooks/ChartJS/useChartJsTooltip";
import { useChartJsOptions } from "@/hooks/ChartJS/useChartJsOptions";
import "@/lib/chartjs-config"; // Import for side-effects (Chart.js registration)

interface ChartZoomState {
  xMin: number | null;
  xMax: number | null;
}

interface ChartJsChartProps {
  datasets: ChartData<"line", (number | Point | null)[], number | string>["datasets"];
  labels: (number | string)[];
  xAxisKey: ChartAxisKey;
  yAxesConfig: { left?: boolean; right?: boolean; ram?: boolean };
  eventAnnotations: AnnotationOptions[];
  burstAnnotations: AnnotationOptions[];
  chartHeight: number;
  onPointClick: (dataPoint: PerformanceLogEntry | null) => void;
  fullDataForDetails: PerformanceLogEntry[];
  hiddenDatasetLabels: Set<string>;
  yRamMax?: number;
  yLeftMax?: number;
  isTooltipEnabled: boolean;
  chartZoom: ChartZoomState;
  setChartZoom: (zoom: ChartZoomState) => void;
}

export interface ChartJsChartHandle {
  resetZoom: () => void;
  getZoomRange: () => { xMin: number | undefined; xMax: number | undefined };
}

export const ChartJsChart = forwardRef<
  ChartJsChartHandle,
  ChartJsChartProps
>(
  (
    {
      datasets,
      labels,
      xAxisKey,
      yAxesConfig,
      eventAnnotations,
      burstAnnotations,
      chartHeight,
      onPointClick,
      fullDataForDetails,
      hiddenDatasetLabels,
      yRamMax,
      yLeftMax,
      isTooltipEnabled,
      chartZoom,
      setChartZoom,
    },
    ref,
  ) => {
    const chartRef =
      useRef<ChartJS<"line", (number | Point | null)[], number | string> | null>(
        null,
      );
    const { theme } = useTheme();
    const [debouncedTheme, setDebouncedTheme] = useState(theme);

    useImperativeHandle(ref, () => ({
      resetZoom: () => {
        chartRef.current?.resetZoom();
      },
      getZoomRange: () => {
        const chart = chartRef.current;
        if (!chart) return { xMin: undefined, xMax: undefined };
        return {
          xMin: chart.scales.x.min,
          xMax: chart.scales.x.max,
        };
      },
    }));

    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedTheme(theme);
      }, 0);
      return () => clearTimeout(timer);
    }, [theme]);

    const gridColor = getComputedColor("hsl(var(--border))");
    const tickColor = getComputedColor("hsl(var(--muted-foreground))");
    const titleColor = getComputedColor("hsl(var(--foreground))");

    const chartData: ChartData<
      "line",
      (number | Point | null)[],
      number | string
    > = useMemo(() => ({
      labels: labels,
      datasets: datasets,
    }), [labels, datasets]);

    const throttledExternalTooltipHandler = useChartJsTooltip({
      xAxisKey,
      fullDataForDetails,
      isTooltipEnabled,
      theme: debouncedTheme,
    });

    const options = useChartJsOptions({
      datasets,
      chartZoom,
      setChartZoom,
      xAxisKey,
      yAxesConfig,
      yLeftMax,
      yRamMax,
      isTooltipEnabled,
      throttledExternalTooltipHandler,
      eventAnnotations,
      burstAnnotations,
      onPointClick,
      fullDataForDetails,
      titleColor,
      gridColor,
      tickColor,
    });

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart) return;

      let needsUpdate = false;
      chart.data.datasets.forEach((dataset, index) => {
        const label = dataset.label;
        if (label) {
          const shouldBeHidden = hiddenDatasetLabels.has(label);
          const isCurrentlyHidden = !chart.isDatasetVisible(index);

          if (shouldBeHidden && !isCurrentlyHidden) {
            chart.hide(index);
            needsUpdate = true;
          } else if (!shouldBeHidden && isCurrentlyHidden) {
            chart.show(index);
            needsUpdate = true;
          }
        }
      });

      if (needsUpdate) {
        chart.update();
      }
    }, [hiddenDatasetLabels, datasets]);

    return (
      <div
        style={{
          height: `${chartHeight}px`,
          width: "100%",
          position: "relative",
        }}
        id="chartjs-container"
      >
        <Line
          key={xAxisKey + datasets.length}
          ref={chartRef}
          options={options}
          data={chartData}
        />
      </div>
    );
  },
);