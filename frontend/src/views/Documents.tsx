import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState } from "react";

import { api, apiUrl } from "@/lib/api";
import type { Document, ServiceVerification } from "@/types/conference";

const UPLOAD_SCOPES = ["Global IEEE", "IEEE ITSS", "Conference Series"];
const DOCUMENT_CATEGORIES = ["Policy", "Conference Operations", "Finance", "Publication", "Template Guidance", "Other"];

interface DocumentUploadValues {
  title: string;
  document_category: string;
  knowledge_scope: string;
  version?: string;
  source_url?: string;
}

interface ItemResponse<T> {
  items: T[];
}

interface VectorPreview {
  index: number;
  text: string;
  character_count: number;
  has_embedding: boolean;
  dimension: number;
}

interface VectorResponse {
  document: Document;
  vector: {
    exists: boolean;
    chunk_count: number;
    embedded_count: number;
    dimension: number;
    model?: string;
    provider?: string;
    updated_at?: string;
  };
  chunks: VectorPreview[];
}

export default function Documents() {
  const [form] = Form.useForm<DocumentUploadValues>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [vectorPreview, setVectorPreview] = useState<VectorResponse | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<ServiceVerification | null>(null);

  const scopeOptions = useMemo(
    () => UPLOAD_SCOPES.map((scope) => ({ label: scope, value: scope })),
    [],
  );

  const fetchDocuments = () => {
    setLoading(true);
    api<ItemResponse<Document>>("/documents")
      .then((data) => setDocuments(data.items ?? []))
      .catch((err) => message.error(err instanceof Error ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning("Select a document first");
      return;
    }
    const values = await form.validateFields();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", values.title);
      formData.append("document_category", values.document_category);
      formData.append("knowledge_scope", values.knowledge_scope);
      if (values.version) formData.append("version", values.version);
      if (values.source_url) formData.append("source_url", values.source_url);
      await api("/documents", { method: "POST", body: formData });
      message.success("Document uploaded and indexed");
      form.resetFields();
      setFileList([]);
      fetchDocuments();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api(`/documents/${deleteId}`, { method: "DELETE" });
      message.success("Document deleted");
      setDeleteId(null);
      fetchDocuments();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  const verifyEmbeddings = async () => {
    try {
      const status = await api<ServiceVerification>("/settings/verify-embeddings", {
        method: "POST",
      });
      setEmbeddingStatus(status);
      message[status.ok ? "success" : "warning"](status.message || "Embedding verification completed");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Embedding verification failed");
    }
  };

  const inspectDocument = async (document: Document) => {
    try {
      const data = await api<VectorResponse>(`/documents/${document.id}/vectors`);
      setVectorPreview(data);
      setInspectOpen(true);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Inspection failed");
    }
  };

  const reindexDocument = async (document: Document) => {
    try {
      await api(`/documents/${document.id}/reindex`, { method: "POST" });
      message.success("Document vectors rebuilt");
      fetchDocuments();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Rebuild failed");
    }
  };

  const columns: ColumnsType<Document> = [
    {
      title: "Document",
      dataIndex: "title",
      width: 260,
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (value: string) => (
        <Typography.Text strong className="table-title">
          <FileTextOutlined /> {value}
        </Typography.Text>
      ),
    },
    {
      title: "Scope",
      dataIndex: "knowledge_scope",
      width: 130,
      sorter: (a, b) => a.knowledge_scope.localeCompare(b.knowledge_scope),
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: "Category",
      dataIndex: "document_category",
      width: 180,
      sorter: (a, b) => a.document_category.localeCompare(b.document_category),
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: "Chunks",
      dataIndex: "chunk_count",
      width: 110,
      sorter: (a, b) => a.chunk_count - b.chunk_count,
    },
    {
      title: "Indexing",
      dataIndex: "indexing_state",
      width: 140,
      sorter: (a, b) => a.indexing_state.localeCompare(b.indexing_state),
      render: (value: string) => (
        <Tag color={value === "Embedded" ? "green" : value === "Embedding Failed" ? "red" : "gold"}>
          {value}
        </Tag>
      ),
    },
    {
      title: "Uploaded",
      dataIndex: "upload_date",
      width: 140,
      sorter: (a, b) => a.upload_date.localeCompare(b.upload_date),
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      width: 250,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { void inspectDocument(record); }}>
            Inspect
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { void reindexDocument(record); }}>
            Rebuild
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => window.open(apiUrl(`/documents/${record.id}/download`), "_blank")} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteId(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Indexed guidance</Typography.Text>
          <h1>Knowledge Base</h1>
          <Typography.Text type="secondary">
            Upload IEEE and ITSS guidance, verify embeddings, inspect chunks, and keep source files downloadable.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<CheckCircleOutlined />} onClick={() => { void verifyEmbeddings(); }}>
            Verify Embeddings
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchDocuments}>
            Refresh
          </Button>
        </Space>
      </div>

      {embeddingStatus && (
        <Card className="section-gap">
          <Space direction="vertical">
            <Tag color={embeddingStatus.ok ? "green" : "gold"}>
              {embeddingStatus.provider || "Embeddings"}: {embeddingStatus.ok ? "Reachable" : "Needs attention"}
            </Tag>
            <Typography.Text type="secondary">{embeddingStatus.message}</Typography.Text>
            {embeddingStatus.dimension && (
              <Typography.Text>Vector dimension: {embeddingStatus.dimension}</Typography.Text>
            )}
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]} className="section-gap">
        <Col xs={24}>
          <Card title={<><UploadOutlined /> Upload and Index</>}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ document_category: "Other", knowledge_scope: "IEEE ITSS" }}
            >
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
                    <Input placeholder="Document title" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name="document_category" label="Category">
                    <Select options={DOCUMENT_CATEGORIES.map((value) => ({ label: value, value }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name="knowledge_scope" label="Knowledge Scope">
                    <Select options={scopeOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name="version" label="Version">
                    <Input placeholder="Optional" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name="source_url" label="Source URL">
                    <Input placeholder="Optional" />
                  </Form.Item>
                </Col>
              </Row>
              <Space wrap>
                <Upload
                  fileList={fileList}
                  beforeUpload={() => false}
                  maxCount={1}
                  onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                >
                  <Button icon={<UploadOutlined />}>Select Document</Button>
                </Upload>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  loading={uploading}
                  onClick={() => { void handleUpload(); }}
                >
                  Upload and Index
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Document Library">
            <Table
              dataSource={documents}
              columns={columns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 5, showSizeChanger: false, showTotal: (total) => `${total} documents` }}
              size="middle"
              scroll={{ x: 980 }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={vectorPreview ? `Inspect: ${vectorPreview.document.title}` : "Inspect Document"}
        open={inspectOpen}
        onCancel={() => setInspectOpen(false)}
        footer={null}
        width={900}
      >
        {vectorPreview && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Space wrap>
              <Tag color={vectorPreview.vector.exists ? "green" : "gold"}>
                {vectorPreview.vector.exists ? "Vector file present" : "No vector file"}
              </Tag>
              <Tag>{vectorPreview.vector.chunk_count} chunks</Tag>
              <Tag>{vectorPreview.vector.embedded_count} embedded</Tag>
              <Tag>{vectorPreview.vector.provider}</Tag>
            </Space>
            <Table
              dataSource={vectorPreview.chunks}
              rowKey="index"
              size="small"
              pagination={{ pageSize: 5 }}
              columns={[
                { title: "Chunk", dataIndex: "index", width: 90 },
                { title: "Characters", dataIndex: "character_count", width: 120 },
                {
                  title: "Embedding",
                  dataIndex: "has_embedding",
                  width: 120,
                  render: (value: boolean) => value ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>,
                },
                { title: "Preview", dataIndex: "text" },
              ]}
            />
          </Space>
        )}
      </Modal>

      <Modal
        title="Delete Document"
        open={deleteId !== null}
        onOk={() => { void handleDelete(); }}
        onCancel={() => setDeleteId(null)}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <p>This removes the uploaded file and its local vector chunks.</p>
      </Modal>
    </div>
  );
}
