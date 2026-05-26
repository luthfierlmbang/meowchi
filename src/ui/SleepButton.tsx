import { GameButton } from '../components/GameUI';

export interface SleepButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function SleepButton({ onPress, disabled }: SleepButtonProps) {
  return (
    <GameButton
      iconOnly
      iconLeft="pause"
      tone="secondary"
      onClick={onPress}
      disabled={disabled}
      aria-label="Tidur"
    />
  );
}
