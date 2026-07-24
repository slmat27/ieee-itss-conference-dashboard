import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAccess } from "@/hooks/useAccess";
import { api } from "@/lib/api";
import type { AppSettings, Conference, Issue } from "@/types/conference";

interface ItemResponse<T> {
  items: T[];
}

interface IssueFormValues {
  conference_id: string;
  title: string;
  description?: string;
  category: string;
  severity: string;
  owner?: string;
  due_date?: string;
}

interface GenerationResult {
  conference_id: string;
  conference_name: string;
  conference_status: string;
  updated_status?: string;
  created: number;
  skipped_duplicates: number;
  status: "created" | "no_new_issues" | "failed";
  error?: string;
}

interface GenerationSummary {
  eligible_statuses: string[];
  reviewed: number;
  created: number;
  no_new_issues: number;
  failed: number;
  skipped_duplicates: number;
  results: GenerationResult[];
}

const fallbackCategories = [
  "Governance",
  "Finance",
  "Publication",
  "Operations",
  "Registration",
  "Data Quality",
  "Document",
  "AI Review",
];
const fallbackSeverities = ["Informational", "Low", "Medium", "High", "Critical"];

function severityColor(value?: string) {
  switch (value?.toLowerCase()) {
    case "critical":
      return "magenta";
    case "high":
      return "red";
    case "medium":
      return "gold";
    case "low":
      return "blue";
    default:
      return "default";
  }
}

function referenceValues(
  settings: AppSettings | null,
  key: string,
  fallback: string[],
): string[] {
  const values: unknown = settings?.reference_config?.[key];
  if (!Array.isArray(values)) return fallback;
  const strings = values.filter((value): value is string => typeof value === "string");
  return strings.length ? strings : fallback;
}

