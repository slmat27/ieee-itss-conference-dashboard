import { Empty } from "antd";

import { Badge, Card } from "@/components/ui";
import type { AppNotification, NotificationLevel } from "@/types";

import "./notification-log-card.css";
import {
  useNotificationStream,
  type NotificationConnectionStatus,
} from "./use-notification-stream";

export type NotificationLogCardProps = Readonly<{
  endpoint?: string;
  maxEvents?: number;
}>;

export function NotificationLogCard({
  endpoint,
  maxEvents,
}: NotificationLogCardProps) {
  // CREATOR_AGENT_OPTIONAL: Reuse this card for live workflow events only when
  // the generated POC implements the matching backend stream.
  const { events, error, status } = useNotificationStream({
    endpoint,
    maxEvents,
  });

  return (
    <Card title={<NotificationLogTitle status={status} />}>
      {events.length > 0 ? (
        <div className="notification-log__list" role="log" aria-live="polite">
          {events.map((event) => (
            <NotificationLogItem event={event} key={event.id} />
          ))}
        </div>
      ) : (
        <Empty
          description="No backend notifications yet"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
      {error ? <p className="notification-log__error">{error}</p> : null}
    </Card>
  );
}

function NotificationLogTitle({
  status,
}: {
  status: NotificationConnectionStatus;
}) {
  return (
    <div className="notification-log__title">
      <span>Backend Notifications</span>
      <Badge className="notification-log__status" tone={statusTone(status)}>
        {statusLabel(status)}
      </Badge>
    </div>
  );
}

function NotificationLogItem({ event }: { event: AppNotification }) {
  return (
    <article className="notification-log__item">
      <time className="notification-log__time" dateTime={event.created_at}>
        {formatEventTime(event.created_at)}
      </time>
      <div className="notification-log__content">
        <div className="notification-log__heading">
          <span className="notification-log__event-title">{event.title}</span>
          <Badge tone={levelTone(event.level)}>{event.level}</Badge>
          <span className="notification-log__type">{event.type}</span>
        </div>
        <p className="notification-log__message">{event.message}</p>
      </div>
    </article>
  );
}

function statusLabel(status: NotificationConnectionStatus): string {
  if (status === "open") {
    return "Connected";
  }
  if (status === "connecting") {
    return "Connecting";
  }
  if (status === "error") {
    return "Issue";
  }
  return "Reconnecting";
}

function statusTone(
  status: NotificationConnectionStatus,
): "default" | "success" | "info" | "warning" | "danger" {
  if (status === "open") {
    return "success";
  }
  if (status === "error") {
    return "warning";
  }
  return "info";
}

function levelTone(
  level: NotificationLevel,
): "default" | "success" | "info" | "warning" | "danger" {
  if (level === "success") {
    return "success";
  }
  if (level === "warning") {
    return "warning";
  }
  if (level === "error") {
    return "danger";
  }
  if (level === "info") {
    return "info";
  }
  return "default";
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export type {
  NotificationConnectionStatus,
  NotificationStreamState,
} from "./use-notification-stream";
