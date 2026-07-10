import { useCallback, useEffect, useMemo, useState } from "react";

import { useNotificationStream } from "@/components/widgets/notifications/use-notification-stream";
import { createJob, deleteJob, fetchJob, fetchJobs } from "@/lib/api/jobs";
import type { AppNotification } from "@/types";
import type {
  CreateJobResponse,
  JobDetail,
  JobSummary,
  JobsListResponse,
} from "@/types/jobs";

const EMPTY_JOBS_RESPONSE: JobsListResponse = {
  items: [],
  summary: {
    failed: 0,
    finished: 0,
    pending: 0,
    running: 0,
    total: 0,
  },
};

export type JobsState = Readonly<{
  data: JobsListResponse;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}>;

export function useJobs({ refreshIntervalMs = 5000 } = {}): JobsState {
  // CREATOR_AGENT_CONTRACT: Websocket events trigger immediate refreshes, while
  // polling remains the fallback when a proxy or local setup drops the socket.
  const { events } = useNotificationStream({ maxEvents: 50 });
  const [data, setData] = useState<JobsListResponse>(EMPTY_JOBS_RESPONSE);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextData = await fetchJobs();
      setData(nextData);
      setError(null);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Unable to load runs."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) {
        return;
      }
      await refresh();
    };

    void load();
    const interval =
      refreshIntervalMs > 0
        ? window.setInterval(() => void load(), refreshIntervalMs)
        : undefined;
    return () => {
      active = false;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [refresh, refreshIntervalMs]);

  const latestRunEventId = latestRunNotification(events)?.id;
  useEffect(() => {
    if (latestRunEventId) {
      void refresh();
    }
  }, [latestRunEventId, refresh]);

  return { data, error, isLoading, refresh };
}

export type JobDetailState = Readonly<{
  data: JobDetail | null;
  error: string | null;
  events: AppNotification[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}>;

export function useJobDetail({
  jobId,
  refreshIntervalMs = 1500,
}: {
  jobId: string;
  refreshIntervalMs?: number;
}): JobDetailState {
  // CREATOR_AGENT_CONTRACT: Fetch details through /api/runs/{id}; do not read
  // generated output files directly from browser-visible storage paths.
  const { events: notificationEvents } = useNotificationStream({ maxEvents: 100 });
  const [data, setData] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const nextData = await fetchJob(jobId);
      setData(nextData);
      setError(null);
    } catch (fetchError) {
      setError(toErrorMessage(fetchError, "Unable to load run."));
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  const matchingEvents = useMemo(
    () =>
      notificationEvents.filter((event) => notificationRunId(event) === jobId),
    [jobId, notificationEvents],
  );
  const latestMatchingEventId = matchingEvents.at(-1)?.id;

  useEffect(() => {
    if (latestMatchingEventId) {
      void refresh();
    }
  }, [latestMatchingEventId, refresh]);

  const effectiveRefreshIntervalMs =
    data && !isActiveJob(data) ? 0 : refreshIntervalMs;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!active) {
        return;
      }
      await refresh();
    };

    void load();
    const interval =
      effectiveRefreshIntervalMs > 0
        ? window.setInterval(() => void load(), effectiveRefreshIntervalMs)
        : undefined;
    return () => {
      active = false;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [effectiveRefreshIntervalMs, refresh]);

  return {
    data,
    error,
    events: data
      ? [...matchingEvents, toSyntheticNotification(data)]
      : matchingEvents,
    isLoading,
    refresh,
  };
}

export type JobCreateState = Readonly<{
  error: string | null;
  isSubmitting: boolean;
  lastCreated: CreateJobResponse | null;
  submit: (values: JobStartValues) => Promise<CreateJobResponse | null>;
}>;

export type JobDeleteState = Readonly<{
  error: string | null;
  isDeleting: boolean;
  remove: (jobId: string) => Promise<boolean>;
}>;

export type JobStartValues = Readonly<{
  title?: string;
  outputTag?: string;
  workflowDelaySeconds?: number;
  files?: Array<{ originFileObj?: File }>;
}>;

