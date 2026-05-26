import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { playClick } from '../engine/sound';

export type Tone = 'primary' | 'secondary' | 'disabled' | 'positive' | 'negative';
export type ButtonState = 'default' | 'hover' | 'pressed' | 'inactive';
export type IconName =
  | 'heart'
  | 'diamond'
  | 'gold'
  | 'ruby'
  | 'emerald'
  | 'topaz'
  | 'ring'
  | 'swords'
  | 'trophy'
  | 'bell'
  | 'carrot'
  | 'rabbit'
  | 'key'
  | 'crown'
  | 'ticket'
  | 'check'
  | 'close'
  | 'add'
  | 'subtract'
  | 'search'
  | 'star'
  | 'edit'
  | 'menu'
  | 'play'
  | 'pause'
  | 'stop'
  | 'settings'
  | 'trash'
  | 'link'
  | 'stats'
  | 'replay'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down';

const iconPath: Partial<Record<IconName, ReactNode>> = {
  heart: <path d="M8 14s-6-3.6-6-8.1C2 3.5 3.6 2 5.5 2 6.6 2 7.5 2.6 8 3.4 8.5 2.6 9.4 2 10.5 2 12.4 2 14 3.5 14 5.9 14 10.4 8 14 8 14Z" />,
  diamond: <path d="M8 1.5 14 6.3 8 14.5 2 6.3 8 1.5Z" />,
  gold: <path d="M3 4h10l1.5 8H1.5L3 4Zm1-2h8v2H4V2Z" />,
  ruby: <path d="M8 1.5 13.5 5 11 14H5L2.5 5 8 1.5Z" />,
  emerald: <path d="M3 3h10v10H3V3Zm2 2v6h6V5H5Z" />,
  topaz: <path d="M8 1.5 14 8l-6 6.5L2 8l6-6.5Z" />,
  ring: <path d="M5.5 5 8 1.5 10.5 5M3.5 9a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Z" fill="none" stroke="currentColor" strokeWidth="2" />,
  swords: <path d="m3 13 4-4m6 4L3 3m10 0L9 7m-1.5 1.5 2 2M2 14l2-1-1-1-1 2Zm12 0-1-2-1 1 2 1Z" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  trophy: <path d="M4 2h8v3.5C12 8 10.5 9.6 8 10 5.5 9.6 4 8 4 5.5V2Zm2 11h4m-5 2h6M2 4h2m8 0h2" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  bell: <path d="M4 11h8l-1-2V6a3 3 0 0 0-6 0v3l-1 2Zm2.5 1.5h3" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  carrot: <path d="M5 5c3 1 5 3 6 6l-5 2C5 10 4 8 5 5Zm4-1 1-2m0 3 3-1M8 4l-1-2" />,
  rabbit: <path d="M4.5 8C3 4 3.3 1.8 4.8 1.6 6 1.4 6.8 4.3 7.2 6h1.6c.4-1.7 1.2-4.6 2.4-4.4 1.5.2 1.8 2.4.3 6.4A4.4 4.4 0 0 1 8 14a4.4 4.4 0 0 1-3.5-6Zm1.7 2h.1m3.5 0h.1" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  key: <path d="M6.5 9.5a3 3 0 1 1 2-2L14 13l-1.5 1.5-1.2-1.2-1 1-1.4-1.4 1-1-3.4-3.4Z" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  crown: <path d="M2.5 12.5h11L12.5 5 10 8 8 3.5 6 8 3.5 5l-1 7.5Z" />,
  ticket: <path d="M2 5a2 2 0 0 0 0 4v3h12V9a2 2 0 0 0 0-4V2H2v3Z" />,
  check: <path d="m2.5 8.4 3.2 3.1 7.8-7.8" fill="none" stroke="currentColor" strokeWidth="2" />,
  close: <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" />,
  add: <path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" strokeWidth="2" />,
  subtract: <path d="M2 8h12" fill="none" stroke="currentColor" strokeWidth="2" />,
  search: <path d="M7 12a5 5 0 1 1 3.5-1.5L14 14" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  star: <path d="m8 1.8 1.8 3.8 4.2.6-3 2.9.7 4.1L8 11.2l-3.7 2 .7-4.1-3-2.9 4.2-.6L8 1.8Z" />,
  edit: <path d="M3 11.5V14h2.5L13 6.5 10.5 4 3 11.5Z" />,
  menu: <path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" strokeWidth="2" />,
  play: <path d="M5 3.5 13 8l-8 4.5v-9Z" />,
  pause: <path d="M4 3h3v10H4V3Zm5 0h3v10H9V3Z" />,
  stop: <path d="M4 4h8v8H4V4Z" />,
  settings: <path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm0-3 .9 1.8 2 .4.4 2 1.7 1-.9 1.8.9 1.8-1.7 1-.4 2-2 .4-.9 1.8-.9-1.8-2-.4-.4-2-1.7-1 .9-1.8L3 7.4l1.7-1 .4-2 2-.4.9-1.8Z" />,
  trash: <path d="M3 4h10M6 4V2h4v2m-5 2 .5 8h5L11 6" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  link: <path d="M6.5 10.5 5.3 12a2.4 2.4 0 0 1-3.4-3.4L4 6.5m5.5-.9 1.2-1.5a2.4 2.4 0 0 1 3.4 3.4L12 9.5M5.8 10.2l4.4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  stats: <path d="M3 13V7m5 6V3m5 10V6" fill="none" stroke="currentColor" strokeWidth="2" />,
  replay: <path d="M5 5H2V2m.4 3A6 6 0 1 1 2 9" fill="none" stroke="currentColor" strokeWidth="1.7" />,
  'chevron-left': <path d="M10.5 3 5.5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" />,
  'chevron-right': <path d="m5.5 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" />,
  'chevron-up': <path d="m3 10.5 5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" />,
  'chevron-down': <path d="m3 5.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />,
};

