// src/components/ChartJsChart.tsx
import React, { useRef, useEffect, useMemo, useState, useImperativeHandle, forwardRef } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip, // Keep renamed import
  Legend,
  TimeScale, // Import TimeScale
  type ChartOptions,
  type InteractionMode,
  type ChartData,
  type Point, // Import Point type
  type InteractionItem, // Import InteractionItem for onClick
  Scale, // Import Scale type
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import annotationPlugin, { type AnnotationOptions } from "chartjs-plugin-annotation";
import type { ChartAxisKey, PerformanceLogEntry } from "@/types/benchmark"; // Use BenchmarkEvent
import { useTheme } from "@/contexts/ThemeContext"; // For theme-aware colors
import 'chartjs-adapter-date-fns'; // Import date adapter
import { getComputedColor } from "@/lib/colorUtils";
import { findClosestDataIndexBinarySearch } from "@/lib/utils";

// Register Chart.js components and plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale, // Register TimeScale
  ChartTooltip, // Register renamed Tooltip
  Legend,
  zoomPlugin, // Register zoom plugin
  annotationPlugin // Register annotation plugin
);

// --- Types ---

interface ChartJsChartProps {
  chartTitle: string;
  datasets: ChartData<'line', (number | Point | null)[], number | string>['datasets']; // Use Chart.js specific type
  labels: (number | string)[]; // X-axis labels (time or distance)
  xAxisKey: ChartAxisKey;
  yAxesConfig: { left?: boolean; right?: boolean; ram?: boolean }; // Configuration for Y-axes
  eventAnnotations: AnnotationOptions[];
  burstAnnotations: AnnotationOptions[];
  chartHeight: number;
  onPointClick: (dataPoint: PerformanceLogEntry | null) => void; // Callback for point details
  fullDataForDetails: PerformanceLogEntry[]; // Needed for click handler and tooltip badge
  hiddenDatasetLabels: Set<string>;
}

