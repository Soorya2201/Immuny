import type { Page } from '../types';

interface BottomNavProps {
  current: Page;
  onNavigate: (page: Page) => void;
}

const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const InsightsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);

const MicIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const CommunityIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const ProfileIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const isHomeActive = (page: Page) => ['home', 'symptom-logger', 'exposure-testing'].includes(page);

export default function BottomNav({ current, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <button
        className={isHomeActive(current) ? 'active' : ''}
        onClick={() => onNavigate('home')}
      >
        <span className="nav-icon"><HomeIcon /></span>
        <small>Home</small>
      </button>

      <button
        className={current === 'insights' ? 'active' : ''}
        onClick={() => onNavigate('insights')}
      >
        <span className="nav-icon"><InsightsIcon /></span>
        <small>Insights</small>
      </button>

      <button
        className={current === 'voice' ? 'active' : ''}
        onClick={() => onNavigate('voice')}
      >
        <span className="voice-fab"><MicIcon /></span>
      </button>

      <button
        className={current === 'community' ? 'active' : ''}
        onClick={() => onNavigate('community')}
      >
        <span className="nav-icon"><CommunityIcon /></span>
        <small>Community</small>
      </button>

      <button
        className={current === 'profile' ? 'active' : ''}
        onClick={() => onNavigate('profile')}
      >
        <span className="nav-icon"><ProfileIcon /></span>
        <small>Profile</small>
      </button>
    </nav>
  );
}
