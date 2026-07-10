import { type CSSProperties, type ReactNode } from "react";
import {
  AppstoreOutlined,
  ContainerOutlined,
  DotChartOutlined,
  FileTextOutlined,
  HomeOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

import { cn } from "@/lib/utils";

export type SidebarItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  children?: SidebarItem[];
};

export type SidebarProps = {
  style?: CSSProperties;
  className?: string;
  items?: SidebarItem[];
};

const defaultItems: SidebarItem[] = [
  // CREATOR_AGENT_OPTIONAL: Example sidebar structure for multi-view POCs.
  // Replace these items or leave Sidebar unused for simple single-page drafts.
  { key: "overview", label: "Overview", icon: <HomeOutlined />, active: true },
  {
    key: "workspace",
    label: "Workspace",
    icon: <ContainerOutlined />,
    children: [
      { key: "pocs", label: "POCs", icon: <AppstoreOutlined /> },
      { key: "agents", label: "Agents", icon: <ThunderboltOutlined /> },
      { key: "reports", label: "Reports", icon: <DotChartOutlined /> },
    ],
  },
  { key: "documents", label: "Documents", icon: <FileTextOutlined /> },
];

export function Sidebar({
  style,
  className,
  items = defaultItems,
}: SidebarProps) {
  const renderItem = (item: SidebarItem, depth = 0) => {
    const isSelected = Boolean(item.active);

    if (item.children?.length) {
      return (
        <section key={item.key} className="app-sidebar__group">
          <button
            type="button"
            className={cn(
              "app-sidebar__row app-sidebar__group-title",
              isSelected && "app-sidebar__row--selected",
            )}
          >
            {item.icon ? (
              <span className="app-sidebar__icon">{item.icon}</span>
            ) : null}
            <span className="app-sidebar__label">{item.label}</span>
          </button>
          <div className="app-sidebar__group-items">
            {item.children.map((child) => renderItem(child, depth + 1))}
          </div>
        </section>
      );
    }

    return (
      <button
        key={item.key}
        type="button"
        className={cn(
          "app-sidebar__row",
          depth > 0 && "app-sidebar__row--nested",
          isSelected && "app-sidebar__row--selected",
        )}
      >
        {item.icon ? (
          <span className="app-sidebar__icon">{item.icon}</span>
        ) : null}
        <span className="app-sidebar__label">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className={cn("app-sidebar", className)} style={style}>
      <div className="app-sidebar__panel">
        <nav className="app-sidebar__menu" aria-label="Primary navigation">
          {items.map((item) => renderItem(item))}
        </nav>
      </div>
    </aside>
  );
}
