import {
  AppstoreOutlined,
  EditOutlined,
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
import type { AppSettings } from "@/types/conference";

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
  issue_severity_penalties: "Issue Severity Penalties",
  issue_assessment_factors: "Issue Review Factors",
  issue_penalty_cap: "Issue Penalty Cap",
  lateness_step_days: "Lateness Step Days",
  lateness_cap_factor: "Lateness Cap Factor",
};

const formulaVariables = [
  "base_score",
  "issue_penalty",
  "data_completeness",
  "milestone_completion_pct",
  "overdue_milestones",
  "blocked_milestones",
  "active_milestones",
  "due_soon_milestones",
];

type PermissionRow = { key: string; label: string; description: string };
type MappingRow = { source: string; normalized: string };

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
    const result = await api<Record<string, any>>("/settings/refresh-conference-facts", { method: "POST" });
    message.success(`${result.synced ?? 0} conferences refreshed`);
  };

  const recalculateMilestones = async () => {
    await api("/settings/recalculate-milestone-dates", { method: "POST" });
    message.success("Milestone dates recalculated");
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
      const result = await api<Record<string, any>>("/settings/recalculate-scores", { method: "POST" });
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
    setSettings({
      ...settings,
      score_settings: {
        ...settings.score_settings,
        [group]: {
          ...(settings.score_settings[group] ?? {}),
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
    ([, value]) => value && typeof value === "object" && !Array.isArray(value),
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
            onClick={() =>
              saveSettings({
                portfolio_start_year: settings.portfolio_start_year,
                score_settings: settings.score_settings,
                status_mappings: settings.status_mappings,
                feature_flags: settings.feature_flags,
                role_permissions: settings.role_permissions,
                assistant_system_prompt: settings.assistant_system_prompt,
              })
            }
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
                  <Button icon={<ReloadOutlined />} loading={recalculating} onClick={recalculateScores}>
                    Recalculate Scores
                  </Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={() => saveSettings({ score_settings: settings.score_settings })}
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
                        <span>{scoreLabels[key] ?? key}</span>
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
                <Button icon={<ReloadOutlined />} onClick={refreshFacts}>Refresh Conference Facts</Button>
                <Button icon={<ReloadOutlined />} onClick={recalculateMilestones}>Recalculate Milestone Dates</Button>
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
        extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveReferenceConfig}>Save Reference Lists</Button>}
      >
        <Alert
          showIcon
          type="info"
          className="settings-inline-alert"
          message="Removing a configured value moves existing records using it to Unknown through the backend cleanup rule."
        />
        <div className="reference-config-grid">
          {Object.entries(settings.reference_config ?? {}).map(([key, values]) => (
            <div className="reference-config-card" key={key}>
              <div className="reference-config-head">
                <strong>{settings.reference_config_labels?.[key] ?? key}</strong>
                <Tag>{values.length}</Tag>
              </div>
              <Select
                className="reference-editor-select"
                mode="tags"
                value={values.map((item) => {
                  if (typeof item === "string") return item;
                  if (item && typeof item === "object" && "name" in item) return String(item.name);
                  return JSON.stringify(item);
                })}
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
