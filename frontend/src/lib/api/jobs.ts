import type {
  ApiCreateRunResponse,
  ApiRunDetail,
  ApiRunSummary,
  ApiRunsListResponse,
  CreateJobResponse,
  JobDetail,
  JobState,
  JobSummary,
  JobsListResponse,
} from "@/types/jobs";

import { requestJson, responseErrorMessage } from "./http";

export async function fetchJobs(
  endpoint = "/api/runs",
): Promise<JobsListResponse> {
  // CREATOR_AGENT_CONTRACT: Keep run listing owner-scoped through the backend.
  // The frontend should never construct storage paths or cross-user queries.
  const payload = await requestJson<ApiRunsListResponse>(endpoint);
  return {
    items: payload.items.map(toJobSummary),
    summary: summarizeJobs(payload.items.map(toJobSummary)),
  };
}

export async function fetchJob(
  jobId: string,
  endpoint = `/api/runs/${jobId}`,
): Promise<JobDetail> {
  const payload = await requestJson<ApiRunDetail>(endpoint);
  let logText = "";
  try {
    logText = await fetchJobLogs(jobId);
  } catch {
    logText = "";
  }
  return toJobDetail(payload, logText);
}

export async function fetchJobLogs(jobId: string): Promise<string> {
  const response = await fetch(`/api/runs/${jobId}/logs`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
  return response.text();
}

export async function createJob({
  endpoint = "/api/runs",
  files,
  outputTag,
  title,
  workflowDelaySeconds,
}: {
  endpoint?: string;
  files: File[];
  outputTag: string;
  title: string;
  workflowDelaySeconds: number;
}): Promise<CreateJobResponse> {
  // CREATOR_AGENT_CONTRACT: Upload through the app backend so filename,
  // ownership, and size checks stay centralized in server-side storage code.
  const formData = new FormData();
  if (title.trim()) {
    formData.append("title", title.trim());
  }
  formData.append("workflow_delay_seconds", String(workflowDelaySeconds));
  formData.append("output_tag", outputTag.trim());
  for (const file of files) {
    formData.append("files", file);
  }

  const payload = await requestJson<ApiCreateRunResponse>(endpoint, {
    body: formData,
    method: "POST",
  });

  return {
    detail_url: payload.status_url,
    job_id: payload.run_id,
    state: toJobState(payload.state),
  };
}

export async function deleteJob(
  jobId: string,
  endpoint = `/api/runs/${jobId}`,
): Promise<void> {
  const response = await fetch(endpoint, {
    credentials: "include",
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

function toJobSummary(run: ApiRunSummary): JobSummary {
  return {
    aux_file_count: 0,
    completed_at: run.completed_at,
    created_at: run.created_at,
    current_iteration: toJobState(run.state) === "finished" ? 1 : 0,
    download_url: firstDownloadUrl(run.output_files, {}),
    error: run.error,
    files: run.input_files,
    job_id: run.run_id,
    output_files: run.output_files,
    state: toJobState(run.state),
    started_at: run.started_at,
    status_message: run.status_message,
    target_language: null,
    title: run.title || shortId(run.run_id),
    total_iterations: 1,
    updated_at: run.updated_at,
    workflow_delay_seconds: run.workflow_delay_seconds,
    workflow_type: "poc-run",
  };
}

function toJobDetail(run: ApiRunDetail, logText: string): JobDetail {
  const summary = toJobSummary(run);
  return {
    ...summary,
    aux_files: [],
    custom_instructions: null,
    download_url: firstDownloadUrl(run.output_files, run.download_urls),
    iteration_prompts: [],
    last_log_lines: splitLines(logText).slice(-80),
    log_text: logText,
    logs: run.logs,
    session_id: null,
  };
}

function summarizeJobs(items: JobSummary[]): JobsListResponse["summary"] {
  return {
    failed: items.filter((item) => item.state === "failed").length,
    finished: items.filter((item) => item.state === "finished").length,
    pending: items.filter((item) => item.state === "pending").length,
    running: items.filter((item) => item.state === "running").length,
    total: items.length,
  };
}

function firstDownloadUrl(
  outputFiles: ApiRunSummary["output_files"],
  downloadUrls: Record<string, string>,
): string | null {
  for (const file of outputFiles) {
    const url = downloadUrls[file.stored_name];
    if (url) {
      return url;
    }
  }
  return null;
}

function toJobState(value: string): JobState {
  if (value === "queued") {
    return "pending";
  }
  if (value === "completed") {
    return "finished";
  }
  if (value === "running" || value === "failed") {
    return value;
  }
  return "pending";
}

function splitLines(value: string): string[] {
  return value ? value.split(/\r?\n/).filter((line) => line.length > 0) : [];
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
