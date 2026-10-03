import './SoftCard.css';
import type { HTMLAttributes } from 'react';

interface SoftCardProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'sm' | 'md' | 'lg' | 'xl';
  tint?: 'surface' | 'violet' | 'coral' | 'sage' | 'amber';
  interactive?: boolean;
}

/**
 * The base surface component. Radius and tint are props (not baked into
 * one ".card" class) specifically so different screens don't end up with
 * uniform rounded-rectangle sameness - a hero card and a list row should
 * look like they belong to different levels of hierarchy.
 */
export default function SoftCard({
  radius = 'md',
  tint = 'surface',
  interactive = false,
  className = '',
  children,
  ...rest
}: SoftCardProps) {
  return (
    <div
      className={`soft-card soft-card--${radius} soft-card--${tint} ${
        interactive ? 'soft-card--interactive' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
