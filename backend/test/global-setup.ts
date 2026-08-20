import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Build one migrated SQLite file that every suite copies. Running `prisma migrate deploy`
 * once instead of per-suite keeps the suite fast enough that people actually run it.
 */
export default function globalSetup(): void {
  const tmpDir = path.join(__dirname, '.tmp');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const templateDb = path.join(tmpDir, 'template.db');
  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
    stdio: 'inherit',
  });
}
