import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";
import type { Conference } from "@/types/conference";

interface ItemResponse<T> {
  items: T[];
}

const STATUS_COLORS: Record<string, string> = {
  complete: "green",
  completed: "green",
  approved: "green",
  submitted: "green",
  active: "green",
  "in progress": "blue",
  planning: "blue",
  pending: "gold",
  "not started": "default",
  not_started: "default",
  unknown: "default",
  overdue: "red",
  blocked: "red",
  rejected: "red",
  risk: "red",
  critical: "red",
  proposed: "purple",
};

function statusColor(value?: string | null) {
  return STATUS_COLORS[String(value ?? "").trim().toLowerCase()] ?? "default";
}

function textValue(value?: string | number | null) {
  return String(value ?? "").toLowerCase();
}

function dateSortValue(value?: string | null) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatRecordNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return String(Math.trunc(parsed));
  return String(value).replace(/\.0+$/, "");
}

function locationLabel(record: Conference) {
  return [record.city, record.country].filter(Boolean).join(", ") || "-";
}

export default function Conferences() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);

  const fetchConferences = (query = search) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());

    api<ItemResponse<Conference>>(`/conferences${params.toString() ? `?${params.toString()}` : ""}`)
      .then((data) => setConferences(data.items ?? []))
      .catch((err) => message.error(err instanceof Error ? err.message : "Failed to load conferences"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const nextSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";
    setSearch(nextSearch);
    fetchConferences(nextSearch);
  }, [searchParams.toString()]);

  const handleSearch = () => {
    const next = search.trim();
    setSearchParams(next ? { search: next } : {});
  };

  const columns: ColumnsType<Conference> = useMemo(
    () => [
      {
        title: "Conference",
        dataIndex: "acronym",
        sorter: (a, b) => textValue(a.acronym).localeCompare(textValue(b.acronym)),
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/conferences/${record.id}`)}>
            {value || record.canonical_name || "Conference"} {record.year}
          </Button>
        ),
      },
      {
        title: "Record #",
        dataIndex: "conference_number",
        width: 120,
        sorter: (a, b) => textValue(a.conference_number).localeCompare(textValue(b.conference_number)),
        render: formatRecordNumber,
      },
      {
        title: "Start",
        dataIndex: "start_date",
        width: 120,
        sorter: (a, b) => dateSortValue(a.start_date) - dateSortValue(b.start_date),
        render: formatDate,
      },
      {
        title: "End",
        dataIndex: "end_date",
        width: 120,
        sorter: (a, b) => dateSortValue(a.end_date) - dateSortValue(b.end_date),
        render: formatDate,
      },
      {
        title: "Location",
        key: "location",
        sorter: (a, b) => locationLabel(a).localeCompare(locationLabel(b)),
        render: (_, record) => locationLabel(record),
      },
      {
        title: "Phase",
        dataIndex: "lifecycle_phase",
        width: 150,
        sorter: (a, b) => textValue(a.lifecycle_phase).localeCompare(textValue(b.lifecycle_phase)),
        render: (value: string) => <Tag>{value || "-"}</Tag>,
      },
      {
        title: "MOU",
        dataIndex: "mou_status",
        width: 135,
        sorter: (a, b) => textValue(a.mou_status).localeCompare(textValue(b.mou_status)),
        render: (value: string) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Finance",
        dataIndex: "finance_status",
        width: 135,
        sorter: (a, b) => textValue(a.finance_status).localeCompare(textValue(b.finance_status)),
        render: (value: string) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Publication",
        dataIndex: "publication_status",
        width: 145,
        sorter: (a, b) => textValue(a.publication_status).localeCompare(textValue(b.publication_status)),
        render: (value: string) => <Tag color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Issues",
        dataIndex: "open_issue_count",
        width: 95,
        sorter: (a, b) => (a.open_issue_count ?? 0) - (b.open_issue_count ?? 0),
        render: (value: number) =>
          value > 0 ? <Tag color="red">{value}</Tag> : <Tag color="green">0</Tag>,
      },
      {
        title: "Score",
        dataIndex: "score",
        width: 86,
        align: "center",
        sorter: (a, b) => (a.score ?? 0) - (b.score ?? 0),
        render: (value: number) => (
          <Progress
            type="circle"
            percent={Math.round(value ?? 0)}
            size={46}
            strokeWidth={7}
            format={(percent) => `${percent ?? 0}`}
            strokeColor={(value ?? 0) >= 80 ? "#28a000" : (value ?? 0) >= 60 ? "#ff9000" : "#ff4d4f"}
          />
        ),
      },
    ],
    [navigate],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Conference records</Typography.Text>
          <h1>Conferences</h1>
          <Typography.Text type="secondary">
            Sort and open every conference record from the local portfolio database.
          </Typography.Text>
        </div>
        <Space wrap>
          <Input
            placeholder="Search conferences..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 280 }}
            allowClear
            onClear={() => {
              setSearch("");
              setSearchParams({});
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchConferences()}>
            Refresh
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <Table
              dataSource={conferences}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                showTotal: (total) => `${total} conferences`,
              }}
              size="middle"
              scroll={{ x: 1180 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
