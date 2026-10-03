import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetch } from '../api/client';
import { login as apiLogin, logout as apiLogout, silentRefresh } from '../api/auth';
import type { AuthUser } from '../api/auth';

interface AuthContextValue {
  user: AuthUser | null;
  status: 'checking' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');

  const fetchMe = useCallback(async () => {
    const data = await apiFetch<{ user: AuthUser }>('/api/auth/me');
    setUser(data.user);
  }, []);

  // On first load, try to turn the httpOnly refresh cookie (if any) into a
  // fresh access token, so a returning user isn't dropped back to the
  // login screen every time they reopen the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refreshed = await silentRefresh();
      if (cancelled) return;
      if (!refreshed) {
        setStatus('anonymous');
        return;
      }
      try {
        await fetchMe();
        if (!cancelled) setStatus('authenticated');
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const loggedInUser = await apiLogin(email, password);
      setUser(loggedInUser);
      setStatus('authenticated');
    },
    []
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refreshUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
