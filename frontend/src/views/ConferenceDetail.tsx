import {
  ArrowLeftOutlined,
  CommentOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FieldTimeOutlined,
  GlobalOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAccess } from "@/hooks/useAccess";
import { api } from "@/lib/api";
import type { AppSettings, Comment, Conference, Contact, FinanceSnapshot, Milestone } from "@/types/conference";

const STATUS_COLORS: Record<string, string> = {
  unknown: "default",
  open: "blue",
  "not started": "default",
  "in progress": "processing",
  submitted: "blue",
  "awaiting ieee": "gold",
  "awaiting conference": "gold",
  "awaiting external party": "gold",
  approved: "green",
  complete: "green",
  completed: "green",
  published: "green",
  closed: "default",
  blocked: "red",
  rejected: "red",
  cancelled: "default",
  "not applicable": "default",
  resolved: "green",
  "on track": "green",
  "attention needed": "gold",
  "at risk": "orange",
  critical: "red",
};

function statusColor(value?: string | null) {
  return STATUS_COLORS[String(value ?? "").toLowerCase()] ?? "blue";
}

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function dateTimeLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function numberLabel(value?: number | null) {
  return value == null ? "-" : value.toLocaleString();
}

function moneyLabel(value?: number | null) {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function percentLabel(value?: number | null) {
  return value == null || !Number.isFinite(Number(value)) ? "-" : `${Number(value).toFixed(1)}%`;
}

function recordLabel(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : String(value).replace(/\.0+$/, "");
}

function emptyToNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

function statusTag(value?: string | null) {
  return <Tag color={statusColor(value)}>{value || "Unknown"}</Tag>;
}

function fact(label: string, value: ReactNode) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function ConferenceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit, isAdmin } = useAccess();
  const [conference, setConference] = useState<Conference | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [commentEditOpen, setCommentEditOpen] = useState(false);
  const [activeComment, setActiveComment] = useState<Comment | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [factForm] = Form.useForm();
  const [milestoneForm] = Form.useForm();
  const [contactForm] = Form.useForm();
  const [commentForm] = Form.useForm();
  const [newCommentForm] = Form.useForm();
  const [deleteForm] = Form.useForm();

  const statusOptions = settings?.reference_config?.normalized_statuses ?? [
    "Unknown",
    "Not Started",
    "In Progress",
    "Submitted",
    "Approved",
    "Complete",
    "Closed",
    "Blocked",
    "Not Applicable",
  ];
  const phaseOptions = settings?.reference_config?.lifecycle_phases ?? [];
  const contactRoleOptions = settings?.reference_config?.contact_roles ?? [
    "General Chair",
    "Program Chair",
    "Finance Chair",
    "Publications Chair",
    "Information Contact",
    "Other",
  ];

  const loadConference = async () => {
    if (!id) return;
    const [data, financeSnapshots] = await Promise.all([
      api<Conference>(`/conferences/${id}`),
      api<FinanceSnapshot[]>(`/conferences/${id}/snapshots`).catch(() => []),
    ]);
    setConference(data);
    setSnapshots(financeSnapshots);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([loadConference(), api<AppSettings>("/settings").then(setSettings).catch(() => {})])
      .catch((err) => message.error(err instanceof Error ? err.message : "Conference could not be loaded"))
      .finally(() => setLoading(false));
  }, [id]);

  const scoreColor = useMemo(() => {
    const score = conference?.score ?? 0;
    if (score >= 80) return "#28a000";
    if (score >= 60) return "#ff9000";
    return "#ff4d4f";
  }, [conference?.score]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0" }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
      </div>
    );
  }

  if (!conference) {
    return (
      <Card>
        <Typography.Text type="secondary">Conference not found</Typography.Text>
      </Card>
    );
  }

  const location = [conference.city, conference.country].filter(Boolean).join(", ") || "Location not set";
  const dateRange =
    conference.start_date || conference.end_date
      ? `${dateLabel(conference.start_date)} - ${dateLabel(conference.end_date)}`
      : "Dates not set";
  const actualSurplus =
    conference.total_income_current != null && conference.total_expense_current != null
      ? conference.total_income_current - conference.total_expense_current
      : null;
  const actualSurplusPct =
    actualSurplus != null && conference.total_expense_current
      ? (actualSurplus / conference.total_expense_current) * 100
      : null;
  const budgetSurplus =
    conference.budgeted_income_total != null && conference.budgeted_expense_total != null
      ? conference.budgeted_income_total - conference.budgeted_expense_total
      : null;
  const budgetSurplusPct =
    budgetSurplus != null && conference.budgeted_expense_total
      ? (budgetSurplus / conference.budgeted_expense_total) * 100
      : null;
  const attendeeDeviation =
    conference.actual_attendees != null && conference.estimated_attendees
      ? ((conference.actual_attendees - conference.estimated_attendees) / conference.estimated_attendees) * 100
      : null;

  const openFactEditor = () => {
    factForm.setFieldsValue({
      official_title: conference.official_title,
      conference_number: recordLabel(conference.conference_number),
      conference_status: conference.conference_status,
      lifecycle_phase: conference.lifecycle_phase,
      start_date: conference.start_date ?? "",
      end_date: conference.end_date ?? "",
      city: conference.city ?? "",
      country: conference.country ?? "",
      website: conference.website ?? "",
      estimated_attendees: conference.estimated_attendees ?? undefined,
      actual_attendees: conference.actual_attendees ?? undefined,
      application_status: conference.application_status ?? "Unknown",
      mou_status: conference.mou_status ?? "Unknown",
      finance_status: conference.finance_status ?? "Unknown",
      publication_status: conference.publication_status ?? "Unknown",
      total_income_current: conference.total_income_current ?? undefined,
      total_expense_current: conference.total_expense_current ?? undefined,
      budgeted_income_total: conference.budgeted_income_total ?? undefined,
      budgeted_expense_total: conference.budgeted_expense_total ?? undefined,
      itss_loan_requested: Boolean(conference.itss_loan_requested),
      itss_loan_amount: conference.itss_loan_amount ?? undefined,
      comments: conference.comments ?? "",
      committee_contact: conference.committee_contact ?? "",
      change_comment: "",
    });
    setFactsOpen(true);
  };

  const saveFacts = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const values = await factForm.validateFields();
      const payload = {
        ...values,
        official_title: emptyToNull(values.official_title),
        conference_number: emptyToNull(values.conference_number),
        start_date: emptyToNull(values.start_date),
        end_date: emptyToNull(values.end_date),
        city: emptyToNull(values.city),
        country: emptyToNull(values.country),
        website: emptyToNull(values.website),
        comments: emptyToNull(values.comments),
        committee_contact: emptyToNull(values.committee_contact),
        change_comment: emptyToNull(values.change_comment),
      };
      const updated = await api<Conference>(`/conferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setConference(updated);
      setFactsOpen(false);
      message.success("Conference facts saved");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Conference facts were not saved");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshFacts = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      const updated = await api<Conference>(`/conferences/${id}/refresh`, { method: "POST" });
      setConference(updated);
      message.success("Conference facts refreshed from milestones");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to refresh facts");
    } finally {
      setRefreshing(false);
    }
  };

  const openMilestoneEditor = (milestone: Milestone) => {
    setActiveMilestone(milestone);
    milestoneForm.setFieldsValue({
      status: milestone.status,
      comments: milestone.comments ?? "",
    });
    setMilestoneOpen(true);
  };

  const saveMilestone = async () => {
    if (!id || !activeMilestone) return;
    setSaving(true);
    try {
      const values = await milestoneForm.validateFields();
      const updated = await api<Conference>(`/conferences/${id}/milestones/${activeMilestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: values.status, comments: emptyToNull(values.comments) }),
      });
      setConference(updated);
      setMilestoneOpen(false);
      setActiveMilestone(null);
      message.success("Milestone updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Milestone was not saved");
    } finally {
      setSaving(false);
    }
  };

  const openContactEditor = (contact?: Contact) => {
    setActiveContact(contact ?? null);
    contactForm.setFieldsValue({
      role: contact?.role ?? "Information Contact",
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      organization: contact?.organization ?? "",
      phone: contact?.phone ?? "",
      is_primary: Boolean(contact?.is_primary),
      active: contact?.active ?? true,
    });
    setContactOpen(true);
  };

  const saveContact = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const values = await contactForm.validateFields();
      const payload = {
        ...values,
        email: emptyToNull(values.email),
        organization: emptyToNull(values.organization),
        phone: emptyToNull(values.phone),
      };
      const updated = await api<Conference>(
        activeContact ? `/conferences/${id}/contacts/${activeContact.id}` : `/conferences/${id}/contacts`,
        {
          method: activeContact ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      setConference(updated);
      setContactOpen(false);
      setActiveContact(null);
      message.success(activeContact ? "Contact updated" : "Contact added");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Contact was not saved");
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (contact: Contact) => {
    if (!id) return;
    try {
      const updated = await api<Conference>(`/conferences/${id}/contacts/${contact.id}`, { method: "DELETE" });
      setConference(updated);
      message.success("Contact deleted");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Contact was not deleted");
    }
  };

  const addComment = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const values = await newCommentForm.validateFields();
      const updated = await api<Conference>(`/conferences/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: values.comment }),
      });
      setConference(updated);
      newCommentForm.resetFields();
      message.success("Comment saved");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Comment was not saved");
    } finally {
      setSaving(false);
    }
  };

  const openCommentEditor = (comment: Comment) => {
    setActiveComment(comment);
    commentForm.setFieldsValue({ comment: comment.comment ?? comment.text ?? "" });
    setCommentEditOpen(true);
  };

  const saveComment = async () => {
    if (!id || !activeComment) return;
    setSaving(true);
    try {
      const values = await commentForm.validateFields();
      const updated = await api<Conference>(`/conferences/${id}/comments/${activeComment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: values.comment }),
      });
      setConference(updated);
      setCommentEditOpen(false);
      setActiveComment(null);
      message.success("Comment updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Comment was not saved");
    } finally {
      setSaving(false);
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (!id) return;
    try {
      const updated = await api<Conference>(`/conferences/${id}/comments/${comment.id}`, { method: "DELETE" });
      setConference(updated);
      message.success("Comment deleted");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Comment was not deleted");
    }
  };

  const deleteConference = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const values = await deleteForm.validateFields();
      await api(`/conferences/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation_record_number: values.confirmation_record_number }),
      });
      message.success("Conference record deleted");
      navigate("/conferences");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Conference was not deleted");
    } finally {
      setSaving(false);
    }
  };

  const milestoneColumns = [
    {
      title: "Milestone",
      dataIndex: "name",
      key: "name",
      width: 240,
      render: (_: string, row: Milestone) => (
        <div className="milestone-title-cell">
          <strong>{row.name ?? row.display_name ?? row.code ?? "Milestone"}</strong>
          <span>{[row.code, row.dimension].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 112,
      render: (value: string) => statusTag(value),
    },
    {
      title: "Due Date",
      dataIndex: "due_date",
      key: "due_date",
      width: 116,
      render: dateLabel,
    },
    {
      title: "",
      key: "actions",
      width: 46,
      fixed: "right" as const,
      render: (_: unknown, row: Milestone) =>
        canEdit ? (
          <Button
            aria-label={`Edit ${row.name ?? row.code ?? "milestone"}`}
            icon={<EditOutlined />}
            onClick={() => openMilestoneEditor(row)}
            shape="circle"
            size="small"
          />
        ) : null,
    },
  ];

  const contactColumns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (value: string, row: Contact) => (
        <div className="contact-name-cell">
          <strong>{value || "-"}</strong>
          {row.is_primary && <Tag color="blue">Primary</Tag>}
        </div>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (value: string) => value ? <a href={`mailto:${value}`}>{value}</a> : "-",
    },
    { title: "Role", dataIndex: "role", key: "role", render: (value: string) => value || "-" },
    {
      title: "",
      key: "actions",
      width: 90,
      render: (_: unknown, row: Contact) =>
        canEdit ? (
          <Space size={4}>
            <Button icon={<EditOutlined />} onClick={() => openContactEditor(row)} shape="circle" size="small" />
            <Popconfirm title="Delete this contact?" onConfirm={() => deleteContact(row)}>
              <Button danger icon={<DeleteOutlined />} shape="circle" size="small" />
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const snapshotColumns = [
    { title: "Date", dataIndex: "snapshot_date", key: "snapshot_date", render: dateLabel },
    { title: "Income", dataIndex: "total_income", key: "total_income", render: moneyLabel },
    { title: "Expense", dataIndex: "total_expense", key: "total_expense", render: moneyLabel },
    {
      title: "Surplus/Deficit",
      dataIndex: "surplus_deficit",
      key: "surplus_deficit",
      render: (value: number) => (
        <span style={{ color: value >= 0 ? "#28a000" : "#ff4d4f" }}>{moneyLabel(value)}</span>
      ),
    },
    {
      title: "Surplus %",
      dataIndex: "surplus_percentage",
      key: "surplus_percentage",
      render: (value: number) => (
        <span style={{ color: value >= 0 ? "#28a000" : "#ff4d4f" }}>{percentLabel(value)}</span>
      ),
    },
  ];

  return (
    <div className="detail-page">
      <section className="detail-hero">
        <div>
          <Space wrap style={{ marginBottom: 8 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/conferences")}>
              Back
            </Button>
            {statusTag(conference.conference_status)}
            <Tag color={statusColor(conference.status_band)}>{conference.status_band}</Tag>
          </Space>
          <Typography.Text className="hero-kicker">Record {recordLabel(conference.conference_number)}</Typography.Text>
          <h2>{conference.canonical_name || `${conference.acronym} ${conference.year}`}</h2>
          <p>{conference.official_title}</p>
        </div>
        <div className="detail-hero-actions">
          <Progress
            className="detail-score-progress"
            type="circle"
            percent={Math.round(conference.score ?? 0)}
            strokeColor={scoreColor}
            size={96}
            strokeWidth={8}
            format={(value) => `${value ?? 0}`}
          />
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={handleRefreshFacts} loading={refreshing}>
              Refresh Facts
            </Button>
            {canEdit && (
              <Button type="primary" icon={<EditOutlined />} onClick={openFactEditor}>
                Edit Details
              </Button>
            )}
            {isAdmin && (
              <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
                Delete Record
              </Button>
            )}
          </Space>
        </div>
      </section>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Card
              title="Conference Facts"
              extra={
                canEdit ? (
                  <Button icon={<EditOutlined />} onClick={openFactEditor} shape="circle" />
                ) : null
              }
            >
              <div className="detail-fact-grid">
                {fact("Conference Status", statusTag(conference.conference_status))}
                {fact("Lifecycle Phase", statusTag(conference.lifecycle_phase))}
                {fact("Application", statusTag(conference.application_status))}
                {fact("MOU", statusTag(conference.mou_status))}
                {fact("Finance", statusTag(conference.finance_status))}
                {fact("Publication", statusTag(conference.publication_status))}
                {fact("Account Close", dateLabel(conference.accounting_close_date))}
                {fact("Dates", dateRange)}
                {fact("Location", location)}
                {fact("Sponsorship", conference.sponsorship_type || "-")}
                {fact("ITSS Loan Requested", conference.itss_loan_requested ? "Yes" : "No")}
                {fact("ITSS Loan Amount", moneyLabel(conference.itss_loan_amount))}
                {fact("Website", conference.website ? <a href={conference.website} target="_blank" rel="noreferrer"><GlobalOutlined /> Open website</a> : "-")}
                {fact("Last Source Update", dateLabel(conference.last_source_update))}
              </div>
            </Card>

            <Card title={<><FieldTimeOutlined /> Milestones</>}>
              <Table
                dataSource={conference.milestones}
                columns={milestoneColumns}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 560 }}
              />
            </Card>

            <Card
              title={<><TeamOutlined /> Contacts</>}
              extra={
                canEdit ? (
                  <Button icon={<PlusOutlined />} onClick={() => openContactEditor()}>
                    Add Contact
                  </Button>
                ) : null
              }
            >
              <Table
                className="contact-table"
                dataSource={conference.contacts}
                columns={contactColumns}
                rowKey="id"
                pagination={false}
                size="middle"
              />
            </Card>

            {snapshots.length > 0 && (
              <Card title={<><DollarOutlined /> Finance Snapshots</>}>
                <Table
                  dataSource={snapshots}
                  columns={snapshotColumns}
                  rowKey="id"
                  pagination={false}
                  size="middle"
                  scroll={{ x: 740 }}
                />
              </Card>
            )}
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <Card className="detail-side-card is-score">
              <Statistic
                title="Score"
                value={conference.score}
                precision={1}
                suffix="/100"
                prefix={<TrophyOutlined />}
                valueStyle={{ color: scoreColor, fontWeight: 800 }}
              />
              <div className="detail-mini-grid">
                <span>Base <strong>{conference.base_score.toFixed(1)}</strong></span>
                <span>Penalty <strong>{conference.issue_penalty.toFixed(1)}</strong></span>
                <span>Completeness <strong>{percentLabel(conference.data_completeness)}</strong></span>
                <span>Open Issues <strong>{conference.open_issue_count}</strong></span>
              </div>
            </Card>

            <Card title="Attendees (Estimated / Actual)" className="detail-side-card">
              <div className="attendee-value">
                {numberLabel(conference.estimated_attendees)} / {numberLabel(conference.actual_attendees)}
              </div>
              <Typography.Text type="secondary">
                {attendeeDeviation == null ? "Deviation not available" : `Deviation ${attendeeDeviation.toFixed(1)}%`}
              </Typography.Text>
            </Card>

            <Card title="Finance Summary" className="detail-side-card">
              <div className="finance-metric-grid">
                <span>Budget Income <strong>{moneyLabel(conference.budgeted_income_total)}</strong></span>
                <span>Budget Expense <strong>{moneyLabel(conference.budgeted_expense_total)}</strong></span>
                <span>
                  Budget Surplus
                  <strong style={{ color: (budgetSurplus ?? 0) >= 0 ? "#28a000" : "#ff4d4f" }}>
                    {moneyLabel(budgetSurplus)} ({percentLabel(budgetSurplusPct)})
                  </strong>
                </span>
                <span>Actual Income <strong>{moneyLabel(conference.total_income_current)}</strong></span>
                <span>Actual Expense <strong>{moneyLabel(conference.total_expense_current)}</strong></span>
                <span>
                  Actual Surplus
                  <strong style={{ color: (actualSurplus ?? 0) >= 0 ? "#28a000" : "#ff4d4f" }}>
                    {moneyLabel(actualSurplus)} ({percentLabel(actualSurplusPct)})
                  </strong>
                </span>
                <span>Finance Chair <strong>{conference.financial_analyst || "-"}</strong></span>
              </div>
            </Card>

            <Card className="saved-comment-card" title={<><CommentOutlined /> Saved Comments</>}>
              {canEdit && (
                <Form form={newCommentForm} layout="vertical">
                  <Form.Item name="comment" rules={[{ required: true, message: "Write a comment first." }]}>
                    <Input.TextArea rows={3} placeholder="Add a conference note..." />
                  </Form.Item>
                  <Button type="primary" onClick={addComment} loading={saving}>
                    Add Comment
                  </Button>
                </Form>
              )}
              {canEdit && <Divider />}
              <div className="comment-scroll">
                {(conference.comments_history ?? []).length === 0 ? (
                  <Typography.Text type="secondary">No saved comments yet.</Typography.Text>
                ) : (
                  (conference.comments_history ?? []).map((comment) => (
                    <div className="comment-entry" key={comment.id}>
                      <div className="comment-entry-head">
                        <span>{comment.author || "local-user"} · {dateTimeLabel(comment.updated_at ?? comment.created_at)}</span>
                        {canEdit && (
                          <Space size={4}>
                            <Button icon={<EditOutlined />} onClick={() => openCommentEditor(comment)} shape="circle" size="small" />
                            <Popconfirm title="Delete this comment?" onConfirm={() => deleteComment(comment)}>
                              <Button danger icon={<DeleteOutlined />} shape="circle" size="small" />
                            </Popconfirm>
                          </Space>
                        )}
                      </div>
                      <p>{comment.comment ?? comment.text}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal
        title="Edit Conference Details"
        open={factsOpen}
        onCancel={() => setFactsOpen(false)}
        onOk={saveFacts}
        okText="Save Details"
        confirmLoading={saving}
        width={860}
      >
        <Form form={factForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24}>
              <Form.Item name="official_title" label="Official Title">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="conference_number" label="Record Number">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="conference_status" label="Conference Status">
                <Select options={statusOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="lifecycle_phase" label="Lifecycle Phase">
                <Select options={phaseOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="start_date" label="Start Date">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="end_date" label="End Date">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="website" label="Website">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="country" label="Country">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="estimated_attendees" label="Estimated Attendees">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="actual_attendees" label="Actual Attendees">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="application_status" label="Application">
                <Select options={statusOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="mou_status" label="MOU">
                <Select options={statusOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="finance_status" label="Finance">
                <Select options={statusOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="publication_status" label="Publication">
                <Select options={statusOptions.map((value) => ({ label: value, value }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="budgeted_income_total" label="Budget Income">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="budgeted_expense_total" label="Budget Expense">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="total_income_current" label="Actual Income">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="total_expense_current" label="Actual Expense">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="itss_loan_requested" label="ITSS Loan Requested" valuePropName="checked">
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="itss_loan_amount" label="ITSS Loan Amount">
                <InputNumber min={0} precision={2} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="comments" label="Current Comment">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="change_comment" label="Change Note">
                <Input placeholder="Optional note for this update" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={activeMilestone ? `Edit ${activeMilestone.name ?? activeMilestone.code}` : "Edit Milestone"}
        open={milestoneOpen}
        onCancel={() => setMilestoneOpen(false)}
        onOk={saveMilestone}
        okText="Save Milestone"
        confirmLoading={saving}
      >
        <Form form={milestoneForm} layout="vertical">
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select className="milestone-status-select" options={statusOptions.map((value) => ({ label: value, value }))} />
          </Form.Item>
          <Form.Item name="comments" label="Milestone Notes">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Typography.Text type="secondary">
            Due date: {dateLabel(activeMilestone?.due_date)} · Last update: {dateTimeLabel(activeMilestone?.last_updated)}
          </Typography.Text>
        </Form>
      </Modal>

      <Modal
        title={activeContact ? "Edit Contact" : "Add Contact"}
        open={contactOpen}
        onCancel={() => setContactOpen(false)}
        onOk={saveContact}
        okText={activeContact ? "Save Contact" : "Add Contact"}
        confirmLoading={saving}
      >
        <Form form={contactForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={contactRoleOptions.map((value) => ({ label: value, value }))} />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="organization" label="Organization">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Space>
            <Form.Item name="is_primary" valuePropName="checked">
              <Switch checkedChildren="Primary" unCheckedChildren="Primary" />
            </Form.Item>
            {activeContact && (
              <Form.Item name="active" valuePropName="checked">
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
              </Form.Item>
            )}
          </Space>
        </Form>
      </Modal>

      <Modal
        title="Edit Comment"
        open={commentEditOpen}
        onCancel={() => setCommentEditOpen(false)}
        onOk={saveComment}
        okText="Save Comment"
        confirmLoading={saving}
      >
        <Form form={commentForm} layout="vertical">
          <Form.Item name="comment" label="Comment" rules={[{ required: true }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Delete Conference Record"
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onOk={deleteConference}
        okText="Delete Record"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
      >
        <Typography.Paragraph>
          This permanently deletes {conference.canonical_name}. Enter the conference record number to confirm.
        </Typography.Paragraph>
        <Form form={deleteForm} layout="vertical">
          <Form.Item
            name="confirmation_record_number"
            label={`Record Number: ${recordLabel(conference.conference_number)}`}
            rules={[
              { required: true, message: "Enter the record number to confirm deletion." },
              {
                validator: (_, value) =>
                  recordLabel(value) === recordLabel(conference.conference_number)
                    ? Promise.resolve()
                    : Promise.reject(new Error("Record number does not match.")),
              },
            ]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
