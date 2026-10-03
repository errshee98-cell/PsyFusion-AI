// Access tokens live in memory only - never localStorage/sessionStorage,
// so a stray XSS payload can't read a long-lived credential off disk. The
// refresh token is an httpOnly cookie the browser handles automatically;
// losing the in-memory access token on a hard refresh is expected, and
// AuthContext's bootstrap silently re-derives one from that cookie.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
