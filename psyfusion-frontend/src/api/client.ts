import { getAccessToken, setAccessToken } from './tokenStore';

// Vite exposes import.meta.env.VITE_* at build time (see src/vite-env.d.ts
// for the ImportMetaEnv augmentation). Falls back to the backend's default
// dev port (see psyfusion-backend/.env.example PORT=5000).
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown; // plain object -> JSON; FormData -> sent as-is
  skipAuthRetry?: boolean; // true for the refresh call itself, to avoid recursion
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Calls POST /api/auth/refresh using the httpOnly cookie the browser already
 * holds. Shared/deduplicated across concurrent 401s so a burst of requests
 * doesn't trigger a burst of refresh calls.
 */
async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = await res.json();
        setAccessToken(data.accessToken);
        return true;
      } catch {
        setAccessToken(null);
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuthRetry = false } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include', // send/receive the httpOnly refresh cookie
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });

  let res = await doFetch();

  // A single transparent retry after a silent refresh - the UI never has to
  // know a token expired mid-session.
  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retryToken = getAccessToken();
      if (retryToken) headers.Authorization = `Bearer ${retryToken}`;
      res = await doFetch();
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (payload && (payload as { message?: string; error?: string }).message) ||
      (payload && (payload as { error?: string }).error) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}

export { API_BASE };
