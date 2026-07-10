import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  LoadingOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Col, Descriptions, Input, Row, Space, Statistic, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { AppSettings, ConferenceSummary } from "@/types/conference";

interface HealthStatus {
  status?: string;
  version?: string;
  uptime_seconds?: number;
  database_connected?: boolean;
  llm_available?: boolean;
  embeddings_available?: boolean;
  checks?: Record<string, { status: string; detail?: string }>;
}

export default function SystemStatus() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [summary, setSummary] = useState<ConferenceSummary | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<Record<string, any> | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<Record<string, any> | null>(null);
  const [llmTest, setLlmTest] = useState("Reply with one short sentence confirming the IEEE ITSS dashboard LLM connection works.");
  const [llmTestResult, setLlmTestResult] = useState<Record<string, any> | null>(null);
  const [checkingLlm, setCheckingLlm] = useState(false);
  const [checkingEmbeddings, setCheckingEmbeddings] = useState(false);

  const loadStatus = () => {
    setLoading(true);
    Promise.all([
      fetch("/healthz").then((response) => response.json()),
      api<ConferenceSummary>("/dashboard/summary"),
      api<AppSettings>("/settings"),
    ])
      .then(([healthData, summaryData, settingsData]) => {
        setHealth(healthData);
        setSummary(summaryData);
        setSettings(settingsData);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Status check failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const verifyLLM = async () => {
    setCheckingLlm(true);
    try {
      const status = await api<Record<string, any>>("/settings/verify-azure-openai", { method: "POST" });
      setLlmStatus(status);
      message[status.ok ? "success" : "warning"](status.message || "LLM verification complete");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "LLM verification failed");
    } finally {
      setCheckingLlm(false);
    }
  };

  const verifyEmbeddings = async () => {
    setCheckingEmbeddings(true);
    try {
      const status = await api<Record<string, any>>("/settings/verify-embeddings", { method: "POST" });
      setEmbeddingStatus(status);
      message[status.ok ? "success" : "warning"](status.message || "Embedding verification complete");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Embedding verification failed");
    } finally {
      setCheckingEmbeddings(false);
    }
  };

  const testLLM = async () => {
    setCheckingLlm(true);
    try {
      const result = await api<Record<string, any>>("/settings/test-llm-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: llmTest }),
      });
      setLlmTestResult(result);
      message[result.ok ? "success" : "warning"](result.message || "LLM test message complete");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "LLM test message failed");
    } finally {
      setCheckingLlm(false);
    }
  };

  if (loading && !health) {
    return (
      <Card>
        <Space>
          <LoadingOutlined />
          <Typography.Text>Checking local services...</Typography.Text>
        </Space>
      </Card>
    );
  }

  const serviceOk = ["ok", "healthy"].includes(String(health?.status ?? "").toLowerCase());
  const dbOk = health?.database_connected !== false;
  const uptimeHours = health?.uptime_seconds ? Math.floor(health.uptime_seconds / 3600) : 0;
  const uptimeMinutes = health?.uptime_seconds ? Math.floor((health.uptime_seconds % 3600) / 60) : 0;
  const llmConfig = settings?.azure_openai ?? {};
  const embeddingConfig = settings?.embeddings ?? {};

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Runtime diagnostics</Typography.Text>
          <h1>System Status</h1>
          <Typography.Text type="secondary">
            Local Windows service health, database status, API availability, and configured AI services.
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadStatus} loading={loading}>
          Refresh
        </Button>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="status-card">
            <span className="status-icon"><ApiOutlined /></span>
            <div>
              <Statistic
                title="Backend API"
                value={serviceOk ? "Online" : health?.status || "Unknown"}
                valueStyle={{ color: serviceOk ? "#28a000" : "#ff4d4f" }}
              />
              <Typography.Text type="secondary">Frontend proxy `/api` and `/healthz`</Typography.Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="status-card">
            <span className="status-icon"><DatabaseOutlined /></span>
            <div>
              <Statistic
                title="Database"
                value={dbOk ? "Connected" : "Disconnected"}
                valueStyle={{ color: dbOk ? "#28a000" : "#ff4d4f" }}
              />
              <Typography.Text type="secondary">{summary?.conference_count ?? 0} conferences loaded</Typography.Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="status-card">
            <span className="status-icon"><ThunderboltOutlined /></span>
            <div>
              <Statistic
                title="Chat Model"
                value={llmConfig.configured ? "Configured" : "Missing"}
                valueStyle={{ color: llmConfig.configured ? "#28a000" : "#faad14" }}
              />
              <Typography.Text type="secondary">{llmConfig.chat_deployment || llmConfig.deployment || "No deployment"}</Typography.Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="status-card">
            <span className="status-icon"><CloudServerOutlined /></span>
            <div>
              <Statistic
                title="Embeddings"
                value={embeddingConfig.configured ? "Configured" : "Missing"}
                valueStyle={{ color: embeddingConfig.configured ? "#28a000" : "#faad14" }}
              />
              <Typography.Text type="secondary">{embeddingConfig.provider || "IAV on-prem TEI"}</Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="section-gap">
        <Col xs={24} lg={12}>
          <Card title="Service Runtime">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Health response">{health?.status || "Unknown"}</Descriptions.Item>
              <Descriptions.Item label="Version">{health?.version || "-"}</Descriptions.Item>
              <Descriptions.Item label="Uptime">{uptimeHours}h {uptimeMinutes}m</Descriptions.Item>
              <Descriptions.Item label="Frontend port">Current Vite dev server</Descriptions.Item>
              <Descriptions.Item label="Backend route">/api through frontend proxy</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="AI Configuration Summary">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="LLM provider">{llmConfig.provider || "Unknown"}</Descriptions.Item>
              <Descriptions.Item label="LLM endpoint">{llmConfig.endpoint || "-"}</Descriptions.Item>
              <Descriptions.Item label="API key">{llmConfig.api_key_present ? "Present" : "Missing"}</Descriptions.Item>
              <Descriptions.Item label="Embedding endpoint">{embeddingConfig.endpoint || "-"}</Descriptions.Item>
              <Descriptions.Item label="Embedding model">{embeddingConfig.model || "-"}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="section-gap">
        <Col xs={24} lg={12}>
          <Card title={<><ThunderboltOutlined /> LLM Connection</>}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Provider">{llmConfig.provider || "Unknown"}</Descriptions.Item>
              <Descriptions.Item label="Endpoint">{llmConfig.endpoint || "-"}</Descriptions.Item>
              <Descriptions.Item label="API key">{llmConfig.api_key_present ? "Present" : "Missing"}</Descriptions.Item>
              <Descriptions.Item label="Chat deployment/model">{llmConfig.chat_deployment || llmConfig.deployment || "-"}</Descriptions.Item>
            </Descriptions>
            <Space wrap style={{ marginTop: 14 }}>
              <Button icon={<CheckCircleOutlined />} onClick={verifyLLM} loading={checkingLlm}>Verify Connection</Button>
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
            <div className="llm-test-box" style={{ marginTop: 14 }}>
              <strong>One-shot LLM test</strong>
              <Input.TextArea rows={3} value={llmTest} onChange={(event) => setLlmTest(event.target.value)} />
              <Button onClick={testLLM} loading={checkingLlm}>Send Test Message</Button>
              {llmTestResult && <span className="llm-response">{llmTestResult.response || llmTestResult.message}</span>}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><CloudServerOutlined /> Embedding Service</>}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Provider">{embeddingConfig.provider || "IAV on-prem TEI"}</Descriptions.Item>
              <Descriptions.Item label="Endpoint">{embeddingConfig.endpoint || "-"}</Descriptions.Item>
              <Descriptions.Item label="Route">{embeddingConfig.route || "/v1/embeddings"}</Descriptions.Item>
              <Descriptions.Item label="Model">{embeddingConfig.model || "-"}</Descriptions.Item>
              <Descriptions.Item label="API key required">{embeddingConfig.api_key_required ? "Yes" : "No"}</Descriptions.Item>
            </Descriptions>
            <Space wrap style={{ marginTop: 14 }}>
              <Button icon={<CheckCircleOutlined />} onClick={verifyEmbeddings} loading={checkingEmbeddings}>Verify Embeddings</Button>
            </Space>
            {embeddingStatus && (
              <Alert
                style={{ marginTop: 12 }}
                type={embeddingStatus.ok ? "success" : "warning"}
                showIcon
                message={`${embeddingStatus.provider || "Embeddings"}: ${embeddingStatus.message}`}
                description={`Model ${embeddingStatus.model || "-"}; endpoint ${embeddingStatus.endpoint || "-"}`}
              />
            )}
          </Card>
        </Col>
      </Row>

      {health?.checks && Object.keys(health.checks).length > 0 && (
        <Card title="Detailed Checks" className="section-gap">
          <Space direction="vertical" style={{ width: "100%" }}>
            {Object.entries(health.checks).map(([name, check]) => (
              <Space key={name} wrap>
                {check.status === "pass" ? (
                  <CheckCircleOutlined style={{ color: "#28a000" }} />
                ) : (
                  <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
                )}
                <Typography.Text strong>{name}</Typography.Text>
                <Tag>{check.status}</Tag>
                {check.detail && <Typography.Text type="secondary">{check.detail}</Typography.Text>}
              </Space>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
}
