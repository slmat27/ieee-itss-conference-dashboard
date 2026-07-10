import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ActionGroupProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function ActionGroup({ children, className, style }: ActionGroupProps) {
  return (
    <div className={cn("ui-actions", className)} style={style}>
      {children}
    </div>
  );
}
