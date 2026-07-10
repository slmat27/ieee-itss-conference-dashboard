export type NotificationLevel = "info" | "success" | "warning" | "error";

export type AppNotification = Readonly<{
  id: string;
  type: string;
  level: NotificationLevel;
  title: string;
  message: string;
  created_at: string;
  payload: Record<string, unknown>;
}>;
