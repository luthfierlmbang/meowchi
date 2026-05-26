import { useStore } from '../state/store';
import { MeowchiTopNav } from './MeowchiUI';
import { updateVolumes, playClick } from '../engine/sound';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const bgmVolume = useStore((s) => s.bgmVolume);
  const sfxVolume = useStore((s) => s.sfxVolume);
  const setBgmVolume = useStore((s) => s.setBgmVolume);
  const setSfxVolume = useStore((s) => s.setSfxVolume);

  if (!open) return null;

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setBgmVolume(val);
    updateVolumes();
  };

  const handleSfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSfxVolume(val);
    // Play a preview click sound when adjusting SFX volume so the user hears immediate feedback
    playClick();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Suara"
      onClick={onClose}
      className="meow-chat-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="meow-screen meow-chat-screen"
      >
        <MeowchiTopNav title="Pengaturan" back onBack={onClose} />

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            padding: '24px 20px',
            overflowY: 'auto',
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--meow-text-soft)',
              fontFamily: 'var(--meow-body)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Atur volume musik latar belakang dan efek suara (suara kucing & klik tombol) sesuai keinginanmu.
          </p>

          {/* BGM Slider */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 16,
              background: 'var(--meow-surface)',
              border: '2px solid #111',
              borderRadius: 18,
              boxShadow: '0 4px 0 #111',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--meow-text)', fontFamily: 'var(--meow-body)' }}>
                Musik Latar (BGM)
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--meow-brand)', fontFamily: 'var(--meow-body)' }}>
                {Math.round(bgmVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={bgmVolume}
              onChange={handleBgmChange}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: 'var(--meow-brand)',
                height: 8,
                borderRadius: 4,
              }}
            />
          </div>

          {/* SFX Slider */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 16,
              background: 'var(--meow-surface)',
              border: '2px solid #111',
              borderRadius: 18,
              boxShadow: '0 4px 0 #111',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--meow-text)', fontFamily: 'var(--meow-body)' }}>
                Efek Suara (SFX)
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--meow-brand)', fontFamily: 'var(--meow-body)' }}>
                {Math.round(sfxVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sfxVolume}
              onChange={handleSfxChange}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: 'var(--meow-brand)',
                height: 8,
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
