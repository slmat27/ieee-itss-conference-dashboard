import { Input as AntInput, type InputProps as AntInputProps } from "antd";

import { cn } from "@/lib/utils";

export type InputProps = AntInputProps;

export function Input({ className, ...props }: InputProps) {
  return <AntInput className={cn("ui-input", className)} {...props} />;
}
