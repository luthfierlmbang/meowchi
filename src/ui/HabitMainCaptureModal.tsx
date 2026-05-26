import { useEffect, useRef, useState } from 'react';
import { GameButton, Spinner } from '../components/GameUI';
import { MAIN_HABIT_LABELS, type MainHabitId } from '../features/habits/constants';
import { submitMainHabit } from '../features/habits/habit_tracker';
import { getConfig, getFeatureError } from '../state/Config_Store';
import { showToast } from './Toast';

export interface HabitMainCaptureModalProps {
  open: boolean;
  habitId: MainHabitId | null;
  onClose: () => void;
}

type Phase =
  | 'idle'
  | 'requesting'
  | 'live'
  | 'captured'
  | 'submitting'
  | 'result'
  | 'no_camera'
  | 'permission_denied';

type ResultKind = 'valid' | 'fraud' | 'mismatch' | 'error';

/**
 * Live camera capture modal for Main_Habit verification (Req 10.1, 10.2, 10.4, 10.5, 10.7, 10.8).
 *
 * Mobile-first: full-screen modal, live preview fills the viewport, capture button
 * pinned to the bottom. Uses `getUserMedia` with `facingMode: { ideal: 'environment' }`
 * to prefer the rear camera. After capture the stream is stopped and the frozen
 * frame is held on a `<canvas>` until the user retakes or submits.
 *
 * On `valid` verdict the modal awards +50 koin via `submitMainHabit`. On `fraud`
 * or `mismatch` it surfaces `verdict.reason`. On error (auth/quota/timeout/network)
 * it shows a generic failure message.
 */
