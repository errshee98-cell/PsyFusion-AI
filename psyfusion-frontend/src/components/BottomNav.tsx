import './BottomNav.css';
import type { Tab } from '../App';

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const ITEMS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <path d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-9" />
    ),
  },
  {
    id: 'screening',
    label: 'Check in',
    icon: (
      <path d="M8 4h8a2 2 0 0 1 2 2v13l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Zm0 4h8M8 11h8M8 14h5" />
    ),
  },
  {
    id: 'community',
    label: 'Community',
    icon: (
      <path d="M7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 2.5-5 5-5s5 2 5 5M12 19c0-3 2.5-5 5-5s5 2 5 5" />
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    ),
  },
];

export default function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`bottom-nav__item ${active === item.id ? 'bottom-nav__item--active' : ''}`}
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? 'page' : undefined}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.icon}
          </svg>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
