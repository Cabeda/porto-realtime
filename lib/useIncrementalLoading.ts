import React from "react";

// Utility for progressive/incremental rendering of large datasets
export function useIncrementalLoading<T>(
  items: T[],
  batchSize: number = 20,
  interval: number = 50
) {
  const [visibleCount, setVisibleCount] = React.useState(batchSize);
  const [isLoading, setIsLoading] = React.useState(items.length > batchSize);

  React.useEffect(() => {
    if (visibleCount >= items.length) {
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + batchSize, items.length));
    }, interval);

    return () => clearTimeout(timer);
  }, [visibleCount, items.length, batchSize, interval]);

  // Reset when items change
  React.useEffect(() => {
    setVisibleCount(batchSize);
    setIsLoading(items.length > batchSize);
  }, [items, batchSize]);

  return {
    visibleItems: items.slice(0, visibleCount),
    isLoading,
    progress: items.length > 0 ? (visibleCount / items.length) * 100 : 100,
  };
}
