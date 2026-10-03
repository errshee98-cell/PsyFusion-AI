import OrbCompanion from '../components/OrbCompanion';
import SoftCard from '../components/SoftCard';
import MoodPicker from '../components/MoodPicker';
import type { Tab } from '../App';
import './Home.css';

interface HomeProps {
  onNavigate: (tab: Tab) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="home">
      <header className="home__header">
        <div>
          <p className="home__eyebrow">{greeting}</p>
          <h1 className="home__name">Welcome back</h1>
        </div>
        <OrbCompanion size={56} mood="calm" />
      </header>

      <SoftCard radius="lg" tint="violet" className="home__checkin">
        <p className="home__checkin-label">How are you feeling right now?</p>
        <MoodPicker />
      </SoftCard>

      <section className="home__grid">
        <SoftCard
          radius="md"
          tint="surface"
          interactive
          className="home__tile"
          onClick={() => onNavigate('screening')}
        >
          <span className="home__tile-emoji" aria-hidden>
            💬
          </span>
          <p className="home__tile-title">Check in</p>
          <p className="home__tile-sub">A short conversation, at your pace</p>
        </SoftCard>

        <SoftCard
          radius="md"
          tint="surface"
          interactive
          className="home__tile"
          onClick={() => onNavigate('community')}
        >
          <span className="home__tile-emoji" aria-hidden>
            🌙
          </span>
          <p className="home__tile-title">Community</p>
          <p className="home__tile-sub">Share anonymously, no judgment</p>
        </SoftCard>
      </section>

      <SoftCard radius="md" tint="sage" className="home__streak">
        <div>
          <p className="home__streak-title">3-day check-in streak</p>
          <p className="home__streak-sub">You've checked in every day this week</p>
        </div>
        <span className="home__streak-badge">🌱</span>
      </SoftCard>
    </div>
  );
}
