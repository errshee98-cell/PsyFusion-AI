import { useState, useRef, useEffect } from 'react';
import OrbCompanion from '../components/OrbCompanion';
import { submitScreening } from '../api/screening';
import { ApiError } from '../api/client';
import './Screening.css';

interface Message {
  id: string;
  from: 'orb' | 'user';
  text: string;
  tone?: 'default' | 'crisis' | 'review';
}

const OPENING: Message[] = [
  { id: 'm1', from: 'orb', text: "Hi. I'm glad you're here." },
  { id: 'm2', from: 'orb', text: 'How has your sleep been this past week?' },
];

export default function Screening() {
  const [messages, setMessages] = useState<Message[]>(OPENING);
  const [draft, setDraft] = useState('');
  const [orbMood, setOrbMood] = useState<'calm' | 'listening'>('calm');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: 'user', text }]);
    setDraft('');
    setOrbMood('listening');
    setSending(true);

    try {
      const response = await submitScreening(text);

      if (response.result) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), from: 'orb', text: response.result!.explanation },
        ]);
      }

      if (response.resources) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            from: 'orb',
            text: response.resources!.message,
            tone: response.crisisFlag ? 'crisis' : 'review',
          },
          ...response.resources!.resources.map((r) => ({
            id: crypto.randomUUID(),
            from: 'orb' as const,
            text: `${r.name}: ${r.contact}`,
            tone: 'crisis' as const,
          })),
        ]);
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "I couldn't reach the screening service just now. Please try again in a moment.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), from: 'orb', text: message, tone: 'review' }]);
    } finally {
      setOrbMood('calm');
      setSending(false);
    }
  };

  return (
    <div className="screening">
      <header className="screening__header">
        <OrbCompanion size={44} mood={orbMood} />
        <div>
          <p className="screening__header-title">Daily check-in</p>
          <p className="screening__header-sub">Private · not shared with the community</p>
        </div>
      </header>

      <div className="screening__thread">
        {messages.map((m) => (
          <div key={m.id} className={`screening__bubble-row screening__bubble-row--${m.from}`}>
            <div
              className={`screening__bubble screening__bubble--${m.from}${
                m.tone && m.tone !== 'default' ? ` screening__bubble--${m.tone}` : ''
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="screening__bubble-row screening__bubble-row--orb">
            <div className="screening__bubble screening__bubble--orb screening__bubble--pending">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="screening__composer">
        <input
          className="screening__input"
          placeholder="Type your reply…"
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="screening__send" onClick={send} disabled={sending} aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12h16M14 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
