import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
  SlidersOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { AppSettings, ConferenceSeriesConfig, ReferenceConfig } from "@/types/conference";

const featureLabels: Record<string, string> = {
  overview: "Overview",
  conferences: "Conferences",
  issues: "Issues",
  imports: "Import Center",
  knowledge_base: "Knowledge Base",
  templates: "Templates",
  assistant: "Assistant",
  email_drafts: "Email Drafts",
  system_status: "System Status",
  settings: "Settings",
};

const scoreLabels: Record<string, string> = {
  dimension_weights: "Lifecycle Dimension Weights",
  milestone_status_scores: "Milestone Status Scores",
  issue_severity_penalties: "Issue Severity Penalties",
  issue_assessment_factors: "Issue Review Factors",
  issue_penalty_cap: "Issue Penalty Cap",
  lateness_step_days: "Lateness Step Days",
  lateness_cap_factor: "Lateness Cap Factor",
};

const scoreDescriptions: Record<string, string> = {
  dimension_weights: "Controls how much each milestone dimension contributes to the base score before issue penalties.",
  milestone_status_scores: "Controls the score assigned to each milestone timing/status situation before dimension weighting.",
  issue_severity_penalties: "Penalty points subtracted for each active issue by severity.",
  issue_assessment_factors: "Multiplier applied to issue penalties based on review assessment.",
  issue_penalty_cap: "Maximum total issue penalty that can be subtracted from a conference score.",
  lateness_step_days: "Number of overdue days that equals one lateness step. Smaller values make overdue milestones become more influential faster.",
  lateness_cap_factor: "Maximum multiplier added to an overdue milestone weight. Higher values make very late milestones dominate the base score more strongly.",
};

const milestoneScoreLabels: Record<string, string> = {
  completed: "Completed / Approved / Closed",
  unknown: "Unknown",
  no_due_date: "No Due Date",
  not_started_far: "Not Started, More Than 90 Days Away",
  not_started_upcoming: "Not Started, 31-90 Days Away",
  not_started_due_soon: "Not Started, Due Within 30 Days",
  not_started_overdue: "Not Started, Overdue",
  in_progress_on_time: "In Progress, On Time",
  in_progress_recently_overdue: "In Progress, 1-30 Days Overdue",
  in_progress_overdue: "In Progress, More Than 30 Days Overdue",
  awaiting_on_time: "Submitted / Awaiting, On Time",
  awaiting_recently_overdue: "Submitted / Awaiting, 1-30 Days Overdue",
  awaiting_overdue: "Submitted / Awaiting, More Than 30 Days Overdue",
  blocked: "Blocked / Rejected",
};

const milestoneOffsetLabels: Record<string, string> = {
  APPLICATION: "Conference Application",
  MOU: "MOU",
  BUDGET: "Budget",
  BANKING: "Banking Details",
  CFP: "Call for Papers",
  REVIEWS: "Reviews",
  VENUE: "Venue",
  REGISTRATION: "Registration",
  PROCEEDINGS: "Publication / Proceedings",
  FIN_CLOSE: "Conference Closure",
};

const formulaVariables = [
  "base_score",
  "issue_penalty",
  "data_completeness",
  "milestone_completion_pct",
  "total_milestones",
  "completed_milestones",
  "overdue_milestones",
  "blocked_milestones",
  "active_milestones",
  "due_soon_milestones",
];

type PermissionRow = { key: string; label: string; description: string };
type MappingRow = { source: string; normalized: string };
interface RefreshFactsResponse {
  status: string;
  synced: number;
}

interface RecalculateScoresResponse {
  updated: number;
  message: string;
}

type StringReferenceKey = Exclude<keyof ReferenceConfig, "conference_series">;

