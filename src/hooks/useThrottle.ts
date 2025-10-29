// src/hooks/useThrottle.ts (Create this new file)
import { useRef, useCallback, useEffect } from 'react';

export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);
  const trailingCallScheduledRef = useRef(false);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      lastArgsRef.current = args; // Always store the latest arguments

      // If no timeout is active, execute immediately and set timeout
      if (!timeoutRef.current) {
        callback(...args);
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          // If there was a call scheduled during the timeout, execute it now
          if (trailingCallScheduledRef.current) {
            trailingCallScheduledRef.current = false;
            throttledCallback(...(lastArgsRef.current as Parameters<T>)); // Use the latest stored args
          }
        }, delay);
      } else {
        // If timeout is active, schedule a trailing call
        trailingCallScheduledRef.current = true;
      }
    },
    [callback, delay]
  );

  return throttledCallback;
}