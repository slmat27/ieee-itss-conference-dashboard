import { Typography } from "antd";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type KickerProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Kicker({ children, className, style }: KickerProps) {
  return (
    <Typography.Text className={cn("ui-kicker", className)} style={style}>
      {children}
    </Typography.Text>
  );
}
