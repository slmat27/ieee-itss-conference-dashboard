import {
  CheckCircleOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
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
  base_score: "Base Score",
  data_completeness_weight: "Data Completeness Weight",
  milestone_adherence_weight: "Milestone Adherence Weight",
  issue_penalty_per_open: "Issue Penalty Per Open Issue",
  max_issue_penalty: "Maximum Issue Penalty",
  dimension_weights: "Dimension Weights",
  issue_severity_penalties: "Issue Severity Penalties",
  issue_assessment_factors: "Issue Assessment Factors",
  issue_penalty_cap: "Issue Penalty Cap",
  lateness_step_days: "Lateness Step Days",
  lateness_cap_factor: "Lateness Cap Factor",
};

type PermissionRow = { key: string; label: string; description: string };

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [llmStatus, setLlmStatus] = useState<Record<string, any> | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<Record<string, any> | null>(null);
  const [llmTest, setLlmTest] = useState("Reply with one short sentence confirming the IEEE ITSS dashboard LLM connection works.");
  const [llmTestResult, setLlmTestResult] = useState<Record<string, any> | null>(null);

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
        body: JSON.stringify({ ...patch }),
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
      message.success(changed ? `Reference configuration saved; ${changed} existing values normalized to Unknown.` : "Reference configuration saved");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to save reference configuration");
    } finally {
      setSaving(false);
    }
  };

  const verifyLLM = async () => {
    const status = await api<Record<string, any>>("/settings/verify-azure-openai", { method: "POST" });
    setLlmStatus(status);
    message[status.ok ? "success" : "warning"](status.message || "LLM verification complete");
  };

  const verifyEmbeddings = async () => {
    const status = await api<Record<string, any>>("/settings/verify-embeddings", { method: "POST" });
    setEmbeddingStatus(status);
    message[status.ok ? "success" : "warning"](status.message || "Embedding verification complete");
  };

  const testLLM = async () => {
    const result = await api<Record<string, any>>("/settings/test-llm-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: llmTest }),
    });
    setLlmTestResult(result);
  };

  const refreshFacts = async () => {
    const result = await api<Record<string, any>>("/settings/refresh-conference-facts", { method: "POST" });
    message.success(`${result.synced ?? 0} conferences refreshed`);
  };

  const recalculateMilestones = async () => {
    await api("/settings/recalculate-milestone-dates", { method: "POST" });
    message.success("Milestone dates recalculated");
  };

  const permissionRows = useMemo<PermissionRow[]>(
    () => settings?.permission_catalog ?? [],
    [settings],
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

  const llmConfig = settings.azure_openai ?? settings.llm_config ?? {};
  const embeddingConfig = settings.embeddings ?? {};

  const updateScoreSetting = (key: string, value: number) => {
    setSettings({
      ...settings,
      score_settings: {
        ...settings.score_settings,
        [key]: value,
      },
    });
  };

  const updateNestedScoreSetting = (group: string, key: string, value: number) => {
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

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Local configuration</Typography.Text>
          <h1>Settings</h1>
          <Typography.Text type="secondary">
            Configure scoring, modules, role access, reference lists, LLM checks, and maintenance actions.
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
                score_settings: settings.score_settings,
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
        <Col xs={24} xl={12}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card title={<><ThunderboltOutlined /> Score Settings</>}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {Object.entries(settings.score_settings).map(([key, value]) => {
                  if (value && typeof value === "object" && !Array.isArray(value)) {
                    return (
                      <Card size="small" title={scoreLabels[key] ?? key} key={key}>
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {Object.entries(value as Record<string, number>).map(([nestedKey, nestedValue]) => (
                            <div className="score-setting-row" key={`${key}-${nestedKey}`}>
                              <span>{nestedKey}</span>
                              <InputNumber
                                value={Number(nestedValue)}
                                min={0}
                                max={100}
                                addonAfter={key.includes("weight") ? "%" : undefined}
                                onChange={(nextValue) =>
                                  updateNestedScoreSetting(key, nestedKey, Number(nextValue ?? 0))
                                }
                              />
                            </div>
                          ))}
                        </Space>
                      </Card>
                    );
                  }
                  return (
                    <div className="score-setting-row" key={key}>
                      <span>{scoreLabels[key] ?? key}</span>
                      <InputNumber
                        value={Number(value)}
                        min={0}
                        max={100}
                        addonAfter={key.includes("weight") || key.includes("cap") ? "%" : undefined}
                        onChange={(nextValue) => updateScoreSetting(key, Number(nextValue ?? 0))}
                      />
                    </div>
                  );
                })}
              </Space>
            </Card>

            <Card title={<><SettingOutlined /> LLM Connection</>}>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Provider">{llmConfig.provider || "Unknown"}</Descriptions.Item>
                <Descriptions.Item label="Endpoint">{llmConfig.endpoint || "-"}</Descriptions.Item>
                <Descriptions.Item label="API key">{llmConfig.api_key_present ? "Present" : "Missing"}</Descriptions.Item>
                <Descriptions.Item label="Chat deployment/model">{llmConfig.chat_deployment || llmConfig.deployment || "-"}</Descriptions.Item>
              </Descriptions>
              <Space wrap style={{ marginTop: 14 }}>
                <Button icon={<CheckCircleOutlined />} onClick={verifyLLM}>Verify Connection</Button>
                <Button icon={<CheckCircleOutlined />} onClick={verifyEmbeddings}>Verify Embeddings</Button>
              </Space>
              {llmStatus && (
                <Alert
                  style={{ marginTop: 12 }}
                  type={llmStatus.ok ? "success" : "warning"}
                  showIcon
                  message={llmStatus.message}
                  description={llmStatus.checked_at}
                />
              )}
              {embeddingStatus && (
                <Alert
                  style={{ marginTop: 12 }}
                  type={embeddingStatus.ok ? "success" : "warning"}
                  showIcon
                  message={`${embeddingStatus.provider || "Embeddings"}: ${embeddingStatus.message}`}
                  description={`Model ${embeddingStatus.model || "-"}; endpoint ${embeddingStatus.endpoint || "-"}`}
                />
              )}
              <div className="llm-test-box" style={{ marginTop: 14 }}>
                <strong>One-shot LLM test</strong>
                <Input.TextArea rows={3} value={llmTest} onChange={(event) => setLlmTest(event.target.value)} />
                <Button onClick={testLLM}>Send Test Message</Button>
                {llmTestResult && <span className="llm-response">{llmTestResult.response || llmTestResult.message}</span>}
              </div>
            </Card>

            <Card title={<><ReloadOutlined /> Maintenance</>}>
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={refreshFacts}>Refresh Conference Facts</Button>
                <Button icon={<ReloadOutlined />} onClick={recalculateMilestones}>Recalculate Milestone Dates</Button>
              </Space>
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={12}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card title="Assistant RAG Prompt">
              <Input.TextArea
                rows={8}
                value={settings.assistant_system_prompt}
                onChange={(event) => setSettings({ ...settings, assistant_system_prompt: event.target.value })}
              />
            </Card>

            <Card title="Portal Modules">
              <Row gutter={[10, 10]}>
                {Object.entries(settings.feature_flags).map(([key, enabled]) => (
                  <Col xs={24} sm={12} key={key}>
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

            <Card title="Embedding Service">
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="Provider">{embeddingConfig.provider || "IAV on-prem TEI"}</Descriptions.Item>
                <Descriptions.Item label="Endpoint">{embeddingConfig.endpoint || "-"}</Descriptions.Item>
                <Descriptions.Item label="Route">{embeddingConfig.route || "/v1/embeddings"}</Descriptions.Item>
                <Descriptions.Item label="Model">{embeddingConfig.model || "-"}</Descriptions.Item>
                <Descriptions.Item label="API key required">{embeddingConfig.api_key_required ? "Yes" : "No"}</Descriptions.Item>
              </Descriptions>
            </Card>
          </Space>
        </Col>
      </Row>

      <Card title="Role Access" className="section-gap">
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
        className="section-gap"
        extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveReferenceConfig}>Save Reference Lists</Button>}
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
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
