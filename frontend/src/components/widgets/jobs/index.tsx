import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Empty,
  Popconfirm,
  Skeleton,
  Table,
  type TableColumnsType,
} from "antd";
import type { UploadFile, UploadProps } from "antd";

import {
  ActionGroup,
  Badge,
  Button,
  Card,
  Form,
  FormItem,
  Input,
  MultipleFileUpload,
  PageCopy,
  PageTitle,
  Stack,
  useForm,
} from "@/components/ui";
import type { AppNotification } from "@/types";
import type { JobDetail, JobFile, JobState, JobSummary } from "@/types/jobs";

import "./job-workflow.css";
import {
  isActiveJob,
  useCreateJob,
  useDeleteJob,
  useJobDetail,
  useJobEvents,
  useJobs,
  type JobEventItem,
  type JobStartValues,
} from "./use-jobs";

export type JobStartFormCardProps = Readonly<{
  embedded?: boolean;
  maxFiles?: number;
  outputTag?: string;
  workflowDelaySeconds?: number;
  onCreated?: (jobId: string) => void;
}>;

export function JobStartFormCard({
  embedded = false,
  maxFiles = 20,
  outputTag = "<Processed>",
  workflowDelaySeconds = 5,
  onCreated,
}: JobStartFormCardProps) {
  // Generic run intake retained for the local workflow smoke path.
  const [form] = useForm<JobStartValues>();
  const { error, isSubmitting, lastCreated, submit } = useCreateJob();

  const handleSubmit = async (values: JobStartValues) => {
    const created = await submit({
      ...values,
      outputTag,
      workflowDelaySeconds,
    });
    if (!created) {
      return;
    }
    form.resetFields();
    onCreated?.(created.job_id);
  };

  const content = (
    <Stack>
      <Form<JobStartValues>
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
      >
        <FormItem label="Run title" name="title">
          <Input placeholder="Optional short title" />
        </FormItem>

        <FormItem
          getValueFromEvent={normalizeUploadEvent}
          label="Input files"
          name="files"
          rules={[
            {
              message: "Select at least one input file.",
              validator: (_, value?: UploadFile[]) =>
                value && value.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("Select at least one input file.")),
            },
          ]}
          valuePropName="fileList"
        >
          <MultipleFileUpload
            actionLabel="Select files"
            maxCount={maxFiles}
          />
        </FormItem>

        <ActionGroup>
          <Button htmlType="submit" loading={isSubmitting} type="primary">
            Start run
          </Button>
          <Button htmlType="button" onClick={() => form.resetFields()}>
            Reset
          </Button>
        </ActionGroup>
      </Form>

      {error ? (
        <Alert message={error} showIcon type="warning" />
      ) : lastCreated ? (
        <Alert
          message={`Run ${shortId(lastCreated.job_id)} started.`}
          showIcon
          type="success"
        />
      ) : null}
    </Stack>
  );

  return embedded ? content : <Card title="Start Run">{content}</Card>;
}

export type JobsTableWidgetProps = Readonly<{
  onOpenJob: (jobId: string) => void;
}>;

export function JobsTableWidget({ onOpenJob }: JobsTableWidgetProps) {
  // Generic run table retained for reusable local workflow jobs.
  const { data, error, isLoading, refresh } = useJobs();
  const columns = createJobColumns();

  return (
    <Card
      title="Runs"
      extra={
        <Button
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      }
    >
      <Stack>
        <div className="job-workflow__summary" aria-label="Run summary">
          <JobMetric label="Total" value={data.summary.total} />
          <JobMetric label="Pending" value={data.summary.pending} />
          <JobMetric label="Running" value={data.summary.running} />
          <JobMetric label="Completed" value={data.summary.finished} />
          <JobMetric label="Failed" value={data.summary.failed} />
        </div>

        {error ? <Alert message={error} showIcon type="warning" /> : null}

        <Table<JobSummary>
          className="job-workflow__table"
          columns={columns}
          dataSource={data.items}
          loading={isLoading}
          locale={{
            emptyText: (
              <Empty
                description="No runs yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          onRow={(record) => ({
            className: "job-workflow__row",
            onClick: () => onOpenJob(record.job_id),
          })}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          rowKey="job_id"
          size="middle"
        />
      </Stack>
    </Card>
  );
}

