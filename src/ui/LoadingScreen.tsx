import { MeowchiHomeIndicator, MeowchiStatusBar } from './MeowchiUI';

export function LoadingScreen() {
  return (
    <main className="meow-screen meow-loading-screen" aria-label="Loading Meowchi">
      <img
        className="splash-shine"
        src="/assets/figma/splash-shine.png"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <MeowchiStatusBar tone="light" />
      <section className="meow-loading-content">
        <img
          className="meow-loading-logo pixel-img"
          src="/assets/figma/splash-logo.png"
          alt=""
          draggable={false}
        />
        <div className="meow-loading-copy">
          <strong>Loading...</strong>
          <span>
            <i />
          </span>
        </div>
      </section>
      <MeowchiHomeIndicator tone="light" />
    </main>
  );
}
