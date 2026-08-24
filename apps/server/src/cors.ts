import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Extracted from main.ts's bootstrap() so it's unit/e2e-testable without starting a real
 * listener. Bare app.enableCors() (the previous behavior) is a wildcard-origin policy -- fine on
 * localhost, a real problem once this is deployed publicly. Falls back to the local Vite dev
 * server's default origin so `pnpm dev` keeps working without every contributor needing to set
 * an env var. */
export function getCorsOptions(): CorsOptions {
  return { origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173' };
}
