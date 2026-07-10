import { useEffect, useState } from "react";

import {
  DEFAULT_USAGE_SUMMARY,
  fetchUsageSummary,
} from "@/lib/api/usage";
import type { ApiUsageSummary } from "@/types";

export type UsageSummaryState = Readonly<{
  data: ApiUsageSummary;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}>;

/**
 * Loads and optionally refreshes the backend usage summary for reusable
 * dashboard placements such as navbars, sidebars, and page panels.
 */
export function useUsageSummary({
  endpoint = "/api/usage",
  refreshIntervalMs,
}: {
  endpoint?: string;
  refreshIntervalMs?: number;
} = {}): UsageSummaryState {
  const [data, setData] = useState<ApiUsageSummary>(DEFAULT_USAGE_SUMMARY);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const summary = await fetchUsageSummary(endpoint);
      setData(summary);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load usage summary.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      setIsLoading(true);
      try {
        const summary = await fetchUsageSummary(endpoint);
        if (!active) {
          return;
        }
        setData(summary);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load usage summary.",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    if (refreshIntervalMs && refreshIntervalMs > 0) {
      timer = window.setInterval(() => {
        void load();
      }, refreshIntervalMs);
    }

    return () => {
      active = false;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [endpoint, refreshIntervalMs]);

  return { data, error, isLoading, refresh };
}
