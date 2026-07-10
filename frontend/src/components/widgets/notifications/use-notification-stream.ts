import { useEffect, useState } from "react";

import type { AppNotification, NotificationLevel } from "@/types";

export type NotificationConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type NotificationStreamState = Readonly<{
  events: AppNotification[];
  error: string | null;
  status: NotificationConnectionStatus;
}>;

type NotificationStreamSnapshot = {
  events: AppNotification[];
  error: string | null;
  status: NotificationConnectionStatus;
};

type NotificationListener = (snapshot: NotificationStreamSnapshot) => void;

const streamState: NotificationStreamSnapshot = {
  events: [],
  error: null,
  status: "connecting",
};
const listeners = new Set<NotificationListener>();
let socket: WebSocket | undefined;
let reconnectTimer: number | undefined;
let activeEndpoint = "/api/notifications/ws";
let activeMaxEvents = 100;
let activeReconnectDelayMs = 3000;
let shouldReconnect = false;

export function useNotificationStream({
  endpoint = "/api/notifications/ws",
  maxEvents = 100,
  reconnectDelayMs = 3000,
}: {
  endpoint?: string;
  maxEvents?: number;
  reconnectDelayMs?: number;
} = {}): NotificationStreamState {
  // CREATOR_AGENT_CONTRACT: Websocket messages are run-change notifications.
  // Treat REST /api/runs as the source of truth and refresh it after events.
  const [snapshot, setSnapshot] =
    useState<NotificationStreamSnapshot>(streamState);

  useEffect(() => {
    const endpointChanged = activeEndpoint !== endpoint;
    activeEndpoint = endpoint;
    activeMaxEvents = Math.max(activeMaxEvents, maxEvents);
    activeReconnectDelayMs = reconnectDelayMs;
    listeners.add(setSnapshot);
    shouldReconnect = true;
    if (endpointChanged && socket) {
      socket.onclose = null;
      socket.close();
      socket = undefined;
    }
    ensureConnected();
    setSnapshot({
      ...streamState,
      events: streamState.events.slice(-maxEvents),
    });

    return () => {
      listeners.delete(setSnapshot);
      if (listeners.size === 0) {
        shouldReconnect = false;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = undefined;
        }
        if (socket) {
          socket.onclose = null;
          socket.close();
        }
        socket = undefined;
      }
    };
  }, [endpoint, maxEvents, reconnectDelayMs]);

  return {
    events: snapshot.events.slice(-maxEvents),
    error: snapshot.error,
    status: snapshot.status,
  };
}

function ensureConnected(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  connect();
}

function connect(): void {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  updateStream({ status: "connecting" });
  socket = new WebSocket(toWebSocketUrl(activeEndpoint));

  socket.onopen = () => {
    updateStream({ error: null, status: "open" });
  };

  socket.onmessage = (message) => {
    const event = parseNotification(message.data);
    if (!event) {
      return;
    }
    if (event.type === "connection.heartbeat") {
      updateStream({ status: "open" });
      return;
    }
    if (streamState.events.some((item) => item.id === event.id)) {
      return;
    }
    updateStream({
      events: [...streamState.events, event].slice(-activeMaxEvents),
    });
  };

  socket.onerror = () => {
    updateStream({
      error: "Notification stream is temporarily unavailable.",
      status: "error",
    });
  };

  socket.onclose = () => {
    updateStream({ status: "closed" });
    if (shouldReconnect && listeners.size > 0) {
      reconnectTimer = window.setTimeout(connect, activeReconnectDelayMs);
    }
  };
}

function updateStream(next: Partial<NotificationStreamSnapshot>): void {
  Object.assign(streamState, next);
  const snapshot = { ...streamState, events: [...streamState.events] };
  listeners.forEach((listener) => listener(snapshot));
}

function toWebSocketUrl(endpoint: string): string {
  const url = new URL(endpoint, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseNotification(data: unknown): AppNotification | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<AppNotification>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.created_at !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      type: parsed.type,
      level: toNotificationLevel(parsed.level),
      title: parsed.title,
      message: parsed.message,
      created_at: parsed.created_at,
      payload: isRecord(parsed.payload) ? parsed.payload : {},
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNotificationLevel(value: unknown): NotificationLevel {
  if (
    value === "info" ||
    value === "success" ||
    value === "warning" ||
    value === "error"
  ) {
    return value;
  }
  return "info";
}
