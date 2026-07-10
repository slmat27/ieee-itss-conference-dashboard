import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InfoCircleOutlined,
  RollbackOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useMemo, useState } from "react";

import { api, apiUrl } from "@/lib/api";

interface ImportChange {
  field: string;
  old: unknown;
  new: unknown;
}

interface ImportRow {
  row_number: number;
  matched_conference_id?: string | null;
  match_method: string;
  validation_result: "valid" | "error";
  errors: string[];
  changes: ImportChange[];
  source: Record<string, unknown>;
}

interface MilestonePreviewRow {
  conference_number: string;
  acronym: string;
  year: number;
  milestone_code: string;
  milestone_name: string;
  matched: boolean;
  errors: string[];
  changes: ImportChange[];
}

interface ImportPreview {
  file_name: string;
  summary: {
    rows: number;
    new: number;
    changed: number;
    unchanged: number;
    conflicts: number;
  };
  rows: ImportRow[];
  conflicts: { row_number: number; errors: string[] }[];
  milestone_rows: MilestonePreviewRow[];
}

interface ImportResult {
  batch_id: string;
  applied_rows: number;
  milestone_applied: number;
  skipped_rows: number;
  summary: ImportPreview["summary"];
}

type RowSelection = "__all__" | string[];
type SelectionMap = Record<string, RowSelection>;

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const selectableFields = (row: ImportRow): string[] => {
  if (row.validation_result === "valid" && !row.matched_conference_id) {
    return ["__all__"];
  }
  if (row.validation_result === "valid") {
    return row.changes.map((change) => change.field);
  }
  if (!row.matched_conference_id || !row.changes.length) return [];
  const blocked = new Set(
    row.errors
      .map((error) => error.split(":")[0]?.trim())
      .filter(Boolean),
  );
  return row.changes
    .map((change) => change.field)
    .filter((field) => !blocked.has(field));
};

