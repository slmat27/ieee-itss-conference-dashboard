// API helper - simple fetch wrapper for the ITSS Conference Dashboard

const API_BASE = "/api";

export async function api<T = any>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      if (typeof payload.detail === "string" && payload.detail.trim()) {
        detail = payload.detail;
      }
    } catch {
      const fallback = text.trim() || response.statusText.trim();
      if (fallback) detail = fallback;
    }
    throw new Error(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function apiUrl(endpoint: string): string {
  return `${API_BASE}${endpoint}`;
}
