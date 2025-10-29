import type { ChartAxisKey, PerformanceLogEntry } from "@/types/benchmark";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// Need the binary search function here too for event mapping if done on main thread
export const findClosestIndexBinary = (
    sortedLogs: PerformanceLogEntry[],
    targetValue: number,
    key: ChartAxisKey | "TIMESTAMP", // Allow finding by TIMESTAMP for events
): number => {
    let low = 0;
    let high = sortedLogs.length - 1;
    let closestIndex = 0;
    let minDiff = Infinity;

    if (sortedLogs.length === 0) return -1;

    if (targetValue <= (sortedLogs[low][key] as number)) return low;
    if (targetValue >= (sortedLogs[high][key] as number)) return high;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        // Ensure midValue is treated as a number, provide fallback
        const midValue = (sortedLogs[mid][key] as number) ?? 0;
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
    if (
        closestIndex > 0 &&
        Math.abs(
            ((sortedLogs[closestIndex - 1][key] as number) ?? 0) - targetValue,
        ) < minDiff
    ) {
        closestIndex = closestIndex - 1;
        minDiff = Math.abs(
            ((sortedLogs[closestIndex][key] as number) ?? 0) - targetValue,
        ); // Recalculate minDiff
    }
    if (
        closestIndex < sortedLogs.length - 1 &&
        Math.abs(
            ((sortedLogs[closestIndex + 1][key] as number) ?? 0) - targetValue,
        ) < minDiff
    ) {
        closestIndex = closestIndex + 1;
    }

    return closestIndex;
};


// --- Helper Functions ---

// Function to find closest data point index based on X value in a sorted array
export const findClosestDataIndexBinarySearch = (
  sortedXValues: number[], // Array must be sorted numerically
  targetXValue: number
): number => {
  let low = 0;
  let high = sortedXValues.length - 1;
  let closestIndex = 0;
  let minDiff = Infinity;

  if (sortedXValues.length === 0) return -1; // Handle empty array

  // Handle edge cases: targetValue is outside the array range
  if (targetXValue <= sortedXValues[low]) return low;
  if (targetXValue >= sortedXValues[high]) return high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = sortedXValues[mid];
    const diff = Math.abs(midValue - targetXValue);

    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = mid;
    }

    if (midValue < targetXValue) {
      low = mid + 1;
    } else if (midValue > targetXValue) {
      high = mid - 1;
    } else {
      // Exact match found
      return mid;
    }
  }

  // After the loop, check neighbors of closestIndex found during search,
  // as binary search might land between the two closest points.
  if (closestIndex > 0 && Math.abs(sortedXValues[closestIndex - 1] - targetXValue) < minDiff) {
    closestIndex = closestIndex - 1;
    minDiff = Math.abs(sortedXValues[closestIndex] - targetXValue); // Re-calculate minDiff is important
  }
  if (closestIndex < sortedXValues.length - 1 && Math.abs(sortedXValues[closestIndex + 1] - targetXValue) < minDiff) {
    closestIndex = closestIndex + 1;
  }

  return closestIndex;
};