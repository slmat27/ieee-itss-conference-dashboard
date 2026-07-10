export type JobState = "pending" | "running" | "failed" | "finished";

export type ApiRunState = "queued" | "running" | "failed" | "completed";

export type JobFile = Readonly<{
  original_name: string;
  stored_name: string;
  relative_path: string;
  size_bytes: number;
}>;

export type JobLog = Readonly<{
  name: string;
  relative_path: string;
  size_bytes: number;
}>;

export type ApiRunSummary = Readonly<{
  run_id: string;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  status_message: string | null;
  workflow_delay_seconds: number;
  input_files: JobFile[];
  output_files: JobFile[];
  error: string | null;
}>;

export type ApiRunDetail = ApiRunSummary &
  Readonly<{
    logs: JobLog[];
    download_urls: Record<string, string>;
  }>;

export type ApiRunsListResponse = Readonly<{
  items: ApiRunSummary[];
  summary: {
    total: number;
    completed?: number;
    running?: number;
    failed?: number;
    queued?: number;
  };
}>;

export type ApiCreateRunResponse = Readonly<{
  run_id: string;
  state: string;
  status_url: string;
}>;

export type JobSummary = Readonly<{
  job_id: string;
  title: string;
  workflow_type: string;
  target_language: string | null;
  state: JobState;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  status_message: string | null;
  workflow_delay_seconds: number;
  current_iteration: number;
  total_iterations: number;
  files: JobFile[];
  output_files: JobFile[];
  aux_file_count: number;
  download_url: string | null;
  error: string | null;
}>;

export type JobDetail = JobSummary &
  Readonly<{
    session_id: string | null;
    custom_instructions: string | null;
    aux_files: JobFile[];
    iteration_prompts: string[];
    logs: JobLog[];
    last_log_lines: string[];
    log_text: string;
  }>;

export type JobsListResponse = Readonly<{
  items: JobSummary[];
  summary: {
    total: number;
    pending: number;
    running: number;
    failed: number;
    finished: number;
  };
}>;

export type CreateJobResponse = Readonly<{
  job_id: string;
  state: JobState;
  detail_url: string;
}>;
