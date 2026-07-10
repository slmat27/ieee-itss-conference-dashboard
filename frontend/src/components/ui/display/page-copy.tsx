import { Typography } from "antd";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageCopyProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function PageCopy({ children, className, style }: PageCopyProps) {
  return (
    <Typography.Paragraph className={cn("ui-page-copy", className)} style={style}>
      {children}
    </Typography.Paragraph>
  );
}
