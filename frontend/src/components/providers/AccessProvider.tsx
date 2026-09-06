import type { ReactNode } from "react";

import { AccessContext, type AccessContextValue } from "@/contexts/access";

export interface AccessProviderProps {
  children: ReactNode;
  value: AccessContextValue;
}

export function AccessProvider({ children, value }: AccessProviderProps) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