export default function Issues() {
  const navigate = useNavigate();
  const { hasPermission } = useAccess();
  const canEditIssues = hasPermission("issue_edit");
  const [form] = Form.useForm<IssueFormValues>();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationSummary, setGenerationSummary] = useState<GenerationSummary | null>(null);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const categories = useMemo(
    () => referenceValues(settings, "issue_categories", fallbackCategories),
    [settings],
  );
  const severities = useMemo(
    () => referenceValues(settings, "issue_severities", fallbackSeverities),
    [settings],
  );

  const fetchIssues = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("assessment", statusFilter);
    const qs = params.toString();
    api<ItemResponse<Issue>>(`/issues${qs ? `?${qs}` : ""}`)
      .then((data) => {
        const rows = data.items ?? [];
        setIssues(
          severityFilter
            ? rows.filter((issue) => issue.severity === severityFilter)
            : rows,
        );
      })
      .catch((err) => message.error(err instanceof Error ? err.message : "Issues could not be loaded"))
      .finally(() => setLoading(false));
  }, [severityFilter, statusFilter]);

  useEffect(() => {
    Promise.all([
      api<ItemResponse<Conference>>("/conferences"),
      api<AppSettings>("/settings"),
    ])
      .then(([conferenceData, settingsData]) => {
        setConferences(conferenceData.items ?? []);
        setSettings(settingsData);
      })
      .catch((err) => message.warning(err instanceof Error ? err.message : "Issue options could not be loaded"));
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const openCreate = () => {
    setActiveIssue(null);
    form.resetFields();
    form.setFieldsValue({ category: categories[0] ?? "Data Quality", severity: "Medium" });
    setEditorOpen(true);
  };

  const openEdit = (issue: Issue) => {
    setActiveIssue(issue);
    form.setFieldsValue({
      conference_id: issue.conference_id,
      title: issue.title ?? "",
      description: issue.description,
      category: issue.category ?? categories[0] ?? "Data Quality",
      severity: issue.severity ?? "Medium",
      owner: issue.owner ?? undefined,
      due_date: issue.due_date ?? undefined,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const endpoint = activeIssue ? `/issues/${activeIssue.id}` : "/issues";
      await api(endpoint, {
        method: activeIssue ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      message.success(activeIssue ? "Issue updated" : "Issue added");
      setEditorOpen(false);
      setActiveIssue(null);
      form.resetFields();
      fetchIssues();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Issue could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api(`/issues/${id}/resolve`, { method: "POST" });
      message.success("Issue resolved");
      fetchIssues();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to resolve issue");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/issues/${id}`, { method: "DELETE" });
      message.success("Issue deleted");
      fetchIssues();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete issue");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerationSummary(null);
    try {
      const result = await api<GenerationSummary>("/issues/generate-from-watchlist", {
        method: "POST",
      });
      setGenerationSummary(result);
      message.success(
        result.created
          ? `${result.created} issue${result.created === 1 ? "" : "s"} created`
          : "AI review completed with no new issues",
      );
      fetchIssues();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "AI issue generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const columns: ColumnsType<Issue> = [
    {
      title: "Issue",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (value: string, record) => (
        <Space direction="vertical" size={1}>
          <Typography.Text strong>{value || record.issue_key || "Issue"}</Typography.Text>
          <Typography.Text type="secondary" ellipsis={{ tooltip: record.description || "-" }}>
            {record.description || "-"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Conference",
      key: "conference",
      width: 175,
      render: (_, record) => (
        <Button type="link" className="table-link" onClick={() => void navigate(`/conferences/${record.conference_id}`)}>
          {record.conference_name || record.conference_acronym || "-"}
        </Button>
      ),
    },
    {
      title: "Severity",
      dataIndex: "severity",
      key: "severity",
      width: 105,
      render: (value: string) => <Tag color={severityColor(value)}>{value || "-"}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "issue_status",
      key: "issue_status",
      width: 110,
      render: (value: string) => {
        const normalized = String(value).toLowerCase();
        return (
          <Tag
            color={normalized === "open" ? "red" : normalized.includes("progress") ? "gold" : "green"}
            icon={
              normalized === "open" ? (
                <ExclamationCircleOutlined />
              ) : normalized === "resolved" ? (
                <CheckCircleOutlined />
              ) : undefined
            }
          >
            {value || "-"}
          </Tag>
        );
      },
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 125,
      responsive: ["lg"],
      render: (value: string) => value || "-",
    },
    {
      title: "Source",
      dataIndex: "source_type",
      key: "source_type",
      width: 90,
      responsive: ["xl"],
      render: (value: string) => <Tag color={value === "LLM" ? "purple" : "default"}>{value || "-"}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "date_detected",
      key: "date_detected",
      width: 105,
      responsive: ["xl"],
      render: (value: string) => (value ? new Date(value).toLocaleDateString() : "-"),
    },
    {
      title: "Actions",
      key: "actions",
      width: canEditIssues ? 130 : 0,
      align: "right",
      render: (_, record) =>
        canEditIssues ? (
          <Space size={4}>
            <Button
              size="small"
              title="Edit issue"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
            {String(record.issue_status ?? record.status).toLowerCase() !== "resolved" && (
              <Button
                size="small"
                type="primary"
                title="Resolve issue"
                icon={<CheckCircleOutlined />}
                onClick={() => void handleResolve(record.id)}
              />
            )}
            <Popconfirm
              title="Delete this issue?"
              description="This permanently removes the issue."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(record.id)}
            >
              <Button size="small" danger title="Delete issue" icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Portfolio risk register</Typography.Text>
          <h1>Issues</h1>
          <Typography.Text type="secondary">
            Track operational risks, assign follow-up, and review conferences that need attention.
          </Typography.Text>
        </div>
        <Space direction="vertical" size={8} align="end">
          <Space>
            <Select
              placeholder="All Assessments"
              allowClear
              style={{ width: 158 }}
              value={statusFilter || undefined}
              onChange={(value) => setStatusFilter(value || "")}
              options={[
                { label: "Unreviewed", value: "Unreviewed" },
                { label: "Needs Follow-up", value: "Needs Follow-up" },
                { label: "On Track", value: "On Track" },
                { label: "Not an Issue", value: "Not an Issue" },
              ]}
            />
            <Select
              placeholder="All Severities"
              allowClear
              style={{ width: 145 }}
              value={severityFilter || undefined}
              onChange={(value) => setSeverityFilter(value || "")}
              options={severities.map((value) => ({ label: value, value }))}
            />
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchIssues}>
              Refresh
            </Button>
            {canEditIssues && (
              <>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add Issue
              </Button>
              <Button icon={<RobotOutlined />} onClick={() => setGenerationOpen(true)}>
                AI Generate Issues
              </Button>
              </>
            )}
          </Space>
        </Space>
      </div>

      <Card className="issues-table-card">
        <Table
          dataSource={issues}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} issues` }}
          size="middle"
          tableLayout="fixed"
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={activeIssue ? "Edit Issue" : "Add Issue"}
        open={editorOpen}
        okText={activeIssue ? "Save Changes" : "Add Issue"}
        confirmLoading={saving}
        onOk={() => void handleSave()}
        onCancel={() => {
          setEditorOpen(false);
          setActiveIssue(null);
          form.resetFields();
        }}
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="conference_id"
            label="Conference"
            rules={[{ required: true, message: "Select a conference" }]}
          >
            <Select
              showSearch
              disabled={Boolean(activeIssue)}
              optionFilterProp="label"
              placeholder="Search conference"
              options={conferences.map((conference) => ({
                value: conference.id,
                label: `${conference.canonical_name}${conference.conference_number ? ` · Record ${conference.conference_number}` : ""}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="title" label="Issue Title" rules={[{ required: true, message: "Enter an issue title" }]}>
            <Input maxLength={240} placeholder="Clear, actionable issue title" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} placeholder="Describe the evidence, impact, and required follow-up" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select options={categories.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
                <Select options={severities.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="owner" label="Owner">
                <Input placeholder="Person responsible for follow-up" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="due_date" label="Due Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={<Space><RobotOutlined /> AI Generate Issues</Space>}
        open={generationOpen}
        okText={generationSummary ? "Run Again" : "Review and Generate"}
        cancelText={generationSummary ? "Close" : "Cancel"}
        confirmLoading={generating}
        onOk={() => void handleGenerate()}
        onCancel={() => {
          if (!generating) {
            setGenerationOpen(false);
            setGenerationSummary(null);
          }
        }}
        closable={!generating}
        maskClosable={!generating}
        width={720}
      >
        {!generationSummary ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message="The configured LLM will review conferences needing attention"
              description="Every active conference currently marked Attention Needed or At Risk will be checked against its facts, milestones, comments, current statuses, and relevant IEEE ITSS knowledge-base content."
            />
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              Actionable findings will be saved as open issues. Existing active issues with the same title are skipped.
              This operation may take a little while because conferences are reviewed one at a time.
            </Typography.Paragraph>
          </Space>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Alert
              type={generationSummary.failed ? "warning" : "success"}
              showIcon
              message={`${generationSummary.created} issues created across ${generationSummary.reviewed} reviewed conferences`}
              description={`${generationSummary.no_new_issues} produced no new issues, ${generationSummary.skipped_duplicates} duplicates were skipped, and ${generationSummary.failed} reviews failed.`}
            />
            <List
              size="small"
              bordered
              dataSource={generationSummary.results}
              renderItem={(result) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <Typography.Text strong>{result.conference_name}</Typography.Text>
                        <Tag>{result.conference_status}</Tag>
                        {result.status === "failed" ? (
                          <Tag color="red">Failed</Tag>
                        ) : result.created ? (
                          <Tag color="green">{result.created} created</Tag>
                        ) : (
                          <Tag>No new issues</Tag>
                        )}
                      </Space>
                    }
                    description={
                      result.error ||
                      (result.skipped_duplicates
                        ? `${result.skipped_duplicates} active duplicate${result.skipped_duplicates === 1 ? "" : "s"} skipped`
                        : "Review completed")
                    }
                  />
                </List.Item>
              )}
            />
          </Space>
        )}
      </Modal>
    </div>
  );
}
