import { createContext, useContext, type ReactNode } from "react";

export interface AccessContextValue {
  featureFlags: Record<string, boolean>;
  permissions: Record<string, boolean>;
  roleKey: string;
  isAdmin: boolean;
  canEdit: boolean;
  canManageTemplates: boolean;
  hasPermission: (permission: string) => boolean;
}

const DefaultAccess: AccessContextValue = {
  featureFlags: {},
  permissions: {},
  roleKey: "administrator",
  isAdmin: false,
  canEdit: false,
  canManageTemplates: false,
  hasPermission: () => false,
};

export const AccessContext = createContext<AccessContextValue>(DefaultAccess);

export function useAccess(): AccessContextValue {
  return useContext(AccessContext);
}

export function useFeatureFlag(flag: string): boolean {
  const { featureFlags } = useAccess();
  return featureFlags[flag] ?? false;
}

export type AccessProviderProps = {
  children: ReactNode;
  value: AccessContextValue;
};

export function AccessProvider({ children, value }: AccessProviderProps) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
