import { useContext } from "react";

import { AccessContext } from "@/contexts/access";

export function useAccess() {
  return useContext(AccessContext);
}

export function useFeatureFlag(flag: string): boolean {
  const { featureFlags } = useAccess();
  return featureFlags[flag] ?? false;
}
