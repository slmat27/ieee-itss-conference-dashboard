import { Layout } from "antd";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AppShellProps = {
  header: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AppShell({
  header,
  children,
  sidebar,
  className,
  style,
}: AppShellProps) {
  return (
    <Layout className={cn("ui-shell", className)} style={style}>
      {header}
      <div
        className={cn("ui-shell__frame", sidebar && "ui-shell__frame--with-sidebar")}
      >
        {sidebar ? <aside className="ui-shell__sidebar">{sidebar}</aside> : null}
        <Layout.Content className="ui-shell__body">{children}</Layout.Content>
      </div>
    </Layout>
  );
}