export function GameIcon({
  name,
  className = '',
  label,
  style,
}: {
  name: IconName;
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <svg className={`gui-icon ${className}`} viewBox="0 0 16 16" aria-label={label || name} role="img" style={style}>
      {iconPath[name] || iconPath.diamond}
    </svg>
  );
}

export function NotificationDot({ tone = 'secondary' }: { tone?: 'primary' | 'secondary' }) {
  return <span className={`notification-dot is-${tone}`} />;
}

export function GameButton({
  children = 'Button',
  tone = 'primary',
  state = 'default',
  iconLeft = 'check',
  iconRight,
  showLeftIcon = true,
  showRightIcon = false,
  notification = false,
  iconOnly = false,
  className = '',
  onClick,
  disabled,
  type = 'button',
  'aria-label': ariaLabel,
}: {
  children?: ReactNode;
  tone?: Tone;
  state?: ButtonState;
  iconLeft?: IconName;
  iconRight?: IconName;
  showLeftIcon?: boolean;
  showRightIcon?: boolean;
  notification?: boolean;
  iconOnly?: boolean;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
}) {
  return (
    <button
      type={type}
      className={`game-button ${className}`}
      data-tone={tone}
      data-state={disabled ? 'inactive' : state}
      data-icon-only={iconOnly}
      onClick={(e) => {
        if (!disabled) playClick();
        onClick?.(e);
      }}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {showLeftIcon && <GameIcon name={iconLeft} />}
      {!iconOnly && <span>{children}</span>}
      {showRightIcon && iconRight && <GameIcon name={iconRight} />}
      {notification && <NotificationDot tone={tone === 'primary' ? 'secondary' : 'primary'} />}
    </button>
  );
}

export function Placeholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`placeholder ${compact ? 'is-compact' : ''}`}>
      <GameIcon name="check" />
      <span>Swap with a local component that holds your content</span>
    </div>
  );
}

export function Divider() {
  return <div className="divider" />;
}

export function Notch() {
  return (
    <div className="notch">
      <span />
    </div>
  );
}

export function Banner({ children = 'ON SALE!' }: { children?: ReactNode }) {
  return (
    <div className="sale-banner">
      <span className="banner-tail" />
      <strong>{children}</strong>
      <span className="banner-tail is-right" />
    </div>
  );
}

