import {
  ArrowLeftOutlined,
  CloseCircleOutlined,
  CommentOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  LoadingOutlined,
  ReloadOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "@/lib/api";
import type { Conference, FinanceSnapshot } from "@/types/conference";

const STATUS_COLORS: Record<string, string> = {
  completed: "green",
  "in progress": "blue",
  pending: "gold",
  overdue: "red",
  cancelled: "default",
  not_started: "default",
};

export default function ConferenceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [conference, setConference] = useState<Conference | null>(null);
  const [snapshots, setSnapshots] = useState<FinanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<Conference>(`/conferences/${id}`)
      .then((data) => {
        setConference(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    api<FinanceSnapshot[]>(`/conferences/${id}/snapshots`)
      .then(setSnapshots)
      .catch(() => {});
  }, [id]);

  const handleRefreshFacts = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await api(`/conferences/${id}/refresh-facts`, { method: "POST" });
      message.success("Facts refreshed from milestones");
      const updated = await api<Conference>(`/conferences/${id}`);
      setConference(updated);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to refresh facts");
    } finally {
      setRefreshing(false);
    }
  };

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

  const surplus =
    conference.total_income_current != null && conference.total_expense_current != null
      ? conference.total_income_current - conference.total_expense_current
      : null;
  const surplusPct =
    surplus != null && conference.total_income_current
      ? ((surplus / conference.total_income_current) * 100).toFixed(1)
      : null;

  const milestoneColumns = [
    { title: "Milestone", dataIndex: "display_name", key: "display_name" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val?.toLowerCase()] || "default"}>{val || "-"}</Tag>
      ),
    },
    { title: "Planned", dataIndex: "planned_date", key: "planned_date", render: (v: string) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "Actual", dataIndex: "actual_date", key: "actual_date", render: (v: string) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "Calculated", dataIndex: "calculated_date", key: "calculated_date", render: (v: string) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "Responsible", dataIndex: "responsible_party", key: "responsible_party", render: (v: string) => v || "-" },
  ];

  const contactColumns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email", render: (v: string) => v || "-" },
    { title: "Role", dataIndex: "role", key: "role", render: (v: string) => v || "-" },
    { title: "Organization", dataIndex: "organization", key: "organization", render: (v: string) => v || "-" },
    { title: "Primary", dataIndex: "is_primary", key: "is_primary", render: (v: boolean) => v ? <Tag color="blue">Yes</Tag> : "-" },
  ];

  const snapshotColumns = [
    { title: "Date", dataIndex: "snapshot_date", key: "snapshot_date", render: (v: string) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "Income", dataIndex: "total_income", key: "total_income", render: (v: number) => v != null ? `$${v.toLocaleString()}` : "-" },
    { title: "Expense", dataIndex: "total_expense", key: "total_expense", render: (v: number) => v != null ? `$${v.toLocaleString()}` : "-" },
    { title: "Surplus/Deficit", dataIndex: "surplus_deficit", key: "surplus_deficit", render: (v: number) =>
      v != null ? <span style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f" }}>${v.toLocaleString()}</span> : "-",
    },
    { title: "Surplus %", dataIndex: "surplus_percentage", key: "surplus_percentage", render: (v: number) =>
      v != null ? <span style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f" }}>{v.toFixed(1)}%</span> : "-",
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/conferences")}>
              Back
            </Button>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {conference.acronym} {conference.year}
            </Typography.Title>
            <Tag color="blue">{conference.conference_status}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshFacts}
              loading={refreshing}
            >
              Refresh Facts
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Conference Details" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label="Official Title" span={2}>
                {conference.official_title}
              </Descriptions.Item>
              <Descriptions.Item label="Canonical Name">
                {conference.canonical_name}
              </Descriptions.Item>
              <Descriptions.Item label="Series">
                {conference.conference_series}
              </Descriptions.Item>
              <Descriptions.Item label="Category">
                {conference.conference_category || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Sponsorship">
                {conference.sponsorship_type}
              </Descriptions.Item>
              <Descriptions.Item label="Lifecycle Phase">
                <Tag>{conference.lifecycle_phase}</Tag>
                {conference.phase_differs && (
                  <Tag color="orange">Suggested: {conference.suggested_phase}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="City">
                {conference.city || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Country">
                {conference.country || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Start Date">
                {conference.start_date ? new Date(conference.start_date).toLocaleDateString() : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="End Date">
                {conference.end_date ? new Date(conference.end_date).toLocaleDateString() : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Estimated Attendees">
                {conference.estimated_attendees?.toLocaleString() || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Actual Attendees">
                {conference.actual_attendees?.toLocaleString() || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Website">
                {conference.website ? (
                  <a href={conference.website} target="_blank" rel="noopener noreferrer">
                    {conference.website}
                  </a>
                ) : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Conference Number">
                {conference.conference_number || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Comments">
                {conference.comments || "-"}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title={<><FieldTimeOutlined /> Milestones</>} style={{ marginBottom: 16 }}>
            <Table
              dataSource={conference.milestones}
              columns={milestoneColumns}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 700 }}
            />
          </Card>

          <Card title={<><TeamOutlined /> Contacts</>} style={{ marginBottom: 16 }}>
            <Table
              dataSource={conference.contacts}
              columns={contactColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>

          {snapshots.length > 0 && (
            <Card title={<><DollarOutlined /> Finance Snapshots</>} style={{ marginBottom: 16 }}>
              <Table
                dataSource={snapshots}
                columns={snapshotColumns}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 600 }}
              />
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Card>
                <Statistic
                  title="Score"
                  value={conference.score}
                  precision={1}
                  suffix="/100"
                  valueStyle={{
                    color: conference.score >= 80 ? "#52c41a" : conference.score >= 60 ? "#faad14" : "#ff4d4f",
                    fontSize: 28,
                  }}
                />
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small">
                <Row gutter={8}>
                  <Col span={12}>
                    <Statistic
                      title="Base Score"
                      value={conference.base_score}
                      precision={1}
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Issue Penalty"
                      value={conference.issue_penalty}
                      precision={1}
                      valueStyle={{ fontSize: 18, color: conference.issue_penalty > 0 ? "#ff4d4f" : undefined }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small">
                <Statistic
                  title="Data Completeness"
                  value={conference.data_completeness}
                  precision={1}
                  suffix="%"
                  valueStyle={{ fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small">
                <Statistic
                  title="Open Issues"
                  value={conference.open_issue_count}
                  prefix={<CloseCircleOutlined />}
                  valueStyle={{
                    fontSize: 18,
                    color: conference.open_issue_count > 0 ? "#ff4d4f" : "#52c41a",
                  }}
                />
              </Card>
            </Col>
            <Col span={24}>
              <Card size="small">
                <Typography.Text strong>Financial Summary</Typography.Text>
                <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
                  <Descriptions.Item label="Income">
                    {conference.total_income_current != null
                      ? `$${conference.total_income_current.toLocaleString()}`
                      : "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Expense">
                    {conference.total_expense_current != null
                      ? `$${conference.total_expense_current.toLocaleString()}`
                      : "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Surplus/Deficit">
                    {surplus != null ? (
                      <span style={{ color: surplus >= 0 ? "#52c41a" : "#ff4d4f" }}>
                        ${surplus.toLocaleString()}
                      </span>
                    ) : "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Surplus %">
                    {surplusPct != null ? (
                      <span style={{ color: Number(surplusPct) >= 0 ? "#52c41a" : "#ff4d4f" }}>
                        {surplusPct}%
                      </span>
                    ) : "-"}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>

      {conference.comments_history && conference.comments_history.length > 0 && (
        <Card title={<><CommentOutlined /> Comments / Issues</>} style={{ marginTop: 16 }}>
          <Timeline
            items={conference.comments_history.map((c: any) => ({
              children: (
                <div>
                  <Typography.Text strong>{c.author || "System"}</Typography.Text>
                  <Typography.Paragraph style={{ margin: "4px 0 0" }}>
                    {c.text || c.description}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(c.created_at).toLocaleString()}
                  </Typography.Text>
                  {c.severity && <Tag color={c.severity === "high" ? "red" : c.severity === "medium" ? "gold" : "blue"} style={{ marginLeft: 8 }}>{c.severity}</Tag>}
                  {c.status && <Tag style={{ marginLeft: 4 }}>{c.status}</Tag>}
                </div>
              ),
            }))}
          />
        </Card>
      )}
    </div>
  );
}

function Space({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", ...style }}>{children}</div>;
}
