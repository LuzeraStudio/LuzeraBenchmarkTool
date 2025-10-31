import { useCallback } from "react";
import { getComputedColor } from "@/lib/colorUtils";
import { findClosestIndexBinary } from "@/lib/utils";
import { useThrottle } from "@/hooks/useThrottle";
import type { Chart as ChartJS, TooltipItem } from "chart.js";
import type { ChartAxisKey, PerformanceLogEntry } from "@/types/benchmark";

interface UseChartJsTooltipProps {
  xAxisKey: ChartAxisKey;
  fullDataForDetails: PerformanceLogEntry[];
  isTooltipEnabled: boolean;
  theme: string; // Used as a dependency to re-calculate colors
}

const getOrCreateTooltip = (chart: ChartJS) => {
  let tooltipEl = chart.canvas.parentNode?.querySelector<HTMLDivElement>(
    'div[id="chartjs-tooltip"]',
  );

  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "chartjs-tooltip";
    tooltipEl.style.opacity = "1";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.position = "absolute";
    tooltipEl.style.transform = "translate(-50%, 0)";
    tooltipEl.style.transition = "all .1s ease";
    tooltipEl.style.padding = "0.75rem";
    tooltipEl.style.boxShadow =
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
    tooltipEl.style.minWidth = "200px";
    tooltipEl.style.zIndex = "50";

    const table = document.createElement("table");
    table.style.margin = "0px";
    table.style.width = "100%";
    table.style.fontSize = "0.75rem";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0 4px";
    tooltipEl.appendChild(table);

    const badgeEl = document.createElement("div");
    badgeEl.id = "chartjs-tooltip-badge";
    badgeEl.style.position = "absolute";
    badgeEl.style.top = "0.25rem";
    badgeEl.style.right = "0.25rem";
    badgeEl.style.background = "var(--destructive)";
    badgeEl.style.color = "white";
    badgeEl.style.borderRadius = "0.25rem";
    badgeEl.style.padding = "0.125rem 0.375rem";
    badgeEl.style.fontSize = "0.65rem";
    badgeEl.style.fontWeight = "800";
    badgeEl.style.lineHeight = "1";
    badgeEl.style.display = "flex";
    badgeEl.style.alignItems = "center";
    badgeEl.style.gap = "0.25rem";
    badgeEl.style.visibility = "hidden";
    badgeEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg><span>Hitch</span>`;
    tooltipEl.appendChild(badgeEl);

    chart.canvas.parentNode?.appendChild(tooltipEl);
  }

  return tooltipEl;
};

const formatValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return "N/A";
  }
  if (value % 1 === 0) {
    return value.toString();
  }
  return value.toFixed(2);
};

export const useChartJsTooltip = ({
  xAxisKey,
  fullDataForDetails,
  isTooltipEnabled,
  theme,
}: UseChartJsTooltipProps) => {
  const externalTooltipHandler = useCallback(
    (context: { chart: ChartJS; tooltip: any }) => {
      const { chart, tooltip } = context;
      const tooltipEl = getOrCreateTooltip(chart);

      const tooltipBgColor = getComputedColor("hsl(var(--background))");
      const titleColor = getComputedColor("hsl(var(--foreground))");
      const gridColor = getComputedColor("hsl(var(--border))");
      const tickColor = getComputedColor("hsl(var(--muted-foreground))");

      tooltipEl.style.background = tooltipBgColor;
      tooltipEl.style.color = titleColor;
      tooltipEl.style.borderColor = gridColor;
      tooltipEl.style.borderRadius = "3px";
      tooltipEl.style.border = `1px solid ${gridColor}`;

      const badgeEl =
        tooltipEl.querySelector<HTMLDivElement>("#chartjs-tooltip-badge");

      if (tooltip.opacity === 0 || !isTooltipEnabled) {
        tooltipEl.style.opacity = "0";
        if (badgeEl) badgeEl.style.visibility = "hidden";
        return;
      }

      if (tooltip.body) {
        const tableHead = document.createElement("thead");
        const titleRow = document.createElement("tr");
        const titleTh = document.createElement("th");
        titleTh.style.textAlign = "left";
        titleTh.style.fontWeight = "600";
        titleTh.style.paddingBottom = "0.5rem";
        titleTh.style.color = titleColor;

        const metricsData = new Map<
          string,
          Record<string, { value: number | null; color: string }>
        >();
        const sessionNamesSet = new Set<string>();

        tooltip.dataPoints.forEach((dataPoint: TooltipItem<"line">) => {
          const datasetLabel = dataPoint.dataset.label || "Unknown";
          if (datasetLabel.includes("Burst Logging")) return;

          const parts = datasetLabel.split(" - ");
          const sessionName = parts[0] || "Unknown";
          const metricLabel =
            parts.slice(1).join(" - ") || dataPoint.datasetIndex.toString();
          const value = dataPoint.parsed.y;
          const color = (dataPoint.dataset.borderColor as string) || titleColor;

          sessionNamesSet.add(sessionName);

          if (!metricsData.has(metricLabel)) {
            metricsData.set(metricLabel, {});
          }
          metricsData.get(metricLabel)![sessionName] = { value, color };
        });

        const orderedSessionNames = Array.from(sessionNamesSet).sort();
        const orderedMetricLabels = Array.from(metricsData.keys()).sort();

        const firstDataPoint = tooltip.dataPoints[0];
        const xValue = firstDataPoint?.parsed?.x;
        titleTh.innerText = `${xAxisKey === "TIMESTAMP" ? "Time" : "Distance"
          }: ${xValue?.toFixed(2) ?? "N/A"}`;
        titleTh.colSpan = orderedSessionNames.length + 1;

        titleRow.appendChild(titleTh);
        tableHead.appendChild(titleRow);

        const tableBody = document.createElement("tbody");
        const headerRow = document.createElement("tr");
        const metricHeaderTh = document.createElement("th");
        metricHeaderTh.innerText = "Metric";
        metricHeaderTh.style.textAlign = "left";
        metricHeaderTh.style.fontWeight = "500";
        metricHeaderTh.style.color = tickColor;
        metricHeaderTh.style.paddingRight = "0.5rem";
        headerRow.appendChild(metricHeaderTh);

        orderedSessionNames.forEach((sessionName) => {
          const sessionHeaderTh = document.createElement("th");
          sessionHeaderTh.innerText = sessionName;
          sessionHeaderTh.style.textAlign = "right";
          sessionHeaderTh.style.fontWeight = "500";
          sessionHeaderTh.style.color = tickColor;
          sessionHeaderTh.style.paddingLeft = "0.5rem";
          sessionHeaderTh.style.paddingRight = "0.5rem";
          headerRow.appendChild(sessionHeaderTh);
        });
        tableBody.appendChild(headerRow);

        orderedMetricLabels.forEach((metricLabel) => {
          const dataRow = document.createElement("tr");
          const metricTd = document.createElement("td");
          metricTd.innerText = metricLabel;
          metricTd.style.textAlign = "left";
          metricTd.style.fontWeight = "600";
          metricTd.style.paddingRight = "0.5rem";
          metricTd.style.whiteSpace = "nowrap";
          dataRow.appendChild(metricTd);

          orderedSessionNames.forEach((sessionName) => {
            const valueTd = document.createElement("td");
            const metricSessionData =
              metricsData.get(metricLabel)?.[sessionName];
            valueTd.innerText =
              metricSessionData?.value !== null &&
                metricSessionData?.value !== undefined
                ? formatValue(metricSessionData?.value)
                : "N/A";
            valueTd.style.textAlign = "center";
            valueTd.style.fontWeight = "600";
            valueTd.style.color = metricSessionData?.color || titleColor;
            valueTd.style.paddingLeft = "0.5rem";
            valueTd.style.paddingRight = "0.5rem";
            dataRow.appendChild(valueTd);
          });
          tableBody.appendChild(dataRow);
        });

        let isBursting = false;
        if (
          tooltip.dataPoints.length > 0 &&
          fullDataForDetails &&
          fullDataForDetails.length > 0
        ) {
          const firstPoint = tooltip.dataPoints[0];
          const xValue = firstPoint.parsed?.x;

          if (typeof xValue === "number" && !isNaN(xValue)) {
            const sortedXValues = fullDataForDetails
              .map((d) => d[xAxisKey] as number)
              .filter((v) => typeof v === "number");

            const closestDataIndex = findClosestIndexBinary(
              sortedXValues,
              xValue,
              (val) => val,
            );

            if (closestDataIndex !== -1) {
              const targetX = sortedXValues[closestDataIndex];
              const fullDataPoint = fullDataForDetails.find(
                (d) => (d[xAxisKey] as number) === targetX,
              );

              if (fullDataPoint) {
                isBursting = Object.keys(fullDataPoint).some(
                  (key) =>
                    key.endsWith(":BURST_LOGGING_STATUS") &&
                    (fullDataPoint[key] === true ||
                      String(fullDataPoint[key]).toLowerCase() === "true"),
                );
              }
            }
          }
        }
        if (badgeEl) badgeEl.style.visibility = isBursting ? "visible" : "hidden";

        const tableRoot = tooltipEl.querySelector("table");
        while (tableRoot?.firstChild) {
          tableRoot.firstChild.remove();
        }
        tableRoot?.appendChild(tableHead);
        tableRoot?.appendChild(tableBody);
      }

      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
      const canvasHeight = chart.canvas.height / chart.currentDevicePixelRatio;
      const canvasWidth = chart.canvas.width / chart.currentDevicePixelRatio;

      tooltipEl.style.opacity = "1";
      tooltipEl.style.padding =
        tooltip.options.padding + "px " + tooltip.options.padding + "px";

      const tooltipWidth = tooltipEl.offsetWidth;
      const tooltipHeight = tooltipEl.offsetHeight;
      const caretX = tooltip.caretX;
      const caretY = tooltip.caretY;
      const margin = 60;

      let newX = 0;
      let newY = 0;
      let transformX = "0%";
      let transformY = "0%";

      newX = positionX + caretX + margin;
      transformX = "0%";

      if (newX + tooltipWidth > positionX + canvasWidth) {
        newX = positionX + caretX - margin;
        transformX = "-100%";
      }

      newY = positionY + caretY;
      transformY = "-50%";

      const topEdge = newY - tooltipHeight / 2;
      const bottomEdge = newY + tooltipHeight / 2;

      if (topEdge < positionY) {
        newY = positionY;
        transformY = "0%";
      } else if (bottomEdge > positionY + canvasHeight) {
        newY = positionY + canvasHeight;
        transformY = "-100%";
      }

      tooltipEl.style.left = newX + "px";
      tooltipEl.style.top = newY + "px";
      tooltipEl.style.transform = `translate(${transformX}, ${transformY})`;
    },
    [theme, xAxisKey, fullDataForDetails, isTooltipEnabled],
  );

  return useThrottle(externalTooltipHandler, 50);
};