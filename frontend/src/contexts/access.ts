import { createContext } from "react";

export interface AccessContextValue {
  featureFlags: Record<string, boolean>;
  permissions: Record<string, boolean>;
  roleKey: string;
  isAdmin: boolean;
  canEdit: boolean;
  canManageTemplates: boolean;
  hasPermission: (permission: string) => boolean;
}

export const DEFAULT_ACCESS: AccessContextValue = {
  featureFlags: {},
  permissions: {},
  roleKey: "administrator",
  isAdmin: false,
  canEdit: false,
  canManageTemplates: false,
  hasPermission: () => false,
};

export const AccessContext = createContext<AccessContextValue>(DEFAULT_ACCESS);
