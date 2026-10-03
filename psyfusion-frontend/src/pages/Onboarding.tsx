import OrbCompanion from '../components/OrbCompanion';
import Button from '../components/Button';
import './Onboarding.css';

interface OnboardingProps {
  onFinish: () => void;
}

export default function Onboarding({ onFinish }: OnboardingProps) {
  return (
    <div className="onboarding">
      <div className="onboarding__hero">
        <OrbCompanion size={180} mood="calm" />
      </div>

      <div className="onboarding__body">
        <h1 className="onboarding__title">A quieter way to check in with yourself</h1>
        <p className="onboarding__subtitle">
          PsyFusion listens through what you write, say, or show up like today — and helps you
          notice patterns before they become harder to carry.
        </p>

        <div className="onboarding__points">
          <div className="onboarding__point">
            <span className="onboarding__point-dot" style={{ background: 'var(--color-violet)' }} />
            <span>Private, anonymous by default</span>
          </div>
          <div className="onboarding__point">
            <span className="onboarding__point-dot" style={{ background: 'var(--color-coral)' }} />
            <span>A real person reviews anything urgent</span>
          </div>
          <div className="onboarding__point">
            <span className="onboarding__point-dot" style={{ background: 'var(--color-sage)' }} />
            <span>You're always in control of what you share</span>
          </div>
        </div>

        <Button fullWidth onClick={onFinish}>
          Begin
        </Button>
        <p className="onboarding__disclaimer">
          PsyFusion supports your wellbeing but isn't a substitute for professional care.
        </p>
      </div>
    </div>
  );
}