export function DrawerBackground() {
  return <div className="drawer-background" />;
}

export function GameTab({
  children,
  state = 'inactive',
  notification = false,
}: {
  children: ReactNode;
  state?: 'highlighted' | 'active' | 'inactive';
  notification?: boolean;
}) {
  return (
    <button className="game-tab" data-state={state}>
      {children}
      {notification && <NotificationDot tone={state === 'highlighted' ? 'primary' : 'secondary'} />}
    </button>
  );
}

export function TabGroup() {
  return (
    <div className="tab-group">
      <GameTab state="highlighted" notification>
        Highlighted
      </GameTab>
      <GameTab state="active">Active</GameTab>
      <GameTab>Inactive</GameTab>
    </div>
  );
}

export function LineTabGroup() {
  return (
    <div className="line-tab-group">
      {['Tab 1', 'Tab 2', 'Tab 3'].map((tab, index) => (
        <button className="line-tab" data-active={index === 1} key={tab}>
          {tab}
        </button>
      ))}
    </div>
  );
}

export function ButtonTabGroup() {
  return (
    <div className="button-tab-group">
      <GameButton iconOnly iconLeft="rabbit" />
      <GameButton tone="secondary" iconOnly iconLeft="ring" />
      <span />
      <GameButton iconOnly iconLeft="diamond" />
      <GameButton tone="secondary" iconOnly iconLeft="gold" />
    </div>
  );
}

export function ModalFrame({
  scale = 'fixed',
  showTabs = true,
  showClose = true,
  children,
}: {
  scale?: 'fixed' | 'scalable';
  showTabs?: boolean;
  showClose?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`modal-shell is-${scale}`}>
      {showTabs && <TabGroup />}
      {showClose && (
        <GameButton className="modal-close" iconOnly iconLeft="close" />
      )}
      <div className="modal-body">{children || <Placeholder />}</div>
      <Notch />
    </div>
  );
}

export function ProgressBar({
  value = 25,
  labels = true,
  middleText,
}: {
  /** Percentage 0..100. Internally clamped via inline style width. */
  value?: number;
  labels?: boolean;
  middleText?: string;
}) {
  return (
    <div className="progress-row">
      {labels && <span>12</span>}
      <GameIcon name="gold" />
      <div className="progress-track">
        <span style={{ width: `${value}%` }} />
        {middleText && <em>{middleText}</em>}
      </div>
      <GameIcon name="gold" />
      {labels && <span>20</span>}
    </div>
  );
}

export function Slider({ value = 45 }: { value?: number }) {
  return (
    <div className="slider">
      <span style={{ width: `${value}%` }} />
      <GameIcon name="gold" style={{ left: `${value}%` }} className="slider-thumb" />
    </div>
  );
}

export function ProgressWheel({ value = 25 }: { value?: 25 | 50 | 75 | 100 }) {
  return (
    <div className="progress-wheel" style={{ '--progress': `${value}%` } as CSSProperties}>
      <strong>{value}%</strong>
    </div>
  );
}

export function Spinner({ phase = 1 }: { phase?: 1 | 2 | 3 | 4 }) {
  return <span className="spinner" data-phase={phase} />;
}

export function Tooltip({ children = 'Tooltip' }: { children?: ReactNode }) {
  return (
    <div className="tooltip-box">
      <span className="pointer up" />
      <span className="pointer down" />
      <span className="pointer left" />
      <span className="pointer right" />
      {children}
    </div>
  );
}

export function NewBadge() {
  return <span className="new-badge">NEW!</span>;
}

export function Badge({ tone = 'secondary', icon = 'swords' }: { tone?: 'primary' | 'secondary'; icon?: IconName }) {
  return (
    <div className="badge-medal" data-tone={tone}>
      <GameIcon name={icon} />
    </div>
  );
}

export function FormField({
  state = 'default',
  label = 'Field Label',
  value = 'Input Text',
  helper = 'This is helper text',
}: {
  state?: 'default' | 'hover' | 'active' | 'error' | 'disabled';
  label?: string;
  value?: string;
  helper?: string;
}) {
  return (
    <label className="form-field" data-state={state}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <GameIcon name="close" />
      </div>
      <small>{helper}</small>
    </label>
  );
}

