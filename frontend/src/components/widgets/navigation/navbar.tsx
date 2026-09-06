import { BellOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Dropdown, Layout, Popover, Typography } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import itssLogoUrl from "@/assets/itss.png";
import { UserBadge } from "@/components/ui";
import { JobEventsList } from "@/components/widgets/jobs";
import { fetchCurrentUser } from "@/lib/api/current-user";
import { cn } from "@/lib/utils";
import { DEV_FALLBACK_USER, type UserProfile } from "@/types";

export type NavbarOptionKey = "settings" | "about";

export type NavbarProps = {
  title?: string;
  onNotifications?: () => void;
  onOptions?: (key: NavbarOptionKey) => void;
  className?: string;
  style?: CSSProperties;
};

function IconAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      type="text"
      shape="circle"
      icon={icon}
      aria-label={label}
      onClick={onClick}
      className="app-navbar__icon-button"
    />
  );
}

export function Navbar({
  title = "IEEE ITSS Conference Dashboard",
  onNotifications,
  onOptions,
  className,
  style,
}: NavbarProps) {
  const [user, setUser] = useState<UserProfile>(() =>
    import.meta.env.DEV
      ? DEV_FALLBACK_USER
      : {
          username: "User",
          email: "user@example.local",
        },
  );

  useEffect(() => {
    let active = true;

    fetchCurrentUser()
      .then((resolvedUser) => {
        if (active) {
          setUser(resolvedUser);
        }
      })
      .catch(() => {
        if (active) {
          if (import.meta.env.DEV) {
            setUser(DEV_FALLBACK_USER);
          }
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const optionItems: MenuProps["items"] = [
    { key: "settings", label: "Settings" },
    { key: "about", label: "About this POC" },
  ];

  return (
    <Layout.Header className={cn("app-navbar", className)} style={style}>
      <div className="app-navbar__inner">
        <div className="app-navbar__brand" aria-label={title}>
          <Typography.Title level={3} className="app-navbar__title">
            {title}
          </Typography.Title>
        </div>

        <div className="app-navbar__cluster">
          <Popover
            content={<JobEventsList limit={8} />}
            placement="bottomRight"
            title="Run Events"
            trigger="click"
            overlayClassName="app-navbar__job-events"
          >
            <span>
              <IconAction
                icon={<BellOutlined />}
                label="Run events"
                onClick={onNotifications}
              />
            </span>
          </Popover>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: optionItems,
              onClick: ({ key }) => {
                if (key === "settings" || key === "about") {
                  onOptions?.(key);
                }
              },
            }}
            placement="bottomRight"
          >
            <span>
              <IconAction icon={<SettingOutlined />} label="Options" />
            </span>
          </Dropdown>
          <UserBadge user={user} />
          <img className="app-navbar__logo" src={itssLogoUrl} alt="IEEE ITSS" />
        </div>
      </div>
    </Layout.Header>
  );
}