export function useCreateJob(): JobCreateState {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreateJobResponse | null>(
    null,
  );

  const submit = async (values: JobStartValues) => {
    const files = (values.files ?? [])
      .map((file) => file.originFileObj)
      .filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      setError("Select at least one input file.");
      return null;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createJob({
        files,
        outputTag: values.outputTag?.trim() || "<Processed>",
        title: values.title?.trim() ?? "",
        workflowDelaySeconds: values.workflowDelaySeconds ?? 5,
      });
      setLastCreated(created);
      return created;
    } catch (submitError) {
      setError(toErrorMessage(submitError, "Unable to start run."));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, lastCreated, submit };
}

export function useDeleteJob(): JobDeleteState {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const remove = async (jobId: string) => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteJob(jobId);
      return true;
    } catch (deleteError) {
      setError(toErrorMessage(deleteError, "Unable to delete run."));
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { error, isDeleting, remove };
}

export type JobEventItem = Readonly<{
  id: string;
  jobId: string;
  title: string;
  state: JobSummary["state"];
  message: string;
  createdAt: string;
  level: AppNotification["level"];
}>;

export function useJobEvents(maxEvents = 8): JobEventItem[] {
  const { events } = useNotificationStream({ maxEvents });
  const { data } = useJobs({ refreshIntervalMs: 5000 });
  const runEvents = useMemo(
    () =>
      events
        .filter(isRunNotification)
        .slice(-maxEvents)
        .reverse()
        .map(toJobEventItem),
    [events, maxEvents],
  );

  return useMemo(
    () => {
      if (runEvents.length > 0) {
        return runEvents;
      }
      return data.items
        .slice(0, maxEvents)
        .map((item) => ({
          createdAt: item.updated_at,
          id: `run-${item.job_id}-${item.updated_at}`,
          jobId: item.job_id,
          level: stateLevel(item.state),
          message: `${item.title} is ${stateLabel(item.state).toLowerCase()}.`,
          state: item.state,
          title: item.title,
        }));
    },
    [data.items, maxEvents, runEvents],
  );
}

export function isActiveJob(job: JobSummary | JobDetail): boolean {
  return job.state === "pending" || job.state === "running";
}

function toSyntheticNotification(job: JobDetail): AppNotification {
  return {
    created_at: job.updated_at,
    id: `run-${job.job_id}-${job.updated_at}`,
    level: stateLevel(job.state),
    message:
      job.status_message ??
      `${job.title} is ${stateLabel(job.state).toLowerCase()}.`,
    payload: {
      job_id: job.job_id,
      run_id: job.job_id,
      state: job.state,
      status_message: job.status_message,
      title: job.title,
      workflow_delay_seconds: job.workflow_delay_seconds,
    },
    title: job.title,
    type: "run.snapshot",
  };
}

function latestRunNotification(events: AppNotification[]): AppNotification | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && isRunNotification(event)) {
      return event;
    }
  }
  return null;
}

function isRunNotification(event: AppNotification): boolean {
  return event.type.startsWith("run.");
}

function notificationRunId(event: AppNotification): string | null {
  const runId = event.payload.run_id ?? event.payload.job_id;
  return typeof runId === "string" && runId.trim() ? runId : null;
}

function toJobEventItem(event: AppNotification): JobEventItem {
  return {
    createdAt: event.created_at,
    id: event.id,
    jobId: notificationRunId(event) ?? "",
    level: event.level,
    message: event.message,
    state: notificationState(event),
    title: event.title,
  };
}

function notificationState(event: AppNotification): JobSummary["state"] {
  const state = event.payload.state;
  if (state === "queued") {
    return "pending";
  }
  if (state === "completed" || state === "deleted") {
    return "finished";
  }
  if (state === "running" || state === "failed") {
    return state;
  }
  return "pending";
}

function stateLevel(state: JobSummary["state"]): AppNotification["level"] {
  if (state === "finished") {
    return "success";
  }
  if (state === "failed") {
    return "error";
  }
  return "info";
}

function stateLabel(state: JobSummary["state"]): string {
  if (state === "pending") {
    return "Pending";
  }
  if (state === "running") {
    return "Running";
  }
  if (state === "failed") {
    return "Failed";
  }
  return "Completed";
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
