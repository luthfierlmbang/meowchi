import { useEffect, useState, type ReactNode } from 'react';
import { GameIcon, type IconName } from '../components/GameUI';

function statusTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

export function MeowchiStatusBar({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [time, setTime] = useState(() => statusTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(statusTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="meow-status" data-tone={tone} aria-hidden="true">
      <span>{time}</span>
    </div>
  );
}

export function MeowchiHomeIndicator({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <div className="meow-home-indicator" data-tone={tone} aria-hidden="true">
      <span />
    </div>
  );
}

export function MeowchiPatternBackground({
  children,
  showStatusBar = true,
}: {
  children: ReactNode;
  showStatusBar?: boolean;
}) {
  return (
    <main className="meow-screen meow-brand-bg">
      {showStatusBar && <MeowchiStatusBar tone="light" />}
      <div className="meow-brand-marks" aria-hidden="true" />
      {children}
      <MeowchiHomeIndicator tone="light" />
    </main>
  );
}

export function MeowchiCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`meow-card ${className}`}>{children}</section>;
}

export function MeowchiButton({
  children,
  onClick,
  tone = 'brand',
  type = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'brand' | 'success' | 'neutral' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button className="meow-button" data-tone={tone} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function MeowchiField({
  label,
  placeholder,
  type = 'text',
  icon,
}: {
  label: string;
  placeholder: string;
  type?: string;
  icon?: IconName;
}) {
  return (
    <label className="meow-field">
      <span>{label}</span>
      <div>
        <input type={type} placeholder={placeholder} />
        {icon && <GameIcon name={icon} />}
      </div>
    </label>
  );
}

export function MeowchiTopNav({
  title,
  back,
  onBack,
  menu,
  onMenu,
  tone = 'dark',
}: {
  title?: string;
  back?: boolean;
  onBack?: () => void;
  menu?: boolean;
  onMenu?: () => void;
  tone?: 'dark' | 'light';
}) {
  return (
    <header className="meow-top-nav" data-tone={tone}>
      <MeowchiStatusBar tone={tone} />
      <div className="meow-nav-row">
        {back && (
          <button className="meow-nav-action is-left" type="button" onClick={onBack} aria-label="Kembali">
            <GameIcon name="chevron-left" />
          </button>
        )}
        {title && <strong>{title}</strong>}
        {menu && (
          <button className="meow-nav-action is-right" type="button" onClick={onMenu} aria-label="Buka menu">
            <GameIcon name="menu" />
          </button>
        )}
      </div>
    </header>
  );
}
