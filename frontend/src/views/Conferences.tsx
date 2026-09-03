import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Input,
  Progress,
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
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "@/lib/api";
import { lifecyclePhaseColor } from "@/lib/conference-visuals";
import type { Conference } from "@/types/conference";

interface ItemResponse<T> {
  items: T[];
}

interface ReferenceDataResponse {
  lifecycle_phases?: string[];
  conference_statuses?: string[];
}

const STATUS_COLORS: Record<string, string> = {
  "on track": "green",
  "attention needed": "gold",
  "at risk": "orange",
  closed: "default",
  cancelled: "default",
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
  const searchParamsKey = searchParams.toString();
  const initialSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const statusFilters = useMemo(() => {
    const params = new URLSearchParams(searchParamsKey);
    return params
      .getAll("status")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
  }, [searchParamsKey]);
  const phaseFilters = useMemo(() => {
    const params = new URLSearchParams(searchParamsKey);
    return params
      .getAll("phase")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
  }, [searchParamsKey]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [lifecyclePhases, setLifecyclePhases] = useState<string[]>([]);
  const [conferenceStatuses, setConferenceStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);

  const fetchConferences = useCallback((query: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    phaseFilters.forEach((phase) => params.append("phase", phase));
    statusFilters.forEach((status) => params.append("status", status));

    api<ItemResponse<Conference>>(`/conferences${params.toString() ? `?${params.toString()}` : ""}`)
      .then((data) => setConferences(data.items ?? []))
      .catch((err) => message.error(err instanceof Error ? err.message : "Failed to load conferences"))
      .finally(() => setLoading(false));
  }, [phaseFilters, statusFilters]);

  useEffect(() => {
    api<ReferenceDataResponse>("/reference-data")
      .then((data) => {
        setLifecyclePhases(data.lifecycle_phases ?? []);
        setConferenceStatuses(data.conference_statuses ?? []);
      })
      .catch((err) =>
        message.warning(err instanceof Error ? err.message : "Lifecycle phases could not be loaded"),
      );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    const nextSearch = params.get("search") ?? params.get("q") ?? "";
    setSearch(nextSearch);
    fetchConferences(nextSearch);
  }, [fetchConferences, searchParamsKey]);

  const handleSearch = () => {
    const next = search.trim();
    const params = new URLSearchParams(searchParams);
    if (next) params.set("search", next);
    else {
      params.delete("search");
      params.delete("q");
    }
    setSearchParams(params);
  };

  const filteredConferences = useMemo(
    () =>
      conferences.filter(
        (conference) =>
          (!statusFilters.length ||
            statusFilters.some(
              (status) => textValue(conference.conference_status) === textValue(status),
            )) &&
          (!phaseFilters.length ||
            phaseFilters.some(
              (phase) => textValue(conference.lifecycle_phase) === textValue(phase),
            )),
      ),
    [conferences, phaseFilters, statusFilters],
  );

  const phaseOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...lifecyclePhases,
          ...phaseFilters,
          ...conferences.map((conference) => conference.lifecycle_phase).filter(Boolean),
        ]),
      ).map((value) => ({ label: value, value })),
    [conferences, lifecyclePhases, phaseFilters],
  );

  const updatePhaseFilters = (values: string[]) => {
    const params = new URLSearchParams(searchParams);
    params.delete("phase");
    values.forEach((value) => params.append("phase", value));
    setSearchParams(params);
  };

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...conferenceStatuses,
          ...statusFilters,
          ...conferences.map((conference) => conference.conference_status).filter(Boolean),
        ]),
      ).map((value) => ({ label: value, value })),
    [conferenceStatuses, conferences, statusFilters],
  );

  const updateStatusFilters = (values: string[]) => {
    const params = new URLSearchParams(searchParams);
    params.delete("status");
    values.forEach((value) => params.append("status", value));
    setSearchParams(params);
  };

  const columns: ColumnsType<Conference> = useMemo(
    () => [
      {
        title: "Conference",
        dataIndex: "acronym",
        width: "12.5%",
        sorter: (a, b) => textValue(a.acronym).localeCompare(textValue(b.acronym)),
        render: (value: string, record) => (
          <Button type="link" className="table-link" onClick={() => void navigate(`/conferences/${record.id}`)}>
            {value || record.canonical_name || "Conference"} {record.year}
          </Button>
        ),
      },
      {
        title: "Record #",
        dataIndex: "conference_number",
        width: "9%",
        sorter: (a, b) => textValue(a.conference_number).localeCompare(textValue(b.conference_number)),
        render: formatRecordNumber,
      },
      {
        title: "Start",
        dataIndex: "start_date",
        width: "9%",
        sorter: (a, b) => dateSortValue(a.start_date) - dateSortValue(b.start_date),
        render: formatDate,
      },
      {
        title: "End",
        dataIndex: "end_date",
        width: "9%",
        sorter: (a, b) => dateSortValue(a.end_date) - dateSortValue(b.end_date),
        render: formatDate,
      },
      {
        title: "Location",
        key: "location",
        width: "14.5%",
        sorter: (a, b) => locationLabel(a).localeCompare(locationLabel(b)),
        render: (_, record) => locationLabel(record),
      },
      {
        title: "Phase",
        dataIndex: "lifecycle_phase",
        width: "17.5%",
        sorter: (a, b) => textValue(a.lifecycle_phase).localeCompare(textValue(b.lifecycle_phase)),
        render: (value: string) => (
          <Tag className="status-tag-wrap" color={lifecyclePhaseColor(value)}>
            {value || "-"}
          </Tag>
        ),
      },
      {
        title: "Conference Status",
        dataIndex: "conference_status",
        width: "14%",
        sorter: (a, b) => textValue(a.conference_status).localeCompare(textValue(b.conference_status)),
        render: (value: string) => <Tag className="status-tag-wrap" color={statusColor(value)}>{value || "-"}</Tag>,
      },
      {
        title: "Issues",
        dataIndex: "open_issue_count",
        width: "7.5%",
        sorter: (a, b) => (a.open_issue_count ?? 0) - (b.open_issue_count ?? 0),
        render: (value: number) =>
          value > 0 ? <Tag color="red">{value}</Tag> : <Tag color="green">0</Tag>,
      },
      {
        title: "Score",
        dataIndex: "score",
        width: "7%",
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
              const params = new URLSearchParams(searchParams);
              params.delete("search");
              params.delete("q");
              setSearchParams(params);
            }}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            placeholder="Filter lifecycle phases"
            value={phaseFilters}
            options={phaseOptions}
            onChange={updatePhaseFilters}
            style={{ minWidth: 280, maxWidth: 420 }}
          />
          <Select
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            placeholder="Filter conference statuses"
            value={statusFilters}
            options={statusOptions}
            onChange={updateStatusFilters}
            style={{ minWidth: 250, maxWidth: 380 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchConferences(search)}>
            Refresh
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            {(statusFilters.length > 0 || phaseFilters.length > 0) && (
              <div className="conference-filter-bar">
                {statusFilters.length > 0 && (
                  <>
                    <Typography.Text type="secondary">Conference Statuses</Typography.Text>
                    {statusFilters.map((status) => (
                      <Tag
                        key={status}
                        color={statusColor(status)}
                        closable
                        onClose={(event) => {
                          event.preventDefault();
                          updateStatusFilters(statusFilters.filter((value) => value !== status));
                        }}
                      >
                        {status}
                      </Tag>
                    ))}
                  </>
                )}
                {phaseFilters.length > 0 && (
                  <>
                    <Typography.Text type="secondary">Conference Lifecycles</Typography.Text>
                    {phaseFilters.map((phase) => (
                      <Tag
                        key={phase}
                        color="blue"
                        closable
                        onClose={(event) => {
                          event.preventDefault();
                          updatePhaseFilters(phaseFilters.filter((value) => value !== phase));
                        }}
                      >
                        {phase}
                      </Tag>
                    ))}
                  </>
                )}
              </div>
            )}
            <Table
              className="conference-records-table"
              dataSource={filteredConferences}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                showTotal: (total) => {
                  const filters = [
                    statusFilters.length ? `statuses ${statusFilters.join(", ")}` : "",
                    phaseFilters.length ? `lifecycles ${phaseFilters.join(", ")}` : "",
                  ].filter(Boolean);
                  return `${total} conference${total === 1 ? "" : "s"}${filters.length ? ` with ${filters.join(" and ")}` : ""}`;
                },
              }}
              size="middle"
              tableLayout="fixed"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
