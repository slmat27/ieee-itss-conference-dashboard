import { Tag, type TagProps } from "antd";

import { cn } from "@/lib/utils";

export type BadgeProps = TagProps & {
  tone?: "default" | "success" | "info" | "warning" | "danger";
};

export function Badge({
  className,
  tone = "default",
  color,
  ...props
}: BadgeProps) {
  const resolvedColor =
    color ??
    (tone === "success"
      ? "success"
      : tone === "info"
        ? "processing"
        : tone === "warning"
          ? "warning"
          : tone === "danger"
            ? "error"
            : undefined);

  return (
    <Tag className={cn("ui-badge", className)} color={resolvedColor} {...props} />
  );
}
