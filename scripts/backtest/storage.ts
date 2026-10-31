// Disk-backed stand-in for src/lib/storage.ts so the app's code can run under Node.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '.cache');
mkdirSync(DIR, { recursive: true });
const file = (key: string) => join(DIR, `${key.replace(/[^a-z0-9._-]/gi, '_')}.json`);

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    return existsSync(file(key)) ? (JSON.parse(readFileSync(file(key), 'utf8')) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  writeFileSync(file(key), JSON.stringify(value));
}
