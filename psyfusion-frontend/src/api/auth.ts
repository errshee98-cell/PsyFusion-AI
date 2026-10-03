import { apiFetch } from './client';
import { setAccessToken } from './tokenStore';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  anonymousHandle: string;
  role: 'user' | 'clinician' | 'admin';
  isEmailVerified: boolean;
  createdAt: string;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuthRetry: true,
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function register(email: string, password: string, displayName?: string): Promise<string> {
  const data = await apiFetch<{ message: string }>('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
    skipAuthRetry: true,
  });
  return data.message;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', skipAuthRetry: true });
  } finally {
    setAccessToken(null);
  }
}

/**
 * Attempts to derive a fresh access token from the httpOnly refresh cookie.
 * Used on app load so a returning user with a valid session doesn't have to
 * log in again - fails silently (returns false) if there's no valid cookie,
 * which is the normal case for a first-time visitor.
 */
export async function silentRefresh(): Promise<boolean> {
  try {
    const data = await apiFetch<{ accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}
