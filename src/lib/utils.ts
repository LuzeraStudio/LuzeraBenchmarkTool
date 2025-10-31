import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Finds the index of the item in a sorted array whose numeric value
 * (extracted by an accessor) is closest to the target value.
 *
 * @param sortedArray The array to search (must be pre-sorted based on the accessor).
 * @param targetValue The numeric value to find the closest match for.
 * @param accessor A function that takes an item from the array and returns its numeric value.
 * @returns The index of the closest item, or -1 if the array is empty.
 */
export const findClosestIndexBinary = <T>(
  sortedArray: T[],
  targetValue: number,
  accessor: (item: T) => number,
): number => {
  let low = 0;
  let high = sortedArray.length - 1;
  let closestIndex = 0;
  let minDiff = Infinity;

  if (sortedArray.length === 0) return -1;

  // Handle edge cases: targetValue is outside the array range
  const lowValue = accessor(sortedArray[low]);
  if (targetValue <= lowValue) return low;

  const highValue = accessor(sortedArray[high]);
  if (targetValue >= highValue) return high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = accessor(sortedArray[mid]);
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
      return mid; // Exact match found
    }
  }

  // After the loop, check neighbors of closestIndex found during search
  if (
    closestIndex > 0 &&
    Math.abs(accessor(sortedArray[closestIndex - 1]) - targetValue) < minDiff
  ) {
    closestIndex = closestIndex - 1;
    minDiff = Math.abs(accessor(sortedArray[closestIndex]) - targetValue);
  }
  if (
    closestIndex < sortedArray.length - 1 &&
    Math.abs(accessor(sortedArray[closestIndex + 1]) - targetValue) < minDiff
  ) {
    closestIndex = closestIndex + 1;
  }

  return closestIndex;
};