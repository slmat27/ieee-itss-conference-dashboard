import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Page({ children, className, style }: PageProps) {
  return (
    <main className={cn("ui-page", className)} style={style}>
      {children}
    </main>
  );
}
