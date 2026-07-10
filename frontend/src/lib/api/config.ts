import type { ApiAppConfig } from "@/types";

import { requestJson } from "./http";

export async function fetchAppConfig(): Promise<ApiAppConfig> {
  // CREATOR_AGENT_CONTRACT: Load public app limits and display metadata from
  // the backend instead of duplicating platform-facing settings in the UI.
  return requestJson<ApiAppConfig>("/api/config");
}