export function Checkbox({ checked = true, hover = false }: { checked?: boolean; hover?: boolean }) {
  return (
    <label className="choice" data-hover={hover}>
      <span className="checkbox-box">{checked && <GameIcon name="check" />}</span>
      <strong>Checkbox</strong>
    </label>
  );
}

export function Radio({ selected = true }: { selected?: boolean }) {
  return (
    <label className="choice">
      <span className="radio-box">{selected && <span />}</span>
      <strong>Radio</strong>
    </label>
  );
}

export function Toggle({ on = false }: { on?: boolean }) {
  return (
    <label className="toggle-row">
      <span className="toggle" data-on={on}>
        <i />
      </span>
      <strong>Toggle</strong>
    </label>
  );
}

export function Pill({ value = '1,234' }: { value?: string }) {
  return (
    <div className="pill">
      <GameIcon name="add" />
      <strong>{value}</strong>
      <GameIcon name="gold" />
      <NotificationDot />
    </div>
  );
}

export function Stepper({ value = 3 }: { value?: number }) {
  return (
    <div className="stepper">
      <GameIcon name="chevron-left" />
      <strong>{value}</strong>
      <GameIcon name="chevron-right" />
    </div>
  );
}

export function Pagination({ active = 2, background = true }: { active?: number; background?: boolean }) {
  return (
    <div className="pagination" data-background={background}>
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} data-active={index === active} />
      ))}
    </div>
  );
}

export function TextHeader({ children = 'Put some text here' }: { children?: ReactNode }) {
  return (
    <div className="text-header">
      <GameIcon name="chevron-left" />
      <strong>{children}</strong>
      <GameIcon name="chevron-right" />
    </div>
  );
}

export function TextArea({
  children = 'The royal subscription offers a premium experience for the best value',
}: {
  children?: ReactNode;
}) {
  return <div className="text-area">{children}</div>;
}

export function ButtonRow({ icons = ['play', 'edit', 'stats', 'link', 'replay', 'settings', 'trash'] as IconName[] }) {
  return (
    <div className="button-row">
      {icons.map((icon) => (
        <GameButton key={icon} tone="secondary" iconOnly iconLeft={icon} />
      ))}
    </div>
  );
}

export function NavigationBar({ mode = 'buttons' }: { mode?: 'buttons' | 'title' }) {
  return (
    <div className="navigation-bar" data-mode={mode}>
      <GameButton iconOnly iconLeft="menu" />
      {mode === 'buttons' ? <ButtonRow icons={['check', 'check', 'check', 'check', 'check']} /> : <strong>Create Account</strong>}
      <GameButton iconOnly iconLeft={mode === 'buttons' ? 'play' : 'settings'} />
    </div>
  );
}

export function DrawerNav() {
  return (
    <nav className="drawer-nav">
      {(['pause', 'bell', 'play', 'diamond', 'heart', 'search', 'settings'] as IconName[]).map((icon) => (
        <GameButton key={icon} tone="secondary" iconOnly iconLeft={icon} />
      ))}
    </nav>
  );
}

export function ContextualMenu() {
  return (
    <div className="contextual-menu">
      <ButtonRow />
      <span className="pointer down" />
    </div>
  );
}

export function Pulldown() {
  return (
    <div className="pulldown">
      <strong>Player name</strong>
      <Badge icon="rabbit" tone="primary" />
      <strong>Follow player</strong>
      <Notch />
    </div>
  );
}

export function Drawer({
  orientation = 'vertical',
  tertiary = false,
}: {
  orientation?: 'vertical' | 'horizontal';
  tertiary?: boolean;
}) {
  return (
    <div className="action-sheet" data-orientation={orientation}>
      <strong>Helper Text</strong>
      {tertiary && <GameButton tone="negative">Button</GameButton>}
      {orientation === 'horizontal' ? (
        <div className="button-pair">
          <GameButton tone="secondary">Button</GameButton>
          <GameButton>Button</GameButton>
        </div>
      ) : (
        <>
          <GameButton tone="secondary">Button</GameButton>
          <GameButton>Button</GameButton>
        </>
      )}
    </div>
  );
}

