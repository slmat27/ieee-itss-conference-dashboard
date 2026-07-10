import { Avatar, Popover, Typography } from "antd";
import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

export type UserBadgeProps = {
  user: UserProfile;
  className?: string;
  style?: CSSProperties;
};

function getInitials(username: string) {
  const parts = username
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "U";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserBadge({ user, className, style }: UserBadgeProps) {
  const initials = getInitials(user.username);

  const content = (
    <div
      className="ui-user-badge__popover"
      role="group"
      aria-label="User profile"
    >
      <Typography.Text className="ui-user-badge__popover-name">
        {user.username}
      </Typography.Text>
      <Typography.Text className="ui-user-badge__popover-email">
        {user.email}
      </Typography.Text>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
    >
      <button
        type="button"
        className={cn("ui-user-badge", className)}
        style={style}
        title={user.email}
        aria-label={`Show profile for ${user.username}`}
      >
        <Avatar className="ui-user-badge__avatar">{initials}</Avatar>
      </button>
    </Popover>
  );
}
