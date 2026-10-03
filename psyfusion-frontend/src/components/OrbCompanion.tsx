import './OrbCompanion.css';

type OrbMood = 'calm' | 'listening' | 'warm' | 'grounded';

interface OrbCompanionProps {
  size?: number;
  mood?: OrbMood;
  label?: string;
}

/**
 * The "companion" presence — an abstract breathing gradient orb rather than
 * a mascot character. Reads as a calm, living presence without needing an
 * illustrated character (and without resembling any existing app's mascot).
 * The 3D quality comes from layered radial-gradient shading (a sphere
 * highlight + core + rim) combined with a slow organic border-radius morph,
 * not from a flat circle.
 */
export default function OrbCompanion({ size = 160, mood = 'calm', label }: OrbCompanionProps) {
  return (
    <div className="orb-wrap" style={{ width: size, height: size }}>
      <div className={`orb orb--${mood}`} style={{ width: size, height: size }}>
        <div className="orb__highlight" />
      </div>
      <div className="orb__ring" style={{ width: size * 1.35, height: size * 1.35 }} />
      {label && <span className="orb__label">{label}</span>}
    </div>
  );
}
