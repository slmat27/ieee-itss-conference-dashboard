import { requestJson } from "@/lib/api/http";

import type { DemoFormPayload, DemoFormResponse } from "./types";

export async function submitDemoForm(
  endpoint: string,
  payload: DemoFormPayload,
): Promise<DemoFormResponse> {
  // CREATOR_AGENT_OPTIONAL: This endpoint is not implemented by the main
  // backend template. Replace it with a real POC API before using DemoFormCard.
  return requestJson<DemoFormResponse>(endpoint, {
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}
