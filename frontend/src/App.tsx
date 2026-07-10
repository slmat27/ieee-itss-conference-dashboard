import {
  BankOutlined,
  BugOutlined,
  DashboardOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  MailOutlined,
  MessageOutlined,
  SearchOutlined,
  SettingOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Input, Layout, Menu, Select, message } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import ieeeLogo from "@/assets/ieee.png";
import itssLogo from "@/assets/itss.png";
import { Page } from "@/components/ui";
import { AccessProvider, useAccess, type AccessContextValue } from "@/hooks/useAccess";
import { api } from "@/lib/api";
import type { AppSettings } from "@/types/conference";

import Assistant from "@/views/Assistant";
import Conferences from "@/views/Conferences";
import ConferenceDetail from "@/views/ConferenceDetail";
import Documents from "@/views/Documents";
import EmailDrafts from "@/views/EmailDrafts";
import Imports from "@/views/Imports";
import Issues from "@/views/Issues";
import Overview from "@/views/Overview";
import Settings from "@/views/Settings";
import SystemStatus from "@/views/SystemStatus";
import Templates from "@/views/Templates";

const { Sider, Content, Header } = Layout;

const DEFAULT_ROLES = [
  { key: "administrator", label: "Administrator" },
  { key: "conference_organizer", label: "Conference Organizer" },
  { key: "itss_leadership", label: "ITSS Leadership" },
  { key: "cee_staff", label: "CEE Staff" },
];

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  administrator: {
    overview: true,
    conferences: true,
    conference_edit: true,
    issues: true,
    issue_edit: true,
    imports: true,
    knowledge_base: true,
    templates: true,
    template_upload: true,
    assistant: true,
    email_drafts: true,
    system_status: true,
    settings: true,
  },
};

const navItems = [
  { key: "/", permission: "overview", module: "overview", icon: <DashboardOutlined />, label: "Overview" },
  {
    key: "/conferences",
    permission: "conferences",
    module: "conferences",
    icon: <BankOutlined />,
    label: "Conferences",
  },
  { key: "/issues", permission: "issues", module: "issues", icon: <BugOutlined />, label: "Issues" },
  {
    key: "/imports",
    permission: "imports",
    module: "imports",
    icon: <FileExcelOutlined />,
    label: "Import Center",
  },
  {
    key: "/documents",
    permission: "knowledge_base",
    module: "knowledge_base",
    icon: <FileTextOutlined />,
    label: "Knowledge Base",
  },
  {
    key: "/assistant",
    permission: "assistant",
    module: "assistant",
    icon: <MessageOutlined />,
    label: "Assistant",
  },
  {
    key: "/templates",
    permission: "templates",
    module: "templates",
    icon: <FileTextOutlined />,
    label: "Templates",
  },
  {
    key: "/email-drafts",
    permission: "email_drafts",
    module: "email_drafts",
    icon: <MailOutlined />,
    label: "Email Drafts",
  },
  {
    key: "/settings",
    permission: "settings",
    module: "settings",
    icon: <SettingOutlined />,
    label: "Settings",
  },
  {
    key: "/status",
    permission: "system_status",
    module: "system_status",
    icon: <UnorderedListOutlined />,
    label: "System Status",
  },
];

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

