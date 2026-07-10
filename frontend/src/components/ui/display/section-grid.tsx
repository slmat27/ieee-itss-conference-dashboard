import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SectionGridProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SectionGrid({ children, className, style }: SectionGridProps) {
  return (
    <section className={cn("ui-section-grid", className)} style={style}>
      {children}
    </section>
  );
}
