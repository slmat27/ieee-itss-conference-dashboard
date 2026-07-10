import type { ApiUsageSummary } from "@/types";

import { requestJson } from "./http";

const DEFAULT_USAGE_SUMMARY: ApiUsageSummary = {
  runs: 0,
  completed: 0,
  // CREATOR_AGENT_OPTIONAL: The main template backend reports zero token/cost
  // values. Wire these to real LLM usage metrics only when the POC tracks them.
  tokens: 0,
  cost: 0,
};

/**
 * Fetches the user-scoped run, completion, token, and cost totals from the
 * boilerplate backend usage endpoint.
 */
export async function fetchUsageSummary(
  endpoint = "/api/usage",
): Promise<ApiUsageSummary> {
  const payload = await requestJson<Partial<ApiUsageSummary>>(endpoint);

  return {
    runs: normalizeCount(payload.runs),
    completed: normalizeCount(payload.completed),
    tokens: normalizeCount(payload.tokens),
    cost: normalizeCost(payload.cost),
  };
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(Math.trunc(value), 0)
    : 0;
}

function normalizeCost(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export { DEFAULT_USAGE_SUMMARY };