export type JobDetailPageProps = Readonly<{
  jobId: string;
  onBack: () => void;
}>;

export function JobDetailPage({ jobId, onBack }: JobDetailPageProps) {
  // Generic run detail retained for reusable local workflow jobs.
  const { data, error, events, isLoading, refresh } = useJobDetail({ jobId });
  const { error: deleteError, isDeleting, remove } = useDeleteJob();

  const handleDelete = async () => {
    const deleted = await remove(jobId);
    if (deleted) {
      onBack();
    }
  };

  if (isLoading && !data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <Stack>
          <ActionGroup>
            <Button
              icon={<ArrowLeftOutlined aria-hidden="true" />}
              onClick={onBack}
            >
              Back
            </Button>
          </ActionGroup>
          <Alert message={error} showIcon type="warning" />
        </Stack>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Stack>
      <Card>
        <Stack>
          <ActionGroup>
            <Button
              icon={<ArrowLeftOutlined aria-hidden="true" />}
              onClick={onBack}
            >
              Back
            </Button>
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
            {data.download_url ? (
              <Button
                href={data.download_url}
                icon={<DownloadOutlined aria-hidden="true" />}
              >
                Download
              </Button>
            ) : null}
            <Popconfirm
              title="Delete this run?"
              description="The run metadata, logs, and output files will be removed."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete()}
            >
              <Button
                danger
                icon={<DeleteOutlined aria-hidden="true" />}
                loading={isDeleting}
              >
                Delete
              </Button>
            </Popconfirm>
          </ActionGroup>

          <div>
            <PageTitle>{data.title}</PageTitle>
            <PageCopy>Run {shortId(data.job_id)}</PageCopy>
          </div>

          <ActionGroup>
            <JobStateBadge state={data.state} />
            <Badge tone="default">POC workflow</Badge>
            {isActiveJob(data) ? <Badge tone="info">Active</Badge> : null}
          </ActionGroup>
        </Stack>
      </Card>

      {error ? <Alert message={error} showIcon type="warning" /> : null}
      {deleteError ? (
        <Alert message={deleteError} showIcon type="warning" />
      ) : null}

      <div className="job-workflow__detail-grid">
        <Card title="Run Details">
          <Stack>
            <JobMetaGrid job={data} />
            {data.error ? (
              <Alert message={data.error} showIcon type="error" />
            ) : null}
          </Stack>
        </Card>

        <Card title="Files">
          <Stack className="ui-stack--tight">
            <FileList files={data.files} title="Inputs" />
            <FileList files={data.output_files} title="Outputs" />
          </Stack>
        </Card>
      </div>

      <Card title="Run Events">
        <AgentLog events={events} job={data} />
      </Card>

      <Card title="Log Output">
        {data.last_log_lines.length > 0 ? (
          <ul className="job-workflow__log-list">
            {data.last_log_lines.map((line, index) => (
              <li key={`${index}-${line}`}>
                <code>{line}</code>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            description="No log output yet"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </Card>
    </Stack>
  );
}

export type JobEventsListProps = Readonly<{
  limit?: number;
}>;

export function JobEventsList({ limit = 8 }: JobEventsListProps) {
  const events = useJobEvents(limit);

  if (events.length === 0) {
    return <div className="job-workflow__events-empty">No run events yet</div>;
  }

  return (
    <div className="job-workflow__events-list" role="log" aria-live="polite">
      {events.map((event) => (
        <JobEventRow event={event} key={event.id} />
      ))}
    </div>
  );
}

function JobEventRow({ event }: { event: JobEventItem }) {
  return (
    <article className="job-workflow__event-row">
      <div className="job-workflow__event-main">
        <strong>{event.title}</strong>
        <span>{event.message}</span>
      </div>
      <div className="job-workflow__event-side">
        <JobStateBadge state={event.state} />
        <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
      </div>
    </article>
  );
}

function JobMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="job-workflow__metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function JobMetaGrid({ job }: { job: JobDetail }) {
  const items = [
    ["State", stateLabel(job.state)],
    ["Status", job.status_message ?? ""],
    ["Delay", `${formatSeconds(job.workflow_delay_seconds)} seconds`],
    ["Created", formatDate(job.created_at)],
    ["Started", formatDate(job.started_at)],
    ["Updated", formatDate(job.updated_at)],
    ["Completed", formatDate(job.completed_at)],
    ["Inputs", String(job.files.length)],
    ["Outputs", String(job.output_files.length)],
  ];

  return (
    <div className="job-workflow__meta">
      {items.map(([label, value]) => (
        <div className="job-workflow__meta-item" key={label}>
          <span>{label}</span>
          <strong>{value || "Not available"}</strong>
        </div>
      ))}
    </div>
  );
}

function FileList({ files, title }: { files: JobFile[]; title: string }) {
  if (files.length === 0) {
    return (
      <div>
        <strong>{title}</strong>
        <Empty description="No files" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div>
      <strong>{title}</strong>
      <ul className="job-workflow__file-list">
        {files.map((file) => (
          <li key={file.relative_path}>
            <span>{file.original_name}</span>
            <span className="job-workflow__muted">
              {formatBytes(file.size_bytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function createJobColumns(): TableColumnsType<JobSummary> {
  return [
    {
      dataIndex: "title",
      key: "title",
      render: (_, record) => (
        <div className="job-workflow__title-cell">
          <strong>{record.title}</strong>
          <span>{shortId(record.job_id)}</span>
        </div>
      ),
      title: "Run",
    },
    {
      dataIndex: "state",
      key: "state",
      render: (state: JobState) => <JobStateBadge state={state} />,
      title: "State",
      width: 140,
    },
    {
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string) => formatDate(value),
      title: "Date",
      width: 220,
    },
    {
      key: "files",
      render: (_, record) =>
        `${record.files.length} file${record.files.length === 1 ? "" : "s"}`,
      title: "Inputs",
      width: 110,
    },
  ];
}

function AgentLog({
  events,
  job,
}: {
  events: AppNotification[];
  job: JobDetail;
}) {
  const logRows = [
    ...events.map((event) => ({
      key: event.id,
      time: event.created_at,
      tone: notificationTone(event.level),
      title: event.title,
      message: event.message,
    })),
    ...job.logs.map((log) => ({
      key: log.relative_path,
      time: job.updated_at,
      tone: "info" as const,
      title: log.name,
      message: `${formatBytes(log.size_bytes)} captured.`,
    })),
  ].sort((left, right) => left.time.localeCompare(right.time)) as Array<{
    key: string;
    message: string;
    time: string;
    title: string;
    tone: "default" | "success" | "info" | "warning" | "danger";
  }>;

  if (logRows.length === 0) {
    return (
      <Empty
        description="No run events yet"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div className="job-workflow__agent-log" role="log" aria-live="polite">
      {logRows.map((row) => (
        <article className="job-workflow__agent-event" key={row.key}>
          <time dateTime={row.time}>{formatTime(row.time)}</time>
          <div>
            <div className="job-workflow__agent-heading">
              <strong>{row.title}</strong>
              <Badge tone={row.tone}>{row.tone}</Badge>
            </div>
            <p>{row.message}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function notificationTone(
  level: AppNotification["level"],
): "default" | "success" | "info" | "warning" | "danger" {
  if (level === "success") {
    return "success";
  }
  if (level === "warning") {
    return "warning";
  }
  if (level === "error") {
    return "danger";
  }
  return "info";
}

function JobStateBadge({ state }: { state: JobState }) {
  return <Badge tone={stateTone(state)}>{stateLabel(state)}</Badge>;
}

function stateTone(
  state: JobState,
): "default" | "success" | "info" | "warning" | "danger" {
  if (state === "finished") {
    return "success";
  }
  if (state === "running") {
    return "info";
  }
  if (state === "failed") {
    return "danger";
  }
  return "warning";
}

function stateLabel(state: JobState): string {
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

function formatDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let current = value / 1024;
  for (const unit of units) {
    if (current < 1024 || unit === units[units.length - 1]) {
      return `${current.toFixed(current >= 10 ? 0 : 1)} ${unit}`;
    }
    current /= 1024;
  }

  return `${value} B`;
}

function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function normalizeUploadEvent(event: UploadProps | UploadFile[]): UploadFile[] {
  if (Array.isArray(event)) {
    return event;
  }

  return event.fileList ?? [];
}
