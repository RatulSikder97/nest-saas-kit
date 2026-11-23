import { existsSync } from 'node:fs';

/** Loads ./.env for CLI scripts (already-set variables win), mirroring @nestjs/config. */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