export function Dropdown() {
  return (
    <div className="dropdown">
      <span className="pointer up" />
      {Array.from({ length: 5 }, (_, index) => (
        <button className="dropdown-row" key={index}>
          Dropdown Item {index + 1}
          <GameIcon name="diamond" />
        </button>
      ))}
    </div>
  );
}

export function ItemCard() {
  return (
    <div className="item-card-horizontal">
      <div className="item-card">
        <div className="stars">***</div>
        <GameIcon name="heart" />
        <strong>x3</strong>
      </div>
      <div className="item-card-copy">
        <strong>Hearts</strong>
        <span>Find hearts hidden in secret areas, but be aware of the treasure keepers</span>
      </div>
      <GameButton tone="secondary" showLeftIcon={false} showRightIcon iconRight="diamond">
        500
      </GameButton>
      <ProgressBar value={25} labels={false} />
    </div>
  );
}

export function Dialog() {
  return (
    <div className="dialog-box">
      <header>
        <strong>Dialog Box</strong>
        <GameIcon name="close" />
      </header>
      <Placeholder />
      <div className="button-pair">
        <GameButton tone="secondary">Button</GameButton>
        <GameButton>Button</GameButton>
      </div>
    </div>
  );
}

export function CardDock() {
  return (
    <div className="card-dock">
      {Array.from({ length: 12 }, (_, index) => (
        <GameButton key={index} tone="secondary" iconOnly iconLeft="check" />
      ))}
    </div>
  );
}

export function Row({
  type = 'leaderboard',
}: {
  type?: 'leaderboard' | 'search' | 'notification' | 'store' | 'store-simple' | 'slider';
}) {
  if (type === 'search') {
    return (
      <div className="data-row">
        <span>Search Player</span>
        <GameIcon name="diamond" />
      </div>
    );
  }

  if (type === 'notification') {
    return (
      <div className="data-row">
        <GameIcon name="diamond" />
        <strong>News update!</strong>
        <GameButton showLeftIcon={false}>Read</GameButton>
      </div>
    );
  }

  if (type === 'store' || type === 'store-simple') {
    return (
      <div className="data-row">
        <GameIcon name="diamond" />
        <strong>200</strong>
        <em>+ 3,000 bonus!</em>
        {type === 'store' && <GameButton showLeftIcon={false}>$1.99</GameButton>}
      </div>
    );
  }

  if (type === 'slider') {
    return (
      <div className="data-row">
        <strong>+ 3,000 bonus!</strong>
        <Slider />
        <GameIcon name="diamond" />
      </div>
    );
  }

  return (
    <div className="data-row">
      <span>10.</span>
      <GameIcon name="diamond" />
      <strong>z</strong>
      <GameIcon name="diamond" />
      <b>9,999</b>
    </div>
  );
}

export function Table() {
  return (
    <div className="data-table">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index}>
          <GameIcon name="diamond" />
          <span>Label</span>
          <strong>1,234</strong>
          <strong>3,456</strong>
        </div>
      ))}
    </div>
  );
}

export function RowBackgrounds() {
  return (
    <div className="row-backgrounds">
      {['default', 'hover', 'pressed', 'negative', 'positive'].map((state) => (
        <span data-state={state} key={state} />
      ))}
    </div>
  );
}

export const allIcons: IconName[] = [
  'heart',
  'diamond',
  'gold',
  'ruby',
  'emerald',
  'topaz',
  'ring',
  'swords',
  'trophy',
  'bell',
  'carrot',
  'rabbit',
  'key',
  'crown',
  'ticket',
  'check',
  'close',
  'add',
  'subtract',
  'search',
  'star',
  'edit',
  'menu',
  'play',
  'pause',
  'stop',
  'settings',
  'trash',
  'link',
  'stats',
  'replay',
  'chevron-left',
  'chevron-right',
  'chevron-up',
  'chevron-down',
];
