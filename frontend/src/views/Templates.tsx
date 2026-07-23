import {
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  Modal,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useEffect, useMemo, useState } from "react";

import { api, apiUrl } from "@/lib/api";
import { useAccess } from "@/hooks/useAccess";
import type { ReferenceData, Template } from "@/types/conference";

interface ItemResponse<T> {
  items: T[];
}

const fallbackCategories = ["Unknown", "Planning", "Application", "MOU", "Finance", "Publication", "Closeout"];

export default function Templates() {
  const [form] = Form.useForm();
  const { canManageTemplates } = useAccess();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const phases = referenceData?.lifecycle_phases?.map((phase) => phase.display_name || phase.name) ?? [];
    return Array.from(new Set([...phases, ...fallbackCategories]));
  }, [referenceData]);

  const fetchTemplates = () => {
    setLoading(true);
    Promise.all([
      api<ItemResponse<Template>>("/templates"),
      api<ReferenceData>("/reference-data"),
    ])
      .then(([templateData, refs]) => {
        setTemplates(templateData.items ?? []);
        setReferenceData(refs);
      })
      .catch((err) => message.error(err instanceof Error ? err.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning("Select a template file first");
      return;
    }
    const values = await form.validateFields();
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("template_name", values.template_name);
      formData.append("short_description", values.short_description ?? "");
      formData.append("category", values.category);
      await api("/templates", { method: "POST", body: formData });
      message.success("Template uploaded");
      form.resetFields();
      setFileList([]);
      fetchTemplates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api(`/templates/${deleteId}`, { method: "DELETE" });
      message.success("Template deleted");
      setDeleteId(null);
      fetchTemplates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const columns: ColumnsType<Template> = [
    {
      title: "Template Name",
      dataIndex: "template_name",
      width: "24%",
      sorter: (a, b) => a.template_name.localeCompare(b.template_name),
      render: (value: string, record) => (
        <Space direction="vertical" size={2} className="template-name-cell">
          <Typography.Text strong><FileTextOutlined /> {value}</Typography.Text>
          <Typography.Text type="secondary" ellipsis={{ tooltip: record.original_filename }}>
            {record.original_filename}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "Short Description",
      dataIndex: "short_description",
      width: "28%",
      responsive: ["lg"],
      sorter: (a, b) => (a.short_description ?? "").localeCompare(b.short_description ?? ""),
      render: (value: string | null) => (
        <Typography.Paragraph className="template-description" ellipsis={{ rows: 2, tooltip: value || "-" }}>
          {value || "-"}
        </Typography.Paragraph>
      ),
    },
    {
      title: "Category",
      dataIndex: "category",
      width: "16%",
      responsive: ["md"],
      sorter: (a, b) => a.category.localeCompare(b.category),
      render: (value: string) => <Tag className="status-tag-wrap" color="blue">{value || "Unknown"}</Tag>,
    },
    {
      title: "Type",
      dataIndex: "template_type",
      width: "10%",
      responsive: ["sm"],
      sorter: (a, b) => a.template_type.localeCompare(b.template_type),
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: "Last Update",
      dataIndex: "last_update",
      width: "12%",
      responsive: ["lg"],
      sorter: (a, b) => a.last_update.localeCompare(b.last_update),
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      title: "Actions",
      key: "actions",
      width: canManageTemplates ? 96 : 52,
      align: "right",
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            title="Download template"
            icon={<DownloadOutlined />}
            onClick={() => window.open(apiUrl(`/templates/${record.id}/download`), "_blank")}
          />
          {canManageTemplates && (
            <Button
              size="small"
              danger
              title="Delete template"
              icon={<DeleteOutlined />}
              onClick={() => setDeleteId(record.id)}
            />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Text className="hero-kicker">Organizer library</Typography.Text>
          <h1>Templates</h1>
          <Typography.Text type="secondary">
            Store downloadable Word, Excel, PDF, and presentation templates by lifecycle phase.
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchTemplates}>
          Refresh
        </Button>
      </div>

      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        {canManageTemplates && (
          <Card title={<><UploadOutlined /> Upload Template</>} className="template-upload-card">
            <Form form={form} layout="vertical" initialValues={{ category: "Unknown" }}>
              <Row gutter={[16, 0]} align="bottom">
                <Col xs={24} md={12} xl={7}>
                <Form.Item
                  name="template_name"
                  label="Template Name"
                  rules={[{ required: true, message: "Template name is required" }]}
                >
                  <Input placeholder="Example: Finance closing checklist" />
                </Form.Item>
                </Col>
                <Col xs={24} md={12} xl={6}>
                <Form.Item name="short_description" label="Short Description">
                  <Input placeholder="What this template helps organizers do" />
                </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={4}>
                <Form.Item name="category" label="Lifecycle Phase">
                  <Select options={categories.map((value) => ({ label: value, value }))} />
                </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={4}>
                  <Form.Item label="Template File" required>
                <Upload
                  fileList={fileList}
                  beforeUpload={() => false}
                  maxCount={1}
                  onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                >
                  <Button icon={<UploadOutlined />} block>Select File</Button>
                </Upload>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={3}>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  loading={uploading}
                  onClick={handleUpload}
                  block
                >
                  Upload
                </Button>
                </Col>
              </Row>
            </Form>
          </Card>
        )}

        <Card title="Template Library" className="template-library-card">
          <Table
            dataSource={templates}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 5,
              showSizeChanger: false,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} templates`,
            }}
            size="middle"
            tableLayout="fixed"
          />
        </Card>
      </Space>

      <Modal
        title="Delete Template"
        open={deleteId !== null}
        onOk={handleDelete}
        onCancel={() => setDeleteId(null)}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <p>This removes the template file from the local template library.</p>
      </Modal>
    </div>
  );
}
