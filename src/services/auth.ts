/**
 * Local-first accounts.
 *
 * Zero-cost rule: no hosted database. Accounts live in IndexedDB on the
 * device, passwords are salted SHA-256 hashes (Web Crypto), and moving a
 * profile between devices is a signed-off "sync file" the user exports
 * and imports themselves.
 */

import { db, storage } from '../utils/storage';

export interface Account {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  salt: string;
  passwordHash: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

const SESSION_KEY = 'dannz.session';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64(new Uint8Array(digest));
}

async function accountKey(email: string): Promise<string> {
  return `account:${email.trim().toLowerCase()}`;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validatePassword(password: string): boolean {
  return password.length >= 6;
}

async function readAccount(email: string): Promise<Account | null> {
  return storage.getSetting<Account>(await accountKey(email));
}

async function writeAccount(account: Account): Promise<void> {
  await storage.saveSetting(await accountKey(account.email), account);
}

function publicAccount(account: Account): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
  };
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<PublicAccount> {
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) throw new Error('auth.badEmail');
  if (!validatePassword(password)) throw new Error('auth.shortPassword');
  if (await readAccount(normalized)) throw new Error('auth.exists');

  const salt = randomSalt();
  const account: Account = {
    id: `acc_${Date.now().toString(36)}`,
    email: normalized,
    name: name.trim() || normalized.split('@')[0],
    createdAt: Date.now(),
    salt,
    passwordHash: await hashPassword(password, salt),
  };
  await writeAccount(account);
  setSession(account);
  return publicAccount(account);
}

export async function login(email: string, password: string): Promise<PublicAccount> {
  const normalized = email.trim().toLowerCase();
  const account = await readAccount(normalized);
  if (!account) throw new Error('auth.invalid');
  const hash = await hashPassword(password, account.salt);
  if (hash !== account.passwordHash) throw new Error('auth.invalid');
  setSession(account);
  return publicAccount(account);
}

export function setSession(account: Account): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(publicAccount(account)));
  } catch {
    /* storage blocked - session stays in memory */
  }
}

export function currentUser(): PublicAccount | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PublicAccount) : null;
  } catch {
    return null;
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function updateProfile(patch: Partial<Pick<Account, 'name'>>): Promise<PublicAccount | null> {
  const user = currentUser();
  if (!user) return null;
  const account = await readAccount(user.email);
  if (!account) return null;
  const next: Account = { ...account, ...patch };
  await writeAccount(next);
  setSession(next);
  return publicAccount(next);
}

/* ------------------------------------------------------------- sync files */

export interface SyncFile {
  format: 'dannz-sync';
  version: 1;
  exportedAt: string;
  account: PublicAccount;
  settings: Record<string, unknown>;
  presets: unknown[];
}

export async function exportSyncFile(account: PublicAccount): Promise<SyncFile> {
  const [theme, lang, presets] = await Promise.all([
    storage.getSetting('theme'),
    storage.getSetting('lang'),
    storage.getSetting('presets'),
  ]);
  return {
    format: 'dannz-sync',
    version: 1,
    exportedAt: new Date().toISOString(),
    account,
    settings: { theme, lang },
    presets: Array.isArray(presets) ? presets : [],
  };
}

export async function importSyncFile(file: File): Promise<PublicAccount> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SyncFile;
  if (!parsed || parsed.format !== 'dannz-sync' || !parsed.account?.email) {
    throw new Error('auth.syncFail');
  }
  for (const [key, value] of Object.entries(parsed.settings || {})) {
    await storage.saveSetting(key, value);
  }
  if (parsed.presets?.length) {
    await storage.saveSetting('presets', parsed.presets);
  }
  return parsed.account;
}

/** Wipe every local store (settings, images, results, history). */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.clear('settings'),
    db.clear('images'),
    db.clear('results'),
    db.clear('history'),
  ]);
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}
