import { UploadOutlined } from "@ant-design/icons";
import {
  Upload as AntUpload,
  type UploadFile,
  type UploadProps,
} from "antd";

import { cn } from "@/lib/utils";

import { Button } from "./button";

export type FileUploadProps = UploadProps & {
  actionLabel?: string;
};

export function FileUpload({
  actionLabel = "Select file",
  // CREATOR_AGENT_CONTRACT: Prevent Ant Design from auto-posting files to an
  // arbitrary URL; uploads must go through the owner-scoped backend API.
  beforeUpload = () => false,
  className,
  ...props
}: FileUploadProps) {
  return (
    <AntUpload
      beforeUpload={beforeUpload}
      className={cn("ui-upload", className)}
      {...props}
    >
      <Button icon={<UploadOutlined aria-hidden="true" />}>{actionLabel}</Button>
    </AntUpload>
  );
}

export type SingleFileUploadProps = Omit<
  FileUploadProps,
  "actionLabel" | "maxCount" | "multiple"
> & {
  actionLabel?: string;
};

export function SingleFileUpload({
  actionLabel = "Select file",
  ...props
}: SingleFileUploadProps) {
  return (
    <FileUpload
      actionLabel={actionLabel}
      maxCount={1}
      multiple={false}
      {...props}
    />
  );
}

export type MultipleFileUploadProps = Omit<
  FileUploadProps,
  "actionLabel" | "multiple"
> & {
  actionLabel?: string;
};

export function MultipleFileUpload({
  actionLabel = "Select files",
  ...props
}: MultipleFileUploadProps) {
  return <FileUpload actionLabel={actionLabel} multiple {...props} />;
}

export type { UploadFile };
