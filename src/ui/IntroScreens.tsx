import { useState } from 'react';
import {
  MeowchiButton,
  MeowchiCard,
  MeowchiField,
  MeowchiPatternBackground,
  MeowchiTopNav,
  MeowchiHomeIndicator,
} from './MeowchiUI';
import { AnimatedSprite } from './AnimatedSprite';

export type IntroStep = 'letter' | 'onboarding' | 'login';

const ONBOARDING_FRAMES = [1, 2, 3, 4].map((i) => `/assets/On Boarding/Run-Onboarding-${i} 1.png`);

const LETTER = [
  'Happy Anniversary Mochiku Sayang! Semoga di umur pernikahan kita yang beranjak 1 tahun ini kita selalu diberikan kesehatan, keberkahan, kebahagiaan ya Sayang.',
  'Terima Kasih sudah bertahan selama 1 tahun ini ya, maafin Poki ya masih banyak kekurangan sama Mochi. Makasih juga ya Mochi udah bertahan di masa-masa berat kita sekarang ini sayang, semoga segera membaik ya kondisinya nanti sayang.',
  'Mochi Sayang, maafin Poki Anniv kali ini belum bisa kasih Mochi apa-apa. Tapi ini ada sedikit tanda cinta Poki ke Mochi, Poki buatin Mochi Kucing Virtual ya.',
  'Ini nanti akan terus Poki update kedepannya ya sayang, maafin ya kalau belum sempurna sayang. I Love You So Much My Mochi',
];

export function IntroScreens({
  onDone,
  initialStep = 'letter',
}: {
  onDone: (credentials?: { email: string; password: string }) => Promise<void> | void;
  initialStep?: IntroStep;
}) {
  const [step, setStep] = useState<IntroStep>(initialStep);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (step === 'letter') {
    return (
      <MeowchiPatternBackground>
        <div className="meow-intro-center">
          <MeowchiCard className="meow-letter-card">
            <h1>Dear, Mochi ku sayang.</h1>
            <div className="meow-letter-copy">
              {LETTER.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <MeowchiButton tone="success" onClick={() => setStep('onboarding')}>
              Ketemu Meowchi!
            </MeowchiButton>
          </MeowchiCard>
        </div>
      </MeowchiPatternBackground>
    );
  }

  if (step === 'onboarding') {
    return (
      <main className="meow-screen meow-light-screen">
        <section className="meow-onboarding">
          <AnimatedSprite className="meow-onboarding-cat" frames={ONBOARDING_FRAMES} alt="Meowchi berlari" />
          <div>
            <p>Miaw~ Hai Hayu!</p>
            <p>
              Namaku Meowchi Aku teman kecil berbulu abu-abu yang siap menemani
              hari-harimu. Aku suka makan, tidur, main, dan tentu saja nemenin kamu
            </p>
          </div>
        </section>
        <footer className="meow-bottom-action">
          <MeowchiButton onClick={() => setStep('login')}>Mulai Bareng Meowchi</MeowchiButton>
          <MeowchiHomeIndicator />
        </footer>
      </main>
    );
  }

  return (
    <MeowchiPatternBackground showStatusBar={false}>
      <MeowchiTopNav back tone="light" onBack={() => setStep('onboarding')} />
      <div className="meow-intro-center">
        <MeowchiCard className="meow-login-card">
          <img className="meow-login-logo pixel-img" src="/assets/figma/login-logo.png" alt="Login" />
          <MeowchiField label="Email" placeholder="Enter your email" value={email} onChange={setEmail} />
          <MeowchiField
            label="Password"
            placeholder="Enter your password"
            type="password"
            icon="search"
            value={password}
            onChange={setPassword}
          />
          {error && <p className="meow-login-error">{error}</p>}
          <MeowchiButton
            tone="success"
            disabled={loading}
            onClick={async () => {
              setError(null);
              if (!email.trim() || !password.trim()) {
                setError('Email dan password wajib diisi.');
                return;
              }
              setLoading(true);
              try {
                await onDone({ email, password });
              } catch (err) {
                const e = err as Error;
                setError(e?.message || 'Login gagal.');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'LOADING...' : 'LOGIN'}
          </MeowchiButton>
        </MeowchiCard>
      </div>
    </MeowchiPatternBackground>
  );
}
