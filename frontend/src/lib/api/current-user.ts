import { DEV_FALLBACK_USER, type ApiCurrentUser, type UserProfile, toUserProfile } from "@/types";

import { requestJson } from "./http";

export async function fetchCurrentUser(): Promise<UserProfile> {
  try {
    // CREATOR_AGENT_CONTRACT: User identity comes from the backend's trusted
    // header resolution. Do not infer production identity in frontend code.
    const user = await requestJson<ApiCurrentUser>("/api/me");
    return toUserProfile(user);
  } catch (error) {
    if (import.meta.env.DEV) {
      // CREATOR_AGENT_CONTRACT: This fallback is local-development-only.
      return DEV_FALLBACK_USER;
    }

    throw error;
  }
}
