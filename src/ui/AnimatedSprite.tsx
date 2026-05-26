import { useEffect, useState } from 'react';

export function AnimatedSprite({
  frames,
  alt,
  className = '',
  intervalMs = 150,
}: {
  frames: string[];
  alt: string;
  className?: string;
  intervalMs?: number;
}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return undefined;
    const id = setInterval(() => {
      setFrame((current) => (current + 1) % frames.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [frames.length, intervalMs]);

  return (
    <img
      className={`pixel-img ${className}`}
      src={frames[frame] ?? frames[0]}
      alt={alt}
      draggable={false}
    />
  );
}
