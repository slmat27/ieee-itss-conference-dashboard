import { Card as AntCard, type CardProps as AntCardProps } from "antd";

import { cn } from "@/lib/utils";

export type CardProps = AntCardProps & {
  compact?: boolean;
};

export function Card({ className, compact = false, ...props }: CardProps) {
  return (
    <AntCard
      className={cn("ui-card", compact && "ui-card--compact", className)}
      {...props}
    />
  );
}
