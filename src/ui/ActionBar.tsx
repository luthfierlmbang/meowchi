import { AnimatedSprite } from './AnimatedSprite';

export interface ActionBarProps {
  onFeed: () => void;
  onShop: () => void;
  onHabit: () => void;
  onChat: () => void;
}

const CHAT_BUTTON_FRAMES = [1, 2].map((i) => `/assets/Button Chats/Button-Chat${i} 1.png`);
const FEED_BUTTON_FRAMES = [1, 2, 3].map((i) => `/assets/Button Feed/Button-feed${i} 1.png`);

export function ActionBar({ onFeed, onShop, onHabit, onChat }: ActionBarProps) {
  return (
    <nav role="navigation" aria-label="Menu utama" className="meow-floating-actions">
      <button type="button" onClick={onChat} aria-label="Ngobrol dengan Meowchi">
        <AnimatedSprite frames={CHAT_BUTTON_FRAMES} alt="" className="meow-action-image" intervalMs={520} />
      </button>
      <button type="button" onClick={onFeed} aria-label="Makan">
        <AnimatedSprite frames={FEED_BUTTON_FRAMES} alt="" className="meow-action-image" intervalMs={420} />
      </button>
      <div className="meow-action-chips">
        <button type="button" onClick={onShop}>Toko</button>
        <button type="button" onClick={onHabit}>Habit</button>
      </div>
    </nav>
  );
}