export function HabitMainCaptureModal({ open, habitId, onClose }: HabitMainCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [resultKind, setResultKind] = useState<ResultKind | null>(null);

  const cfg = getConfig();
  const visionDisabled = !cfg.visionEnabled;

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('no_camera');
      return;
    }
    setPhase('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        setPhase('permission_denied');
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setPhase('no_camera');
      } else {
        setError(e?.message || 'Kamera tidak dapat diakses');
        setPhase('no_camera');
      }
    }
  }

  // Start camera on open. Cleanup stops the stream cleanly on close/unmount (Req 10.4).
  useEffect(() => {
    if (!open || !habitId) return;
    setError(null);
    setResultMsg(null);
    setResultKind(null);

    if (visionDisabled) {
      setPhase('idle');
      return;
    }

    let cancelled = false;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setPhase('no_camera');
        return;
      }
      setPhase('requesting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('live');
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException;
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
          setPhase('permission_denied');
        } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
          setPhase('no_camera');
        } else {
          setError(e?.message || 'Kamera tidak dapat diakses');
          setPhase('no_camera');
        }
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, habitId, visionDisabled]);

  function handleClose() {
    stopStream();
    setPhase('idle');
    setResultMsg(null);
    setResultKind(null);
    setError(null);
    onClose();
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    stopStream();
    setPhase('captured');
  }

  async function handleSubmit() {
    if (!habitId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase('submitting');
    setError(null);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setError('Gagal membuat foto');
          setPhase('captured');
          return;
        }
        try {
          const result = await submitMainHabit(habitId, blob);
          if (result.rewarded) {
            setResultKind('valid');
            setResultMsg(`Berhasil! +50 koin. ${result.verdict.reason}`);
            showToast('+50 koin!', 'info');
          } else if (result.verdict.verdict === 'fraud') {
            setResultKind('fraud');
            setResultMsg(`Foto ditolak (kecurangan). ${result.verdict.reason}`);
          } else {
            setResultKind('mismatch');
            setResultMsg(`Foto tidak sesuai. ${result.verdict.reason}`);
          }
        } catch (err) {
          const e = err as Error;
          setResultKind('error');
          setResultMsg(e?.message || 'Verifikasi gagal');
        } finally {
          setPhase('result');
        }
      },
      'image/jpeg',
      0.92,
    );
  }

  function handleRetake() {
    setResultMsg(null);
    setResultKind(null);
    setError(null);
    void startCamera();
  }

  function handleRetryPermission() {
    setError(null);
    void startCamera();
  }

  if (!open || !habitId) return null;

  // Visibility helpers — keep <video> and <canvas> always mounted so refs stay
  // stable across phase transitions. Only one is shown at a time.
  const showVideo = phase === 'live';
  const showCanvas = phase === 'captured';
  const showSpinner = phase === 'requesting' || phase === 'submitting';
  const showVisionDisabled = visionDisabled;
  const showPermissionDenied = !visionDisabled && phase === 'permission_denied';
  const showNoCamera = !visionDisabled && phase === 'no_camera';
  const showResult = !visionDisabled && phase === 'result';

  const headerBg = 'var(--secondary-600, #2e1836)';
  const errColor = 'var(--negative-100, #ff2929)';
  const okColor = 'var(--positive-100, #25ffa3)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verifikasi Habit"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 2600,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 12,
          minHeight: 52,
          background: headerBg,
          gap: 8,
        }}
      >
        <strong
          style={{
            color: 'var(--primary-200, #e1bb17)',
            fontSize: 13,
            flex: 1,
            textTransform: 'uppercase',
          }}
        >
          {MAIN_HABIT_LABELS[habitId]}
        </strong>
        <GameButton
          iconOnly
          iconLeft="close"
          tone="secondary"
          onClick={handleClose}
          aria-label="Tutup"
        />
      </header>

      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          overflow: 'hidden',
        }}
      >
        {/* Always-mounted media elements so refs are stable */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            display: showVideo ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
        <canvas
          ref={canvasRef}
          aria-label="Pratinjau hasil tangkapan"
          style={{
            display: showCanvas ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />

        {showSpinner && (
          <div aria-live="polite" aria-label="Memuat">
            <Spinner phase={2} />
          </div>
        )}

        {showVisionDisabled && (
          <div
            role="alert"
            style={{
              padding: 24,
              color: 'var(--secondary-100, #d96eff)',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {getFeatureError('vision')
              ? `Vision dinonaktifkan karena error API (${getFeatureError('vision')?.cause === 'auth' ? 'API Key tidak valid / Unauthorized' : 'Kuota terlampaui'})`
              : 'Vision dinonaktifkan: API key Gemini belum dikonfigurasi'}
          </div>
        )}

        {showPermissionDenied && (
          <div
            role="alert"
            style={{
              padding: 24,
              textAlign: 'center',
              color: errColor,
              fontWeight: 800,
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser, lalu coba lagi.
          </div>
        )}

        {showNoCamera && (
          <div
            role="alert"
            style={{
              padding: 24,
              textAlign: 'center',
              color: errColor,
              fontWeight: 800,
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            Tidak ada kamera yang tersedia.
            {error ? ` ${error}` : ''}
          </div>
        )}

        {showResult && (
          <div
            role="alert"
            style={{
              padding: 24,
              textAlign: 'center',
              color: resultKind === 'valid' ? okColor : errColor,
              fontWeight: 800,
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            {resultMsg}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 12,
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          background: headerBg,
          minHeight: 68,
        }}
      >
        {showVisionDisabled && (
          <GameButton tone="secondary" onClick={handleClose} showLeftIcon={false}>
            Tutup
          </GameButton>
        )}
        {!visionDisabled && phase === 'live' && (
          <GameButton tone="primary" iconLeft="check" onClick={handleCapture}>
            Ambil Foto
          </GameButton>
        )}
        {!visionDisabled && phase === 'captured' && (
          <>
            <GameButton tone="secondary" iconLeft="replay" onClick={handleRetake}>
              Ulang
            </GameButton>
            <GameButton tone="primary" iconLeft="check" onClick={handleSubmit}>
              Verifikasi
            </GameButton>
          </>
        )}
        {!visionDisabled && phase === 'submitting' && (
          <GameButton tone="disabled" disabled showLeftIcon={false}>
            Mengirim…
          </GameButton>
        )}
        {!visionDisabled && phase === 'result' && (
          <>
            {resultKind !== 'valid' && (
              <GameButton tone="secondary" iconLeft="replay" onClick={handleRetake}>
                Ulang
              </GameButton>
            )}
            <GameButton tone="primary" iconLeft="check" onClick={handleClose}>
              Selesai
            </GameButton>
          </>
        )}
        {!visionDisabled && phase === 'permission_denied' && (
          <>
            <GameButton tone="secondary" onClick={handleClose} showLeftIcon={false}>
              Tutup
            </GameButton>
            <GameButton tone="primary" iconLeft="replay" onClick={handleRetryPermission}>
              Coba Lagi
            </GameButton>
          </>
        )}
        {!visionDisabled && phase === 'no_camera' && (
          <GameButton tone="secondary" onClick={handleClose} showLeftIcon={false}>
            Tutup
          </GameButton>
        )}
      </div>
    </div>
  );
}
