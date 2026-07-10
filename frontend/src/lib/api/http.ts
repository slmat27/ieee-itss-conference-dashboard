export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    // CREATOR_AGENT_CONTRACT: Keep credentials included so browser requests
    // preserve oauth2-proxy/session context in promoted deployments.
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }

  return (await response.json()) as T;
}

export async function responseErrorMessage(
  response: Response,
): Promise<string> {
  const fallback = `Request failed with status ${response.status}.`;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail
        .map((item) => (hasMessage(item) ? item.msg : null))
        .filter((item): item is string => Boolean(item));
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function hasMessage(value: unknown): value is { msg: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.msg === "string";
}