function AppLayout() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedRole, setSelectedRole] = useState("administrator");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api<AppSettings>("/settings")
      .then(setSettings)
      .catch((err) => message.warning(err instanceof Error ? err.message : "Role settings could not be loaded"));
  }, []);

  const roles = settings?.roles?.length ? settings.roles : DEFAULT_ROLES;
  const permissions =
    settings?.role_permissions?.[selectedRole] ??
    DEFAULT_PERMISSIONS[selectedRole] ??
    DEFAULT_PERMISSIONS.administrator;
  const featureFlags = settings?.feature_flags ?? {};
  const hasPermission = (permission: string) => permissions?.[permission] !== false;
  const isEnabled = (module: string) => featureFlags?.[module] !== false;

  const visibleNavItems = useMemo(
    () =>
      navItems
        .filter((item) => isEnabled(item.module) && hasPermission(item.permission))
        .map((item) => ({
          key: item.key,
          icon: item.icon,
          label: <Link to={item.key}>{item.label}</Link>,
        })),
    [featureFlags, permissions],
  );

  const firstAllowedPath = visibleNavItems[0]?.key ?? "/status";
  const accessContext: AccessContextValue = {
    featureFlags,
    permissions,
    roleKey: selectedRole,
    isAdmin: selectedRole === "administrator",
    canEdit: hasPermission("conference_edit"),
    canManageTemplates: hasPermission("template_upload"),
    hasPermission,
  };

  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  const selectedKey = firstSegment ? `/${firstSegment}` : "/";

  return (
    <AccessProvider value={accessContext}>
      <Layout className="app-shell">
        <Sider
          className="sidebar"
          width={264}
        >
          <div className="brand-block">
            <div className="brand-lockup">
              <img className="ieee-logo" src={ieeeLogo} alt="IEEE" />
              <img className="itss-logo" src={itssLogo} alt="IEEE ITSS" />
            </div>
            <div className="brand-copy">
              <strong>Status Dashboard</strong>
              <span>IEEE ITSS Conferences</span>
            </div>
          </div>
          <Menu
            className="sidebar-main"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={visibleNavItems}
          />
          <div className="view-as-panel">
            <span>View as</span>
            <Select
              value={selectedRole}
              options={roles.map((role) => ({ label: role.label, value: role.key }))}
              onChange={(role) => {
                setSelectedRole(role);
                const nextPermissions =
                  settings?.role_permissions?.[role] ??
                  DEFAULT_PERMISSIONS[role] ??
                  DEFAULT_PERMISSIONS.administrator;
                const nextItem = navItems.find(
                  (item) =>
                    (settings?.feature_flags?.[item.module] ?? true) !== false &&
                    nextPermissions?.[item.permission] !== false,
                );
                const selectedItem = navItems.find((item) => item.key === selectedKey);
                if (
                  nextItem &&
                  selectedItem &&
                  nextPermissions?.[selectedItem.permission] === false
                ) {
                  navigate(nextItem.key);
                }
              }}
            />
          </div>
        </Sider>

        <Layout>
          <Header className="topbar">
            {hasPermission("conferences") && (
              <Input
                prefix={<SearchOutlined />}
                placeholder="Search by record number, abbreviation, title, city, or status"
                onPressEnter={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value) {
                    navigate(`/conferences?search=${encodeURIComponent(value)}`);
                  }
                }}
                allowClear
              />
            )}
          </Header>

          <Content className="content">
            <Page>
              <Routes>
                <Route path="/" element={<Guard permission="overview" fallback={firstAllowedPath}><Overview /></Guard>} />
                <Route path="/conferences" element={<Guard permission="conferences" fallback={firstAllowedPath}><Conferences /></Guard>} />
                <Route path="/conferences/:id" element={<Guard permission="conferences" fallback={firstAllowedPath}><ConferenceDetail /></Guard>} />
                <Route path="/issues" element={<Guard permission="issues" fallback={firstAllowedPath}><Issues /></Guard>} />
                <Route path="/imports" element={<Guard permission="imports" fallback={firstAllowedPath}><Imports /></Guard>} />
                <Route path="/settings" element={<Guard permission="settings" fallback={firstAllowedPath}><Settings /></Guard>} />
                <Route path="/status" element={<Guard permission="system_status" fallback={firstAllowedPath}><SystemStatus /></Guard>} />
                <Route path="/documents" element={<Guard permission="knowledge_base" fallback={firstAllowedPath}><Documents /></Guard>} />
                <Route path="/assistant" element={<Guard permission="assistant" fallback={firstAllowedPath}><Assistant /></Guard>} />
                <Route path="/templates" element={<Guard permission="templates" fallback={firstAllowedPath}><Templates /></Guard>} />
                <Route path="/email-drafts" element={<Guard permission="email_drafts" fallback={firstAllowedPath}><EmailDrafts /></Guard>} />
                <Route path="*" element={<Navigate to={firstAllowedPath} replace />} />
              </Routes>
            </Page>

            <footer className="site-footer">
              <div className="footer-brand">
                <img src={ieeeLogo} alt="IEEE" />
                <img src={itssLogo} alt="IEEE ITSS" />
              </div>
              <div>
                <strong>IEEE ITSS Conference Status Dashboard</strong>
                <p>
                  An application for conference records, imports,
                  scoring, documents, templates, and operational status.
                </p>
              </div>
              <div className="footer-links">
                {hasPermission("conferences") && <Link to="/conferences">Conferences</Link>}
                {hasPermission("imports") && <Link to="/imports">Imports</Link>}
                {hasPermission("settings") && <Link to="/settings">Settings</Link>}
                <Link to="/status">Status</Link>
              </div>
            </footer>
          </Content>
        </Layout>
      </Layout>
    </AccessProvider>
  );
}

function Guard({
  permission,
  fallback,
  children,
}: {
  permission: string;
  fallback: string;
  children: ReactNode;
}) {
  const { hasPermission } = useAccess();
  const allowed = hasPermission(permission);
  return allowed ? <>{children}</> : <Navigate to={fallback} replace />;
}
