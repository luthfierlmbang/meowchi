export type FeatureName = 'chat' | 'vision';
export type DisableCause = 'auth' | 'quota' | 'missing_key';

export interface ConfigSnapshot {
  geminiKey: string | null;   // null when undefined or whitespace-only (Req 1.3)
  chatEnabled: boolean;
  visionEnabled: boolean;
}

interface FeatureError {
  feature: FeatureName;
  cause: DisableCause;
  message: string;
}

let _config: ConfigSnapshot | null = null;
const _featureErrors: Map<FeatureName, FeatureError> = new Map();

/**
 * Read VITE_GEMINI_API_KEY exactly once at bootstrap.
 * Must be called before any feature component mounts (Req 1.2).
 */
export function loadConfig(): void {
  const raw = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  // Treat undefined or whitespace-only as missing (Req 1.3)
  const key = raw && raw.trim().length > 0 ? raw.trim() : null;
  _config = {
    geminiKey: key,
    chatEnabled: key !== null,
    visionEnabled: key !== null,
  };
}

/**
 * Get the current config snapshot. Throws if loadConfig() was not called first.
 */
export function getConfig(): ConfigSnapshot {
  if (!_config) {
    throw new Error('Config_Store: loadConfig() must be called before getConfig()');
  }
  return { ..._config };
}

/**
 * Disable a specific feature due to a runtime error (auth/quota).
 * Per Req 1.5: only the failing feature is disabled; others remain active.
 */
export function disableFeature(feature: FeatureName, cause: 'auth' | 'quota'): void {
  if (!_config) return;
  if (feature === 'chat') _config.chatEnabled = false;
  if (feature === 'vision') _config.visionEnabled = false;
  _featureErrors.set(feature, {
    feature,
    cause,
    message: `Fitur "${feature}" dinonaktifkan karena error: ${cause}`,
  });
}

/**
 * Get the error for a specific feature, if any.
 */
export function getFeatureError(feature: FeatureName): FeatureError | undefined {
  return _featureErrors.get(feature);
}

/**
 * Reset config (for testing purposes only).
 */
export function _resetConfig(): void {
  _config = null;
  _featureErrors.clear();
}
