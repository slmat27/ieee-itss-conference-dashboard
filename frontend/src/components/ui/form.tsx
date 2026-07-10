import { Form as AntForm, type FormProps as AntFormProps } from "antd";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type FormProps<Values = unknown> = Omit<
  AntFormProps<Values>,
  "children"
> & {
  children?: ReactNode;
};

export function Form<Values = unknown>({
  className,
  layout = "vertical",
  ...props
}: FormProps<Values>) {
  return (
    <AntForm<Values>
      className={cn("ui-form", className)}
      layout={layout}
      {...props}
    />
  );
}

export const FormItem = AntForm.Item;
