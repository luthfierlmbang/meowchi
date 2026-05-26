import { useEffect, useState } from 'react';

function formatStatusTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

function StatusBar() {
  const [time, setTime] = useState(() => formatStatusTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatStatusTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="splash-status-bar" aria-hidden="true">
      <div className="splash-status-time">{time}</div>
    </div>
  );
}

export function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="Memuat Meowchi">
      <img
        className="splash-shine"
        src="/assets/figma/splash-shine.png"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <StatusBar />
      <section className="splash-content" aria-hidden="true">
        <img
          className="splash-logo pixel-img"
          src="/assets/figma/splash-logo.png"
          alt=""
          draggable={false}
        />
      </section>
      <div className="splash-home-bar" aria-hidden="true">
        <span />
      </div>
    </main>
  );
}
