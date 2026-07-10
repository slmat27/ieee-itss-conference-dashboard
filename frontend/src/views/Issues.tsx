import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Row, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "@/lib/api";
import type { Issue } from "@/types/conference";

interface ItemResponse<T> {
  items: T[];
}

export default function Issues() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");

  const fetchIssues = () => {
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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchIssues();
  }, [statusFilter, severityFilter]);

  const handleResolve = async (id: string) => {
    try {
      await api(`/issues/${id}/resolve`, { method: "POST" });
      message.success("Issue resolved");
      fetchIssues();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to resolve issue");
    }
  };

  const columns: ColumnsType<Issue> = [
    {
      title: "Issue",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      render: (val: string, record: Issue) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{val || record.issue_key || "Issue"}</Typography.Text>
          <Typography.Text type="secondary">{record.description || "-"}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Conference",
      key: "conference",
      width: 160,
      render: (_: any, record: Issue) => (
        <Button
          type="link"
          onClick={() => navigate(`/conferences/${record.conference_id}`)}
        >
          {record.conference_name || record.conference_acronym || "-"} {record.conference_year || ""}
        </Button>
      ),
    },
    {
      title: "Severity",
      dataIndex: "severity",
      key: "severity",
      width: 100,
      render: (val: string) => {
        const color =
          val === "high" ? "red" : val === "medium" ? "gold" : val === "low" ? "blue" : "default";
        return <Tag color={color}>{val || "-"}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "issue_status",
      key: "issue_status",
      width: 120,
      render: (val: string) => (
        <Tag
          color={String(val).toLowerCase() === "open" ? "red" : String(val).toLowerCase().includes("progress") ? "gold" : "green"}
          icon={
            String(val).toLowerCase() === "open" ? (
              <ExclamationCircleOutlined />
            ) : String(val).toLowerCase() === "resolved" ? (
              <CheckCircleOutlined />
            ) : undefined
          }
        >
          {val || "-"}
        </Tag>
      ),
    },
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 140,
      render: (val: string) => val || "-",
    },
    {
      title: "Created",
      dataIndex: "date_detected",
      key: "date_detected",
      width: 170,
      render: (val: string) => (val ? new Date(val).toLocaleDateString() : "-"),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: any, record: Issue) =>
        String(record.issue_status ?? record.status).toLowerCase() !== "resolved" ? (
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => handleResolve(record.id)}
          >
            Resolve
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Issues
          </Typography.Title>
        </Col>
        <Col>
          <Space>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: 150 }}
              value={statusFilter || undefined}
              onChange={(val) => setStatusFilter(val || "")}
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
              style={{ width: 150 }}
              value={severityFilter || undefined}
              onChange={(val) => setSeverityFilter(val || "")}
              options={[
                { label: "Critical", value: "Critical" },
                { label: "High", value: "High" },
                { label: "Medium", value: "Medium" },
                { label: "Low", value: "Low" },
                { label: "Informational", value: "Informational" },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchIssues}>
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      <Card>
        <Table
          dataSource={issues}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ showSizeChanger: true, showTotal: (t) => `${t} issues` }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
