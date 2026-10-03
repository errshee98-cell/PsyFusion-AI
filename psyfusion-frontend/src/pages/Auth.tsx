import { useState } from 'react';
import type { FormEvent } from 'react';
import OrbCompanion from '../components/OrbCompanion';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { register as apiRegister } from '../api/auth';
import { ApiError } from '../api/client';
import './Auth.css';

type Mode = 'login' | 'register';

export default function Auth() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const message = await apiRegister(email, password);
        setNotice(message);
        setMode('login');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__hero">
        <OrbCompanion size={120} mood="calm" />
      </div>

      <div className="auth__body">
        <h1 className="auth__title">{mode === 'login' ? 'Welcome back' : 'Create your space'}</h1>
        <p className="auth__subtitle">
          {mode === 'login'
            ? 'Sign in to continue your check-ins privately.'
            : 'A strong password keeps your check-ins and posts safe.'}
        </p>

        <form className="auth__form" onSubmit={submit}>
          <label className="auth__label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="auth__input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="auth__label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="auth__input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'register' ? 12 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && (
            <p className="auth__hint">12+ characters, with an uppercase letter, a number, and a symbol.</p>
          )}

          {error && <p className="auth__error">{error}</p>}
          {notice && <p className="auth__notice">{notice}</p>}

          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <button
          type="button"
          className="auth__switch"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