export default function Imports() {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [validating, setValidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fieldGuide, setFieldGuide] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectionMap>({});
  const [milestonesApproved, setMilestonesApproved] = useState(false);

  const selectedCount = useMemo(
    () => Object.keys(selected).length + (milestonesApproved ? 1 : 0),
    [selected, milestonesApproved],
  );

  const loadFieldGuide = async () => {
    try {
      const response = await fetch(apiUrl("/imports/field-guide"));
      setFieldGuide(await response.text());
    } catch {
      setFieldGuide("Could not load the import field guide.");
    }
  };

  const handleValidate = async () => {
    const file = fileList[0];
    if (!file?.originFileObj) {
      message.warning("Select an Excel or CSV file first");
      return;
    }
    setValidating(true);
    setPreview(null);
    setResult(null);
    setBatchId(null);
    setSelected({});
    setMilestonesApproved(false);
    try {
      const formData = new FormData();
      formData.append("file", file.originFileObj);
      const data = await api<ImportPreview>("/imports/validate", {
        method: "POST",
        body: formData,
      });
      setPreview(data);
      await loadFieldGuide();
      message.success(`Validation complete: ${data.summary.rows} records processed`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const approveRecommended = () => {
    if (!preview) return;
    const next: SelectionMap = {};
    preview.rows.forEach((row) => {
      const fields = selectableFields(row);
      if (!fields.length) return;
      next[String(row.row_number)] = fields.includes("__all__") ? "__all__" : fields;
    });
    setSelected(next);
    setMilestonesApproved(
      preview.milestone_rows.some((row) => row.matched && !row.errors.length && row.changes.length > 0),
    );
  };

  const rejectAll = () => {
    setSelected({});
    setMilestonesApproved(false);
  };

  const toggleRow = (row: ImportRow, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      const fields = selectableFields(row);
      if (!checked || !fields.length) {
        delete next[String(row.row_number)];
      } else {
        next[String(row.row_number)] = fields.includes("__all__") ? "__all__" : fields;
      }
      return next;
    });
  };

  const toggleField = (row: ImportRow, field: string, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      const key = String(row.row_number);
      const existing = next[key];
      const values = existing === "__all__" ? selectableFields(row) : [...(existing ?? [])];
      const updated = checked
        ? Array.from(new Set([...values, field]))
        : values.filter((item) => item !== field);
      if (updated.length) next[key] = updated;
      else delete next[key];
      return next;
    });
  };

  const handleApply = async () => {
    const file = fileList[0];
    if (!file?.originFileObj || !preview) return;
    setApplying(true);
    try {
      const formData = new FormData();
      formData.append("file", file.originFileObj);
      const payload: Record<string, RowSelection> = { ...selected };
      if (milestonesApproved) payload.__milestones__ = "__all__";
      formData.append("selected_changes_json", JSON.stringify(payload));
      const data = await api<ImportResult>("/imports/apply", {
        method: "POST",
        body: formData,
      });
      setResult(data);
      setBatchId(data.batch_id);
      message.success(`${data.applied_rows + data.milestone_applied} approved records applied`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async () => {
    if (!batchId) return;
    try {
      await api(`/imports/${batchId}/rollback`, { method: "POST" });
      message.success("Import rolled back");
      setResult(null);
      setBatchId(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Rollback failed");
    }
  };

  const columns: ColumnsType<ImportRow> = [
    {
      title: "Approve",
      key: "approve",
      width: 90,
      render: (_, row) => {
        const fields = selectableFields(row);
        return (
          <Checkbox
            checked={selected[String(row.row_number)] !== undefined}
            disabled={!fields.length || !!result}
            onChange={(event) => toggleRow(row, event.target.checked)}
          />
        );
      },
    },
    { title: "Row", dataIndex: "row_number", width: 80 },
    {
      title: "Record",
      key: "record",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {formatValue(row.source.conference_number)} / {formatValue(row.source.acronym)} {formatValue(row.source.year)}
          </Typography.Text>
          <Typography.Text type="secondary">{row.match_method}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 150,
      render: (_, row) =>
        row.validation_result === "valid" ? (
          <Tag color={row.matched_conference_id ? "blue" : "green"}>
            {row.matched_conference_id ? "Changed" : "New"}
          </Tag>
        ) : (
          <Tag color="red">Needs Review</Tag>
        ),
    },
    {
      title: "Changes",
      key: "changes",
      width: 120,
      render: (_, row) => row.changes.length,
    },
    {
      title: "Errors / Conflicts",
      key: "errors",
      render: (_, row) =>
        row.errors.length ? (
          <Space direction="vertical" size={2}>
            {row.errors.map((error) => (
              <Typography.Text type="danger" key={error}>
                {error}
              </Typography.Text>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">None</Typography.Text>
        ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Excel workflow</Typography.Text>
          <h1>Import Center</h1>
          <Typography.Text type="secondary">
            Validate monthly Excel or CSV updates, approve only trusted changes, then apply them explicitly.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => window.open(apiUrl("/exports/portfolio.xlsx"), "_blank")}>
            Export Portfolio
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => window.open(apiUrl("/imports/template.xlsx"), "_blank")}>
            Excel Template
          </Button>
        </Space>
      </div>

      <div className="workflow-strip">
        <div><span>1</span><strong>Select file</strong><p>Use the monthly `.xlsx`, `.xlsm`, or `.csv` file.</p></div>
        <div><span>2</span><strong>Start Validation</strong><p>Preview new records, changed fields, conflicts, and missing values.</p></div>
        <div><span>3</span><strong>Apply approved</strong><p>Only checked rows or fields are written to the database.</p></div>
      </div>

      <Row gutter={[16, 16]} className="section-gap">
        <Col xs={24} lg={10}>
          <Card title={<><FileExcelOutlined /> Upload and Validate</>}>
            <Space direction="vertical" style={{ width: "100%" }} size={14}>
              <Upload.Dragger
                accept=".xlsx,.xlsm,.csv"
                fileList={fileList}
                beforeUpload={() => false}
                maxCount={1}
                onChange={({ fileList: next }) => setFileList(next.slice(-1))}
              >
                <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                <p className="ant-upload-text">Select or drop the monthly status file</p>
                <p className="ant-upload-hint">Validation does not update existing data.</p>
              </Upload.Dragger>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={validating}
                disabled={!fileList.length}
                onClick={handleValidate}
              >
                Start Validation
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={<><InfoCircleOutlined /> Processing Progress</>}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Progress
                percent={preview ? 100 : validating ? 45 : 0}
                status={preview?.summary.conflicts ? "exception" : preview ? "success" : "active"}
              />
              {preview ? (
                <Space wrap>
                  <Tag color="blue">{preview.summary.rows} records processed</Tag>
                  <Tag color="green">{preview.summary.new} new</Tag>
                  <Tag color="gold">{preview.summary.changed} changed</Tag>
                  <Tag>{preview.summary.unchanged} unchanged</Tag>
                  {preview.summary.conflicts > 0 && <Tag color="red">{preview.summary.conflicts} conflicts</Tag>}
                </Space>
              ) : (
                <Typography.Text type="secondary">No validation has been run yet.</Typography.Text>
              )}
              <Space wrap>
                <Button disabled={!preview || !!result} onClick={approveRecommended}>
                  Approve Valid Changes
                </Button>
                <Button disabled={!preview || !!result} onClick={rejectAll}>
                  Reject All
                </Button>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  disabled={!preview || !selectedCount || !!result}
                  loading={applying}
                  onClick={handleApply}
                >
                  Apply Approved Changes
                </Button>
                <Button danger icon={<RollbackOutlined />} disabled={!batchId} onClick={handleRollback}>
                  Rollback Last Import
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>

      {preview && (
        <Card title="Validation Preview" className="section-gap">
          {preview.conflicts.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Some rows need review"
              description="Rows with blocking identity errors stay disabled. Valid changed fields on matched records can still be approved individually."
            />
          )}
          <Table
            dataSource={preview.rows}
            columns={columns}
            rowKey="row_number"
            size="middle"
            pagination={{ pageSize: 8, showTotal: (total) => `${total} rows` }}
            expandable={{
              expandedRowRender: (row) => (
                <Space direction="vertical" style={{ width: "100%" }}>
                  {row.changes.length ? (
                    row.changes.map((change) => {
                      const chosen = selected[String(row.row_number)];
                      const checked = chosen === "__all__" || (Array.isArray(chosen) && chosen.includes(change.field));
                      const disabled = !selectableFields(row).includes(change.field) || !!result;
                      return (
                        <div className="import-change-row" key={change.field}>
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onChange={(event) => toggleField(row, change.field, event.target.checked)}
                          />
                          <strong>{change.field}</strong>
                          <span>{formatValue(change.old)} &rarr; {formatValue(change.new)}</span>
                        </div>
                      );
                    })
                  ) : (
                    <Typography.Text type="secondary">No field changes detected for this row.</Typography.Text>
                  )}
                </Space>
              ),
            }}
          />

          {preview.milestone_rows.length > 0 && (
            <Card size="small" title="Milestone Sheet" style={{ marginTop: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Checkbox
                  checked={milestonesApproved}
                  disabled={
                    !!result ||
                    !preview.milestone_rows.some((row) => row.matched && !row.errors.length && row.changes.length)
                  }
                  onChange={(event) => setMilestonesApproved(event.target.checked)}
                >
                  Approve valid milestone changes
                </Checkbox>
                <Table
                  dataSource={preview.milestone_rows}
                  rowKey={(row) => `${row.conference_number}-${row.acronym}-${row.year}-${row.milestone_code}`}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: "Conference", render: (_, row) => `${row.conference_number || row.acronym} ${row.year}` },
                    { title: "Milestone", dataIndex: "milestone_name" },
                    { title: "Code", dataIndex: "milestone_code" },
                    { title: "Changes", render: (_, row) => row.changes.length },
                    {
                      title: "Status",
                      render: (_, row) =>
                        row.errors.length ? <Tag color="red">Blocked</Tag> : <Tag color="green">Valid</Tag>,
                    },
                  ]}
                />
              </Space>
            </Card>
          )}
        </Card>
      )}

      {result && (
        <Card title="Import Result" className="section-gap">
          <Space wrap>
            <Tag color="green" icon={<CheckCircleOutlined />}>{result.applied_rows} conference rows applied</Tag>
            <Tag color="blue">{result.milestone_applied} milestone rows applied</Tag>
            <Tag color={result.skipped_rows ? "gold" : "default"}>{result.skipped_rows} skipped</Tag>
            <Tag>{result.summary.rows} records processed</Tag>
          </Space>
        </Card>
      )}

      {fieldGuide && (
        <Card title="Import Field Guide" className="section-gap">
          <pre className="diagnostic-text">{fieldGuide}</pre>
        </Card>
      )}

      {!preview && (
        <Card className="section-gap">
          <Space>
            <CloseCircleOutlined style={{ color: "#faad14" }} />
            <Typography.Text type="secondary">
              Existing data will not be changed until validation completes and approved rows are applied.
            </Typography.Text>
          </Space>
        </Card>
      )}
    </div>
  );
}
