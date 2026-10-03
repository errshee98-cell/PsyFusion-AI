import { useState } from 'react';
import './MoodPicker.css';

const MOODS = [
  { id: 'low', label: 'Low', color: 'var(--color-ink-faint)' },
  { id: 'uneasy', label: 'Uneasy', color: 'var(--color-amber)' },
  { id: 'okay', label: 'Okay', color: 'var(--color-violet)' },
  { id: 'good', label: 'Good', color: 'var(--color-sage)' },
  { id: 'great', label: 'Great', color: 'var(--color-coral)' },
] as const;

interface MoodPickerProps {
  onSelect?: (moodId: string) => void;
}

export default function MoodPicker({ onSelect }: MoodPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelected(id);
    onSelect?.(id);
  };

  return (
    <div className="mood-picker" role="radiogroup" aria-label="How are you feeling right now">
      {MOODS.map((mood) => (
        <button
          key={mood.id}
          role="radio"
          aria-checked={selected === mood.id}
          className={`mood-picker__dot ${selected === mood.id ? 'mood-picker__dot--active' : ''}`}
          style={{ ['--dot-color' as string]: mood.color }}
          onClick={() => handleSelect(mood.id)}
        >
          <span className="mood-picker__fill" />
          <span className="mood-picker__label">{mood.label}</span>
        </button>
      ))}
    </div>
  );
}
