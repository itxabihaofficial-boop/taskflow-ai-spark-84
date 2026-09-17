// Thin fetch wrapper for the TaskFlow Express API.
export const API_URL = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

const TOKEN_KEY = "taskflow.token";

export class ApiError extends Error {
  status: number;
  details: Record<string, string> | undefined;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// "Remember me" keeps the token in localStorage; otherwise it lives for the tab session only.
// Storage can be unavailable (private mode, SSR), so every access is guarded.
function storages(): Storage[] {
  if (typeof window === "undefined") return [];
  const found: Storage[] = [];
  try {
    found.push(window.localStorage);
  } catch {
    /* unavailable */
  }
  try {
    found.push(window.sessionStorage);
  } catch {
    /* unavailable */
  }
  return found;
}

export function getToken(): string | null {
  for (const store of storages()) {
    try {
      const token = store.getItem(TOKEN_KEY);
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function setToken(token: string, remember: boolean) {
  clearToken();
  const [local, session] = storages();
  try {
    (remember ? local : session)?.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  for (const store of storages()) {
    try {
      store.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

// Called when an authenticated request comes back 401 (expired or revoked session).
export function onUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

// The API labels due dates ("Today", "Tomorrow") in the viewer's time zone.
export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = unknown>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "X-Timezone": timeZone() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Can’t reach the TaskFlow server. Check that the API is running.");
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; details?: Record<string, string> };
    if (res.status === 401 && token) {
      clearToken();
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw new ApiError(res.status, payload.error ?? `Request failed (${res.status})`, payload.details);
  }
  return data as T;
}

// Human-readable message for any thrown value; prefers the first field-level detail.
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const first = err.details && Object.values(err.details)[0];
    return first ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
