import { Typography } from "antd";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageTitleProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function PageTitle({ children, className, style }: PageTitleProps) {
  return (
    <Typography.Title level={1} className={cn("ui-page-title", className)} style={style}>
      {children}
    </Typography.Title>
  );
}
