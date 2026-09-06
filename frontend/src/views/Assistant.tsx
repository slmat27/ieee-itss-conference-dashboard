import {
  DownloadOutlined,
  MessageOutlined,
  SendOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import { useMemo, useState } from "react";

import { api, apiUrl } from "@/lib/api";

const ASSISTANT_SCOPES = ["Global IEEE", "IEEE ITSS", "Conference Series", "All KBs"] as const;

interface CitationSource {
  document_id: string;
  title: string;
  category?: string;
  scope?: string;
}

interface AssistantFormValues {
  knowledge_scope: string;
  question: string;
}

interface ChatResponse {
  answer: string;
  sources: CitationSource[];
  mode: string;
}

function renderMarkdownLite(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(<h4 key={index}>{renderInline(trimmed.slice(4))}</h4>);
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      nodes.push(<h3 key={index}>{renderInline(trimmed.slice(3))}</h3>);
      return;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      return;
    }
    flushList();
    nodes.push(<p key={index}>{renderInline(trimmed)}</p>);
  });
  flushList();
  return nodes.length ? nodes : <p>{markdown}</p>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export default function Assistant() {
  const [form] = Form.useForm<AssistantFormValues>();
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const scopeOptions = useMemo(
    () => ASSISTANT_SCOPES.map((scope) => ({ label: scope, value: scope })),
    [],
  );

  const ask = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setAnswer(null);
    try {
      const response = await api<ChatResponse>("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "General IEEE conference operations",
          knowledge_scope: values.knowledge_scope,
          question: values.question,
        }),
      });
      setAnswer(response);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Assistant request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">RAG assistant</Typography.Text>
          <h1>Assistant</h1>
          <Typography.Text type="secondary">
            Ask questions against the uploaded IEEE, ITSS, and conference operations knowledge bases.
          </Typography.Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={9}>
          <Card title={<><MessageOutlined /> Ask a Question</>}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ knowledge_scope: "All KBs" }}
            >
              <Form.Item name="knowledge_scope" label="Knowledge Scope">
                <Select options={scopeOptions} />
              </Form.Item>
              <Form.Item
                name="question"
                label="Question"
                rules={[{ required: true, message: "Enter a question first" }]}
              >
                <Input.TextArea
                  rows={8}
                  placeholder="Example: What needs to be checked before finance closure?"
                />
              </Form.Item>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={loading}
                onClick={() => { void ask(); }}
                block
              >
                Ask Assistant
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card title="Answer">
            {!answer && !loading && (
              <Empty
                description="Ask a question to retrieve indexed knowledge and generate an answer."
              />
            )}
            {answer && (
              <Space direction="vertical" size={18} style={{ width: "100%" }}>
                <div className="assistant-answer">
                  {renderMarkdownLite(answer.answer)}
                </div>
                <div>
                  <Typography.Text strong>Sources</Typography.Text>
                  <Row gutter={[12, 12]} style={{ marginTop: 10 }}>
                    {answer.sources.length ? (
                      answer.sources.map((source) => (
                        <Col xs={24} md={12} key={source.document_id}>
                          <Card size="small">
                            <Space direction="vertical" style={{ width: "100%" }}>
                              <Typography.Text strong>{source.title}</Typography.Text>
                              <Space wrap>
                                {source.scope && <Tag>{source.scope}</Tag>}
                                {source.category && <Tag>{source.category}</Tag>}
                              </Space>
                              <Button
                                icon={<DownloadOutlined />}
                                onClick={() =>
                                  window.open(
                                    apiUrl(`/documents/${source.document_id}/download`),
                                    "_blank",
                                  )
                                }
                              >
                                Download Original
                              </Button>
                            </Space>
                          </Card>
                        </Col>
                      ))
                    ) : (
                      <Col span={24}>
                        <Typography.Text type="secondary">
                          No document citations were returned.
                        </Typography.Text>
                      </Col>
                    )}
                  </Row>
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
