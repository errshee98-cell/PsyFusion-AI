import { useState } from 'react';
import BottomNav from './components/BottomNav';
import OrbCompanion from './components/OrbCompanion';
import Onboarding from './pages/Onboarding';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Screening from './pages/Screening';
import Community from './pages/Community';
import { AuthProvider, useAuth } from './context/AuthContext';

export type Tab = 'home' | 'screening' | 'community' | 'profile';

function AppShell() {
  const { status, user, logout } = useAuth();
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  if (status === 'checking') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <OrbCompanion size={72} mood="calm" />
        </div>
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ paddingBottom: 0 }}>
          <Auth />
        </div>
      </div>
    );
  }

  if (!hasOnboarded) {
    return (
      <div className="app-shell">
        <div className="app-content" style={{ paddingBottom: 0 }}>
          <Onboarding onFinish={() => setHasOnboarded(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        {tab === 'home' && <Home onNavigate={setTab} />}
        {tab === 'screening' && <Screening />}
        {tab === 'community' && <Community />}
        {tab === 'profile' && (
          <div style={{ padding: 24 }}>
            <h2>Profile</h2>
            <p style={{ color: 'var(--color-ink-muted)', marginTop: 8 }}>
              Signed in as {user?.anonymousHandle} ({user?.email}).
            </p>
            <button
              onClick={() => logout()}
              style={{
                marginTop: 16,
                background: 'none',
                border: 'none',
                color: 'var(--color-violet)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
