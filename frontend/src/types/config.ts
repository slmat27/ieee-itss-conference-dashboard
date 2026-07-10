export type ApiAppConfig = Readonly<{
  display_name: string;
  description: string;
  max_upload_files: number;
  max_upload_size_bytes: number;
  allowed_model_aliases: string[];
  default_model_alias: string;
  workflow_delay_seconds: number;
  workflow_output_tag: string;
  retention_cleanup_enabled: boolean;
  retention_days: number;
}>;
