export interface FeatureFlags {
  /** Phase 0 spike: SFrame end-to-end encryption for voice and screen share. */
  e2ee: boolean;
}

export function parseFlags(env: Record<string, string | boolean | undefined>): FeatureFlags {
  const on = (v: unknown) => v === true || v === "true" || v === "1";
  return { e2ee: on(env.VITE_FEATURE_E2EE) };
}