const STRING_REFERENCE_KEYS: StringReferenceKey[] = [
  "committee_members",
  "lifecycle_phases",
  "conference_statuses",
  "normalized_statuses",
  "sponsorship_types",
  "contact_roles",
  "issue_categories",
  "issue_severities",
  "review_assessments",
];

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "number")
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    api<AppSettings>("/settings")
      .then(setSettings)
      .catch((err) => message.error(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveSettings = async (patch: Partial<AppSettings> = {}) => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api<AppSettings>("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSettings(updated);
      message.success("Settings saved");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const saveReferenceConfig = async () => {
    if (!settings?.reference_config) return;
    const series = (settings.reference_config.conference_series ?? []);
    const codes = series.map((item) => item.code.trim().toUpperCase());
    if (series.some((item) => !item.code.trim() || !item.name.trim())) {
      message.error("Every conference series needs a code and display name");
      return;
    }
    if (new Set(codes).size !== codes.length) {
      message.error("Conference series codes must be unique");
      return;
    }
    setSaving(true);
    try {
      const updated = await api<AppSettings & { reference_cleanup?: Record<string, number> }>("/settings/reference-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference_config: settings.reference_config }),
      });
      setSettings(updated);
      const changed = Object.values(updated.reference_cleanup ?? {}).reduce((sum, value) => sum + value, 0);
      message.success(changed ? `Reference lists saved; ${changed} existing values moved to Unknown.` : "Reference lists saved");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save reference configuration");
    } finally {
      setSaving(false);
    }
  };

  const refreshFacts = async () => {
    const result = await api<RefreshFactsResponse>("/settings/refresh-conference-facts", { method: "POST" });
    message.success(`${result.synced ?? 0} conferences refreshed`);
  };

  const recalculateMilestones = async () => {
    if (!settings) return;
    setRecalculating(true);
    try {
      const updated = await api<AppSettings & { updated?: number }>("/settings/recalculate-milestone-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_date_defaults: settings.milestone_date_defaults }),
      });
      setSettings(updated);
      message.success(`Milestone dates recalculated${typeof updated.updated === "number" ? `; ${updated.updated} due dates updated` : ""}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to recalculate milestones");
    } finally {
      setRecalculating(false);
    }
  };

  const recalculateScores = async () => {
    setRecalculating(true);
    setSaving(true);
    try {
      const updated = await api<AppSettings>("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_settings: settings?.score_settings }),
      });
      setSettings(updated);
      const result = await api<RecalculateScoresResponse>("/settings/recalculate-scores", { method: "POST" });
      message.success(result.message || `${result.updated ?? 0} conference scores recalculated`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to recalculate scores");
    } finally {
      setSaving(false);
      setRecalculating(false);
    }
  };

  const updateScoreSetting = (key: string, value: number | string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      score_settings: {
        ...settings.score_settings,
        [key]: value,
      },
    });
  };

  const updateNestedScoreSetting = (group: string, key: string, value: number) => {
    if (!settings) return;
    const currentGroup = settings.score_settings[group];
    setSettings({
      ...settings,
      score_settings: {
        ...settings.score_settings,
        [group]: {
          ...(isNumberRecord(currentGroup) ? currentGroup : {}),
          [key]: value,
        },
      },
    });
  };

  const updateStatusMapping = (source: string, normalized: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      status_mappings: {
        ...(settings.status_mappings ?? {}),
        [source]: normalized,
      },
    });
  };

  const updateMilestoneOffset = (
    code: string,
    field: "anchor" | "months" | "days" | "warning_days",
    value: string | number,
  ) => {
    if (!settings) return;
    const current = settings.milestone_date_defaults?.[code] ?? { anchor: "start", months: 0, days: 0 };
    setSettings({
      ...settings,
      milestone_date_defaults: {
        ...(settings.milestone_date_defaults ?? {}),
        [code]: {
          anchor: field === "anchor" ? String(value) : String(current.anchor ?? "start"),
          months: field === "months" ? Number(value) : Number(current.months ?? 0),
          days: field === "days" ? Number(value) : Number(current.days ?? 0),
          warning_days: field === "warning_days" ? Number(value) : Number(current.warning_days ?? 0),
        },
      },
    });
  };

  const updateMilestoneStatusScore = (key: string, value: number) => {
    updateNestedScoreSetting("milestone_status_scores", key, value);
  };

  const updateConferenceSeries = (
    index: number,
    field: keyof ConferenceSeriesConfig,
    value: string | boolean,
  ) => {
    if (!settings) return;
    const current = [...((settings.reference_config?.conference_series ?? []))];
    current[index] = {
      ...current[index],
      [field]: field === "code" ? String(value).toUpperCase() : value,
    };
    setSettings({
      ...settings,
      reference_config: {
        ...(settings.reference_config ?? {}),
        conference_series: current,
      },
    });
  };

  const addConferenceSeries = () => {
    if (!settings) return;
    const current = [...((settings.reference_config?.conference_series ?? []))];
    current.push({ code: "", name: "", flagship: false });
    setSettings({
      ...settings,
      reference_config: {
        ...(settings.reference_config ?? {}),
        conference_series: current,
      },
    });
  };

  const removeConferenceSeries = (index: number) => {
    if (!settings) return;
    const current = [...((settings.reference_config?.conference_series ?? []))];
    current.splice(index, 1);
    setSettings({
      ...settings,
      reference_config: {
        ...(settings.reference_config ?? {}),
        conference_series: current,
      },
    });
  };

  const permissionRows = useMemo<PermissionRow[]>(
    () => settings?.permission_catalog ?? [],
    [settings],
  );

  const mappingRows = useMemo<MappingRow[]>(
    () =>
      Object.entries(settings?.status_mappings ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([source, normalized]) => ({ source, normalized })),
    [settings?.status_mappings],
  );

  const roleColumns: ColumnsType<PermissionRow> = [
    {
      title: "Permission",
      dataIndex: "label",
      fixed: "left",
      width: 260,
      render: (label: string, row) => (
        <span className="permission-label">
          <strong>{label}</strong>
          <span>{row.description}</span>
        </span>
      ),
    },
    ...((settings?.roles ?? []).map((role) => ({
      title: role.label,
      key: role.key,
      width: 145,
      align: "center" as const,
      render: (_: unknown, row: PermissionRow) => (
        <Switch
          checked={!!settings?.role_permissions?.[role.key]?.[row.key]}
          onChange={(checked) => {
            if (!settings) return;
            setSettings({
              ...settings,
              role_permissions: {
                ...(settings.role_permissions ?? {}),
                [role.key]: {
                  ...(settings.role_permissions?.[role.key] ?? {}),
                  [row.key]: checked,
                },
              },
            });
          }}
        />
      ),
    })) ?? []),
  ];

  if (loading) {
    return <Typography.Text type="secondary">Loading settings...</Typography.Text>;
  }

  if (!settings) {
    return <Typography.Text type="danger">Failed to load settings</Typography.Text>;
  }

  const statusOptions = settings.reference_config?.normalized_statuses ?? [];
  const formula = String(settings.score_settings?.score_formula ?? "");
  const scalarScoreSettings = Object.entries(settings.score_settings ?? {}).filter(
    ([, value]) => typeof value !== "object" || Array.isArray(value),
  );
  const groupedScoreSettings = Object.entries(settings.score_settings ?? {}).filter(
    ([key, value]) => key !== "milestone_status_scores" && value && typeof value === "object" && !Array.isArray(value),
  );
  const milestoneOffsets = Object.entries(settings.milestone_date_defaults ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const milestoneStatusScores = settings.score_settings?.milestone_status_scores ?? {};
  const referenceConfigEntries = STRING_REFERENCE_KEYS.map(
    (key) => [key, settings.reference_config?.[key] ?? []] as const,
  );

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Application configuration</Typography.Text>
          <h1>Settings</h1>
          <Typography.Text type="secondary">
            Configure scoring, portal modules, role access, reference values, and assistant behavior.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadSettings}>Reload</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => {
              void saveSettings({
                portfolio_start_year: settings.portfolio_start_year,
                kpi_from_year: settings.kpi_from_year,
                kpi_to_year: settings.kpi_to_year,
                score_settings: settings.score_settings,
                status_mappings: settings.status_mappings,
                feature_flags: settings.feature_flags,
                role_permissions: settings.role_permissions,
                assistant_system_prompt: settings.assistant_system_prompt,
              });
            }}
          >
            Save Settings
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card
              className="settings-panel settings-panel-highlight"
              title={<><ThunderboltOutlined /> Conference Score Management</>}
              extra={
                <Space wrap>
                  <Button icon={<ReloadOutlined />} loading={recalculating} onClick={() => { void recalculateScores(); }}>
                    Recalculate Scores
                  </Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={() => { void saveSettings({ score_settings: settings.score_settings }); }}
                  >
                    Save Scoring
                  </Button>
                </Space>
              }
            >
              <Alert
                showIcon
                type="info"
                className="settings-inline-alert"
                message="Saving scoring settings recalculates all conference scores and automatically refreshes derived conference status."
              />
              <div className="score-formula-box">
                <div>
                  <Typography.Text strong>Active Score Formula</Typography.Text>
                  <Typography.Paragraph type="secondary">
                    Result is clamped to 0-100. Available functions: min, max, round, abs.
                  </Typography.Paragraph>
                </div>
                <Input.TextArea
                  rows={3}
                  value={formula}
                  onChange={(event) => updateScoreSetting("score_formula", event.target.value)}
                />
                <div className="formula-token-list">
                  {formulaVariables.map((variable) => <Tag key={variable}>{variable}</Tag>)}
                </div>
              </div>

              <Row gutter={[14, 14]}>
                {scalarScoreSettings
                  .filter(([key]) => key !== "score_formula")
                  .map(([key, value]) => (
                    <Col xs={24} md={12} key={key}>
                      <div className="score-setting-row is-carded">
                        <span>
                          <strong>{scoreLabels[key] ?? key}</strong>
                          {scoreDescriptions[key] && <small>{scoreDescriptions[key]}</small>}
                        </span>
                        <InputNumber
                          value={Number(value)}
                          min={0}
                          max={key.includes("cap") ? 500 : 100}
                          onChange={(nextValue) => updateScoreSetting(key, Number(nextValue ?? 0))}
                        />
                      </div>
                    </Col>
                  ))}
              </Row>

              <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
                {groupedScoreSettings.map(([key, value]) => (
                  <Col xs={24} lg={12} key={key}>
                    <Card size="small" className="settings-subcard" title={scoreLabels[key] ?? key}>
                      {scoreDescriptions[key] && (
                        <Typography.Paragraph type="secondary" className="settings-description">
                          {scoreDescriptions[key]}
                        </Typography.Paragraph>
                      )}
                      <Space direction="vertical" style={{ width: "100%" }}>
                        {Object.entries(value as Record<string, number>).map(([nestedKey, nestedValue]) => (
                          <div className="score-setting-row" key={`${key}-${nestedKey}`}>
                            <span>{nestedKey}</span>
                            <InputNumber
                              value={Number(nestedValue)}
                              min={0}
                              max={key === "issue_assessment_factors" ? 5 : 100}
                              onChange={(nextValue) =>
                                updateNestedScoreSetting(key, nestedKey, Number(nextValue ?? 0))
                              }
                            />
                          </div>
                        ))}
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>

            <Card
              className="settings-panel"
              title={<><FieldTimeOutlined /> Milestones</>}
              extra={
                <Button icon={<ReloadOutlined />} loading={recalculating} onClick={() => { void recalculateMilestones(); }}>
                  Save & Recalculate Milestones
                </Button>
              }
            >
              <Alert
                showIcon
                type="info"
                className="settings-inline-alert"
                message="Milestone due dates are calculated from the configured start/end anchor plus the month/day offset. Recalculation also refreshes scores and derived conference status."
              />
              <Typography.Title level={5}>Due Date Offsets</Typography.Title>
              <div className="milestone-config-grid">
                {milestoneOffsets.map(([code, offset]) => (
                  <div className="milestone-config-card" key={code}>
                    <div>
                      <strong>{milestoneOffsetLabels[code] ?? code}</strong>
                      <span>{code}</span>
                      {(code === "PROCEEDINGS" || code === "FIN_CLOSE") && (
                        <Typography.Text type="secondary">
                          Due offset sets the green deadline. Grace days are yellow; later dates are red.
                        </Typography.Text>
                      )}
                    </div>
                    <Select
                      value={String(offset.anchor ?? "start")}
                      options={[
                        { label: "Conference start", value: "start" },
                        { label: "Conference end", value: "end" },
                      ]}
                      onChange={(value) => updateMilestoneOffset(code, "anchor", value)}
                    />
                    <InputNumber
                      value={Number(offset.months ?? 0)}
                      addonAfter="months"
                      onChange={(value) => updateMilestoneOffset(code, "months", Number(value ?? 0))}
                    />
                    <InputNumber
                      value={Number(offset.days ?? 0)}
                      addonAfter="days"
                      onChange={(value) => updateMilestoneOffset(code, "days", Number(value ?? 0))}
                    />
                    {(code === "PROCEEDINGS" || code === "FIN_CLOSE") && (
                      <InputNumber
                        value={Number(offset.warning_days ?? 0)}
                        min={0}
                        addonAfter="grace days"
                        onChange={(value) => updateMilestoneOffset(code, "warning_days", Number(value ?? 0))}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Typography.Title level={5} style={{ marginTop: 18 }}>Milestone Status Scores</Typography.Title>
              <Typography.Paragraph type="secondary" className="settings-description">
                These values determine how each milestone timing/status condition contributes to the weighted base score. The score formula can reference the resulting <code>base_score</code> plus milestone count variables.
              </Typography.Paragraph>
              <div className="milestone-score-grid">
                {Object.entries(milestoneStatusScores).map(([key, value]) => (
                  <div className="score-setting-row is-carded" key={key}>
                    <span>
                      <strong>{milestoneScoreLabels[key] ?? key}</strong>
                      <small>{key}</small>
                    </span>
                    <InputNumber
                      value={Number(value)}
                      min={0}
                      max={100}
                      onChange={(nextValue) => updateMilestoneStatusScore(key, Number(nextValue ?? 0))}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="settings-panel" title={<><SafetyCertificateOutlined /> Status Mapping</>}>
              <Typography.Paragraph type="secondary">
                Imported status labels are normalized through these mappings before they are used by milestones, facts, and scoring.
              </Typography.Paragraph>
              <Table
                size="small"
                rowKey="source"
                pagination={{ pageSize: 8 }}
                dataSource={mappingRows}
                columns={[
                  { title: "Imported Value", dataIndex: "source", key: "source" },
                  {
                    title: "Normalized Value",
                    dataIndex: "normalized",
                    key: "normalized",
                    width: 260,
                    render: (value: string, row: MappingRow) => (
                      <Select
                        style={{ width: "100%" }}
                        value={value}
                        options={statusOptions.map((status) => ({ label: status, value: status }))}
                        onChange={(nextValue) => updateStatusMapping(row.source, nextValue)}
                      />
                    ),
                  },
                ]}
              />
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card className="settings-panel" title={<><SlidersOutlined /> Portfolio Defaults</>}>
              <div className="settings-kpi-period">
                <div className="settings-kpi-period-copy">
                  <strong>Overview KPI reporting period</strong>
                  <span>
                    Limits the overview metrics and status/lifecycle charts to conferences within this inclusive year range.
                  </span>
                </div>
                <div className="settings-kpi-period-controls">
                  <label>
                    <span>From</span>
                    <Select
                      value={settings.kpi_from_year}
                      options={Array.from(
                        new Set([
                          ...(settings.kpi_available_years ?? []),
                          settings.kpi_from_year,
                          settings.kpi_to_year,
                        ].filter((year): year is number => typeof year === "number")),
                      )
                        .sort((left, right) => left - right)
                        .map((year) => ({ label: String(year), value: year }))}
                      onChange={(year) =>
                        setSettings({
                          ...settings,
                          kpi_from_year: year,
                          kpi_to_year: Math.max(year, settings.kpi_to_year ?? year),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <Select
                      value={settings.kpi_to_year}
                      options={Array.from(
                        new Set([
                          ...(settings.kpi_available_years ?? []),
                          settings.kpi_from_year,
                          settings.kpi_to_year,
                        ].filter((year): year is number => typeof year === "number")),
                      )
                        .sort((left, right) => left - right)
                        .map((year) => ({ label: String(year), value: year }))}
                      onChange={(year) =>
                        setSettings({
                          ...settings,
                          kpi_from_year: Math.min(settings.kpi_from_year ?? year, year),
                          kpi_to_year: year,
                        })
                      }
                    />
                  </label>
                </div>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={() => {
                    void saveSettings({
                      kpi_from_year: settings.kpi_from_year,
                      kpi_to_year: settings.kpi_to_year,
                    });
                  }}
                >
                  Save KPI Period
                </Button>
              </div>
              <div className="settings-control-row">
                <div>
                  <strong>Default portfolio start year</strong>
                  <span>Used by overview filters and portfolio-level timelines.</span>
                </div>
                <InputNumber
                  value={settings.portfolio_start_year}
                  min={2000}
                  max={2100}
                  onChange={(value) => setSettings({ ...settings, portfolio_start_year: Number(value ?? 2020) })}
                />
              </div>
              <Space wrap style={{ marginTop: 14 }}>
                <Button icon={<ReloadOutlined />} onClick={() => { void refreshFacts(); }}>Refresh Conference Facts</Button>
                <Button icon={<ReloadOutlined />} onClick={() => { void recalculateMilestones(); }}>Recalculate Milestone Dates</Button>
              </Space>
            </Card>

            <Card className="settings-panel" title={<><AppstoreOutlined /> Portal Modules</>}>
              <Row gutter={[10, 10]}>
                {Object.entries(settings.feature_flags).map(([key, enabled]) => (
                  <Col xs={24} sm={12} xl={24} key={key}>
                    <div className="feature-toggle-row">
                      <strong>{featureLabels[key] ?? key}</strong>
                      <Switch
                        checked={enabled}
                        onChange={(checked) =>
                          setSettings({
                            ...settings,
                            feature_flags: { ...settings.feature_flags, [key]: checked },
                          })
                        }
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>

            <Card className="settings-panel" title="Assistant RAG Prompt">
              <Input.TextArea
                rows={9}
                value={settings.assistant_system_prompt}
                onChange={(event) => setSettings({ ...settings, assistant_system_prompt: event.target.value })}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Card title="Role Access" className="section-gap settings-panel">
        <Table
          dataSource={permissionRows}
          columns={roleColumns}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>

      <Card
        title={<><EditOutlined /> Reference Configuration</>}
        className="section-gap settings-panel"
        extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => { void saveReferenceConfig(); }}>Save Reference Lists</Button>}
      >
        <Alert
          showIcon
          type="info"
          className="settings-inline-alert"
          message="Removing a configured value moves existing records using it to Unknown through the backend cleanup rule."
        />
        <div className="conference-series-editor">
          <div className="conference-series-editor-head">
            <div>
              <Typography.Text strong>Conference Series</Typography.Text>
              <Typography.Text type="secondary">
                Used by conference records, flagship lanes, imports, and conference-series knowledge scope.
              </Typography.Text>
            </div>
            <Button icon={<PlusOutlined />} onClick={addConferenceSeries}>
              Add Series
            </Button>
          </div>
          <div className="conference-series-labels" aria-hidden="true">
            <span>Code</span>
            <span>Display name</span>
            <span>Flagship</span>
            <span>Action</span>
          </div>
          <div className="conference-series-rows">
            {((settings.reference_config?.conference_series ?? [])).map((item, index) => (
              <div className="conference-series-row" key={`conference-series-${index}`}>
                <Input
                  aria-label="Conference series code"
                  value={item.code}
                  maxLength={32}
                  disabled={item.code === "UNKNOWN"}
                  onChange={(event) => updateConferenceSeries(index, "code", event.target.value)}
                />
                <Input
                  aria-label="Conference series display name"
                  value={item.name}
                  disabled={item.code === "UNKNOWN"}
                  onChange={(event) => updateConferenceSeries(index, "name", event.target.value)}
                />
                <Switch
                  aria-label="Flagship conference series"
                  checked={item.flagship}
                  disabled={item.code === "UNKNOWN"}
                  onChange={(checked) => updateConferenceSeries(index, "flagship", checked)}
                />
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  disabled={item.code === "UNKNOWN"}
                  title="Delete conference series"
                  onClick={() => removeConferenceSeries(index)}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="reference-config-grid">
          {referenceConfigEntries.map(([key, values]) => (
            <div className="reference-config-card" key={key}>
              <div className="reference-config-head">
                <strong>{settings.reference_config_labels?.[key] ?? key}</strong>
                <Tag>{values.length}</Tag>
              </div>
              <Select
                className="reference-editor-select"
                mode="tags"
                value={values}
                tokenSeparators={[","]}
                onChange={(nextValues) =>
                  setSettings({
                    ...settings,
                    reference_config: {
                      ...(settings.reference_config ?? {}),
                      [key]: nextValues,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
