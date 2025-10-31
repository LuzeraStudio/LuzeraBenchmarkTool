import { useRef, useCallback, useEffect } from 'react';

export function useThrottle<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastArgsRef = useRef<Parameters<T> | null>(null);
  const trailingCallScheduledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const throttledCallback = useCallback(
    (...args: Parameters<T>) => {
      lastArgsRef.current = args;

      if (!timeoutRef.current) {
        callback(...args);
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          if (trailingCallScheduledRef.current) {
            trailingCallScheduledRef.current = false;
            throttledCallback(...(lastArgsRef.current as Parameters<T>));
          }
        }, delay);
      } else {
        trailingCallScheduledRef.current = true;
      }
    },
    [callback, delay]
  );

  return throttledCallback;
}