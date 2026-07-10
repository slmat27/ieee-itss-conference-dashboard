import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StackProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Stack({ children, className, style }: StackProps) {
  return (
    <div className={cn("ui-stack", className)} style={style}>
      {children}
    </div>
  );
}
