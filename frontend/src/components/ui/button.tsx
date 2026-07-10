import { Button as AntButton, type ButtonProps as AntButtonProps } from "antd";

import { cn } from "@/lib/utils";

export type ButtonProps = AntButtonProps;

export function Button({ className, ...props }: ButtonProps) {
  return <AntButton className={cn("ui-button", className)} {...props} />;
}