// Helper function to create or get the tooltip element
const getOrCreateTooltip = (chart: ChartJS) => {
  let tooltipEl = chart.canvas.parentNode?.querySelector<HTMLDivElement>('div[id="chartjs-tooltip"]');

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chartjs-tooltip';
    tooltipEl.style.background = 'rgba(0, 0, 0, 0.7)'; // Default, will be updated
    tooltipEl.style.borderRadius = '3px';
    tooltipEl.style.color = 'white';
    tooltipEl.style.opacity = '1';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.position = 'absolute'; // Ensure it's absolute for positioning badge
    tooltipEl.style.transform = 'translate(-50%, 0)';
    tooltipEl.style.transition = 'all .1s ease';
    tooltipEl.style.border = '1px solid black'; // Default, will be updated
    tooltipEl.style.padding = '0.75rem'; // p-3
    tooltipEl.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'; // shadow-lg
    tooltipEl.style.minWidth = '200px';
    tooltipEl.style.zIndex = '50';

    const table = document.createElement('table');
    table.style.margin = '0px';
    table.style.width = '100%';
    table.style.fontSize = '0.75rem'; // text-xs
    table.style.borderCollapse = 'separate';
    table.style.borderSpacing = '0 4px'; // Corresponds to Tailwind spacing
    tooltipEl.appendChild(table);

    // Create badge element once and hide/show it later
    const badgeEl = document.createElement('div');
    badgeEl.id = 'chartjs-tooltip-badge';
    badgeEl.style.position = 'absolute';
    badgeEl.style.top = '0.25rem'; // Adjust as needed
    badgeEl.style.right = '0.25rem'; // Adjust as needed
    badgeEl.style.background = 'var(--destructive)'; // Red background
    badgeEl.style.color = 'white'; // White text
    badgeEl.style.borderRadius = '0.25rem'; // rounded-sm
    badgeEl.style.padding = '0.125rem 0.375rem'; // py-0.5 px-1.5
    badgeEl.style.fontSize = '0.65rem'; // text-[10px]
    badgeEl.style.fontWeight = '800'; // font-semibold
    badgeEl.style.lineHeight = '1'; // leading-none
    badgeEl.style.display = 'flex'; // Use flex for icon + text
    badgeEl.style.alignItems = 'center';
    badgeEl.style.gap = '0.25rem'; // gap-1
    badgeEl.style.visibility = 'hidden'; // Start hidden
    badgeEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg><span>Hitch</span>`;
    tooltipEl.appendChild(badgeEl);

    chart.canvas.parentNode?.appendChild(tooltipEl);
  }

  return tooltipEl as HTMLDivElement;
};

export interface ChartJsChartHandle {
  resetZoom: () => void;
}

// --- Chart Component ---
export const ChartJsChart = forwardRef<ChartJsChartHandle, ChartJsChartProps>(({
  datasets,
  labels,
  xAxisKey,
  yAxesConfig,
  eventAnnotations,
  burstAnnotations,
  chartHeight,
  onPointClick,
  fullDataForDetails,
  hiddenDatasetLabels
}, ref) => {
  const chartRef = useRef<ChartJS<"line", (number | Point | null)[], number | string> | null>(null);
  const { theme } = useTheme(); // Get current theme

  const [debouncedTheme, setDebouncedTheme] = useState(theme);

  useImperativeHandle(ref, () => ({
    resetZoom: () => {
      chartRef.current?.resetZoom();
    }
  }));

  useEffect(() => {
    // This effect runs *after* the DOM update from ThemeProvider.
    // We use a 0ms timeout to push this state update to the *next*
    // event loop tick, guaranteeing the DOM is painted first.
    const timer = setTimeout(() => {
      setDebouncedTheme(theme);
    }, 0);

    return () => clearTimeout(timer); // Cleanup
  }, [theme]); // Run *only* when the theme string changes

  const gridColor = getComputedColor("hsl(var(--border))");
  const tickColor = getComputedColor("hsl(var(--muted-foreground))");
  const titleColor = getComputedColor("hsl(var(--foreground))");
  const tooltipBgColor = getComputedColor("hsl(var(--background))");

  // Memoize chart data
  const chartData: ChartData<'line', (number | Point | null)[], number | string> = useMemo(() => ({
    labels: labels,
    datasets: datasets,
  }), [labels, datasets]);

  // Define chart options, including zoom, tooltip, annotations, axes
  const options: ChartOptions<"line"> = useMemo(() => {

    const xMax = labels.length > 0 ? (labels[labels.length - 1] as number) : undefined;

    return {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      parsing: false,
      normalized: true,
      spanGaps: false,
      interaction: {
        mode: 'index' as InteractionMode,
        intersect: false,
      },
      scales: {
        x: {
          max: xMax,
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: xAxisKey === "TIMESTAMP" ? "Time (s)" : "Distance",
            color: titleColor,
            align: 'center',
          },
          grid: {
            color: gridColor,
            drawOnChartArea: true,
          },
          ticks: {
            color: tickColor,
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 30,
            callback: function (value) {
              if (typeof value === 'number') {
                return value.toFixed(1);
              }
              return value;
            }
          },
        },
        ...(yAxesConfig.left && {
          yLeft: {
            id: 'yLeft',
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Value', color: titleColor },
            grid: { color: gridColor, drawOnChartArea: true },
            ticks: { color: tickColor },
          },
        }),
        ...(yAxesConfig.right && {
          yRight: {
            id: 'yRight',
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Percentage (%)', color: titleColor },
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false },
            ticks: { color: tickColor },
          },
        }),
        ...(yAxesConfig.ram && {
          yRam: {
            id: 'yRam',
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'RAM / VRAM (MB)', color: titleColor },
            grid: { drawOnChartArea: false },
            ticks: { color: tickColor },
          },
        }),
      },
      plugins: {
        legend: {
          display: false,
          position: 'bottom',
          labels: {
            color: tickColor,
            usePointStyle: true,
            boxWidth: 10,
            padding: 20,
          },
        },
        tooltip: {
          enabled: false, // Disable the default internal tooltip
          mode: 'index', // Keep mode and intersect for hover behavior
          intersect: false,
          position: 'nearest', // Helps determine positioning
          external: (context) => { // Use external tooltip
            const { chart, tooltip } = context;
            const tooltipEl = getOrCreateTooltip(chart);

            // --- Update styles based on theme ---
            tooltipEl.style.background = tooltipBgColor;
            tooltipEl.style.color = titleColor;
            tooltipEl.style.borderColor = gridColor;
            // ---

            const badgeEl = tooltipEl.querySelector<HTMLDivElement>('#chartjs-tooltip-badge');

            // Hide if no tooltip
            if (tooltip.opacity === 0) {
              tooltipEl.style.opacity = '0';
              if (badgeEl) badgeEl.style.visibility = 'hidden'; // Hide badge too
              return;
            }

            // Set Text
            if (tooltip.body) {
              const tableHead = document.createElement('thead');
              const titleRow = document.createElement('tr');
              const titleTh = document.createElement('th');
              titleTh.style.textAlign = 'left';
              titleTh.style.fontWeight = '600'; // font-semibold
              titleTh.style.paddingBottom = '0.5rem'; // mb-2
              titleTh.style.color = titleColor; // Use dynamic color from options

              // ---- Process data points for table ----
              const metricsData = new Map<string, Record<string, { value: number | null, color: string }>>();
              const sessionNamesSet = new Set<string>();

              tooltip.dataPoints.forEach(dataPoint => {
                const datasetLabel = dataPoint.dataset.label || 'Unknown';
                // Prevent processing internal/highlight datasets
                if (datasetLabel.includes('Burst Logging')) return;

                const parts = datasetLabel.split(" - ");
                const sessionName = parts[0] || "Unknown";
                const metricLabel = parts.slice(1).join(" - ") || dataPoint.datasetIndex.toString();
                const value = dataPoint.parsed.y;
                const color = dataPoint.dataset.borderColor as string || titleColor; // Fallback color

                sessionNamesSet.add(sessionName);

                if (!metricsData.has(metricLabel)) {
                  metricsData.set(metricLabel, {});
                }
                metricsData.get(metricLabel)![sessionName] = { value, color };
              });

              const orderedSessionNames = Array.from(sessionNamesSet).sort();
              const orderedMetricLabels = Array.from(metricsData.keys()).sort();
              // ---- END Process ----

              // Set Title (X-axis value)
              const firstDataPoint = tooltip.dataPoints[0];
              const xValue = firstDataPoint?.parsed?.x;
              titleTh.innerText = `${xAxisKey === 'TIMESTAMP' ? 'Time' : 'Distance'}: ${xValue?.toFixed(2) ?? 'N/A'}`;
              // Set colspan dynamically based on number of sessions + metric column
              titleTh.colSpan = orderedSessionNames.length + 1;

              titleRow.appendChild(titleTh);
              tableHead.appendChild(titleRow);

              const tableBody = document.createElement('tbody');

              // Create Header Row for Sessions
              const headerRow = document.createElement('tr');
              const metricHeaderTh = document.createElement('th');
              metricHeaderTh.innerText = 'Metric';
              metricHeaderTh.style.textAlign = 'left';
              metricHeaderTh.style.fontWeight = '500'; // font-medium
              metricHeaderTh.style.color = tickColor; // Use tick color for headers
              metricHeaderTh.style.paddingRight = '0.5rem'; // pr-2
              headerRow.appendChild(metricHeaderTh);

              orderedSessionNames.forEach(sessionName => {
                const sessionHeaderTh = document.createElement('th');
                sessionHeaderTh.innerText = sessionName;
                sessionHeaderTh.style.textAlign = 'right';
                sessionHeaderTh.style.fontWeight = '500';
                sessionHeaderTh.style.color = tickColor;
                sessionHeaderTh.style.paddingLeft = '0.5rem';
                sessionHeaderTh.style.paddingRight = '0.5rem';
                headerRow.appendChild(sessionHeaderTh);
              });
              tableBody.appendChild(headerRow);

              // Create Data Rows for Metrics
              orderedMetricLabels.forEach(metricLabel => {
                const dataRow = document.createElement('tr');
                const metricTd = document.createElement('td');
                metricTd.innerText = metricLabel;
                metricTd.style.textAlign = 'left';
                metricTd.style.fontWeight = '600';
                metricTd.style.paddingRight = '0.5rem';
                dataRow.appendChild(metricTd);

                orderedSessionNames.forEach(sessionName => {
                  const valueTd = document.createElement('td');
                  const metricSessionData = metricsData.get(metricLabel)?.[sessionName];
                  valueTd.innerText = metricSessionData?.value !== null && metricSessionData?.value !== undefined
                    ? metricSessionData.value.toFixed(2)
                    : 'N/A';
                  valueTd.style.textAlign = 'right';
                  valueTd.style.fontWeight = '600';
                  valueTd.style.color = metricSessionData?.color || titleColor; // Use series color
                  valueTd.style.paddingLeft = '0.5rem';
                  valueTd.style.paddingRight = '0.5rem';
                  dataRow.appendChild(valueTd);
                });
                tableBody.appendChild(dataRow);
              });

              // --- Check for Burst Logging ---
              let isBursting = false;
              // Ensure we have data points and full data to check against
              if (tooltip.dataPoints.length > 0 && fullDataForDetails && fullDataForDetails.length > 0) {
                const firstPoint = tooltip.dataPoints[0];
                const xValue = firstPoint.parsed?.x;

                // Only proceed if xValue is a valid number
                if (typeof xValue === 'number' && !isNaN(xValue)) {
                  // Optimization: Map only if needed or consider pre-sorting/mapping fullDataForDetails if performance is an issue
                  const sortedXValues = fullDataForDetails.map(d => d[xAxisKey] as number).filter(v => typeof v === 'number'); // Filter out non-numbers during mapping

                  const closestDataIndex = findClosestDataIndexBinarySearch(sortedXValues, xValue);

                  if (closestDataIndex !== -1) {
                    // Find the actual full data point corresponding to the index in the potentially filtered sortedXValues
                    // This requires finding the point in the *original* fullDataForDetails that matches the x-value found
                    const targetX = sortedXValues[closestDataIndex]; // The closest X value we found
                    const fullDataPoint = fullDataForDetails.find(d => (d[xAxisKey] as number) === targetX); // Find the exact point

                    // Check if *any* runId associated with this point has burst status true
                    if (fullDataPoint) { // Check if find was successful
                      isBursting = Object.keys(fullDataPoint).some(key =>
                        key.endsWith(':BURST_LOGGING_STATUS') && (fullDataPoint[key] === true || String(fullDataPoint[key]).toLowerCase() === 'true')
                      );
                    }
                  }
                }
              }
              // Show/Hide Badge based on burst status
              if (badgeEl) badgeEl.style.visibility = isBursting ? 'visible' : 'hidden';


              const tableRoot = tooltipEl.querySelector('table');
              // Clear and rebuild table
              while (tableRoot?.firstChild) {
                tableRoot.firstChild.remove();
              }
              tableRoot?.appendChild(tableHead);
              tableRoot?.appendChild(tableBody);
            }

            // Positioning
            const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
            const canvasHeight = chart.canvas.height / chart.currentDevicePixelRatio; // Adjust for device pixel ratio
            const canvasWidth = chart.canvas.width / chart.currentDevicePixelRatio; // Adjust for device pixel ratio

            tooltipEl.style.opacity = '1';
            tooltipEl.style.padding = tooltip.options.padding + 'px ' + tooltip.options.padding + 'px';

            // Calculate position relative to canvas, adjusted for potential scaling
            let caretX = tooltip.caretX;
            let caretY = tooltip.caretY;

            // Prevent tooltip going off screen - Adjust positioning slightly
            const tooltipWidth = tooltipEl.offsetWidth;
            const tooltipHeight = tooltipEl.offsetHeight;
            let newX = positionX + caretX;
            let newY = positionY + caretY;

            // Default transform
            let transformX = '-50%';
            let transformY = '0%'; // Position below caret by default

            // Adjust horizontal position
            if (caretX < tooltipWidth / 2) { // Too close to left edge
              transformX = '0%'; // Align left edge of tooltip with caret
              newX = positionX + caretX + 5; // Add small offset
            } else if (caretX > canvasWidth - tooltipWidth / 2) { // Too close to right edge
              transformX = '-100%'; // Align right edge of tooltip with caret
              newX = positionX + caretX - 5; // Add small offset
            } else {
              // Default centered horizontal position is fine
              newX = positionX + caretX;
            }

            // Adjust vertical position (place above if near bottom edge)
            if (caretY > canvasHeight - tooltipHeight - 15) { // If caret + tooltip height exceeds canvas height (with margin)
              transformY = '-100%'; // Align bottom edge of tooltip above caret
              newY = positionY + caretY - 15; // Move slightly above caret
            } else {
              transformY = '0%'; // Align top edge below caret
              newY = positionY + caretY + 15; // Move slightly below caret
            }

            tooltipEl.style.left = newX + 'px';
            tooltipEl.style.top = newY + 'px';
            tooltipEl.style.transform = `translate(${transformX}, ${transformY})`;
          },
          callbacks: {
            // No callbacks needed here when using external tooltip
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            threshold: 5,
          },
          zoom: {
            wheel: {
              enabled: true,
              modifierKey: 'ctrl',
            },
            pinch: {
              enabled: true,
            },
            mode: 'x',
          },
        },
        annotation: {
          annotations: [...eventAnnotations, ...burstAnnotations],
        },
      },
      onClick: (event, elements: InteractionItem[], chart: ChartJS) => {
        if (!chart || elements.length === 0) {
          const canvas = chart.canvas;
          const rect = canvas.getBoundingClientRect();
          const xPixel = event.x! - rect.left;
          const xScale = chart.scales['x'] as Scale | undefined;
          if (!xScale) return;

          const clickedXValue = xScale.getValueForPixel(xPixel);

          if (clickedXValue === undefined || clickedXValue === null || isNaN(clickedXValue)) {
            onPointClick(null);
            return;
          }

          const sortedXValues = fullDataForDetails.map(d => d[xAxisKey] as number).filter(v => typeof v === 'number');
          const closestDataIndex = findClosestDataIndexBinarySearch(sortedXValues, clickedXValue);
          const targetX = sortedXValues[closestDataIndex];
          const fullDataPoint = fullDataForDetails.find(d => (d[xAxisKey] as number) === targetX);

          if (fullDataPoint) {
            onPointClick(fullDataPoint);
          } else {
            onPointClick(null);
          }

        } else {
          const firstElement = elements[0];
          const index = firstElement.index;
          const clickedXValue = chart.data.labels ? chart.data.labels[index] as number : undefined;

          if (clickedXValue === undefined || clickedXValue === null || isNaN(clickedXValue)) {
            onPointClick(null);
            return;
          }

          const sortedXValues = fullDataForDetails.map(d => d[xAxisKey] as number).filter(v => typeof v === 'number');
          const closestDataIndex = findClosestDataIndexBinarySearch(sortedXValues, clickedXValue);
          const targetX = sortedXValues[closestDataIndex];
          const fullDataPoint = fullDataForDetails.find(d => (d[xAxisKey] as number) === targetX);

          if (fullDataPoint) {
            onPointClick(fullDataPoint);
          } else {
            onPointClick(null);
          }
        }
      },
    };
  }, [
    xAxisKey,
    yAxesConfig,
    eventAnnotations,
    burstAnnotations,
    onPointClick,
    fullDataForDetails,
    debouncedTheme,
    labels
  ]);

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
      chart.update(); // Apply changes
    }

  }, [hiddenDatasetLabels, datasets]);

  // Effect to reset zoom/pan when data fundamentally changes
  useEffect(() => {
    chartRef.current?.resetZoom();
  }, [datasets, labels]);

  return (
    <div style={{ height: `${chartHeight}px`, width: "100%", position: 'relative' }} id="chartjs-container"> {/* Add position relative */}
      <Line key={xAxisKey + datasets.length} ref={chartRef} options={options} data={chartData} />
    </div>
  );
});