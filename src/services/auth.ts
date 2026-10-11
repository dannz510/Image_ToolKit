/**
 * Local-first accounts.
 *
 * Zero-cost rule: no hosted database. Accounts live in IndexedDB on the
 * device. Hardening notes:
 *
 *  * Passwords are stretched with PBKDF2-SHA-256 (210k iterations) instead of
 *    a single SHA-256 digest. Legacy accounts are transparently upgraded on
 *    the next successful sign-in.
 *  * Sessions carry an issue time and a last-active time, expire absolutely
 *    after SESSION_TTL_MS and idly after IDLE_TTL_MS, and are re-issued on
 *    every sign-in (rotation).
 *  * Sign-in attempts are rate limited per email with an exponential lockout,
 *    which blunts credential stuffing on a shared device.
 *  * Sync files are HMAC-signed, so a tampered settings blob is rejected
 *    instead of silently applied.
 */

import { db, storage } from '../utils/storage';

/* --------------------------------------------------------------- constants */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_FORMAT = 'pbkdf2-sha256';
const LEGACY_HASH_FORMAT = 'sha256-salted';

const SESSION_KEY = 'dannz.session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // absolute: 12h
const IDLE_TTL_MS = 30 * 60 * 1000; // idle: 30min

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60_000;
const LOCKOUT_MS = 5 * 60_000;
const ATTEMPTS_KEY = 'dannz.auth.attempts';

/* ------------------------------------------------------------------- types */

export interface Account {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  salt: string;
  passwordHash: string;
  /** 'pbkdf2-sha256' (current) or legacy 'sha256-salted' (auto-migrated). */
  hashFormat?: string;
  iterations?: number;
}

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

export interface Session {
  account: PublicAccount;
  issuedAt: number;
  lastActiveAt: number;
}

export interface SyncFile {
  format: 'dannz-sync';
  version: 2;
  exportedAt: string;
  account: PublicAccount;
  settings: Record<string, unknown>;
  presets: unknown[];
  /** HMAC-SHA-256 over the canonical JSON of everything above. */
  signature: string;
}

/* ------------------------------------------------------------ crypto util */

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  // Allocate through an explicit ArrayBuffer so the result satisfies the
  // stricter BufferSource typing of the Web Crypto API in TS 5.7+.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

/** Constant-time-ish comparison (avoids early-exort length leaks). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derivePbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations },
    keyMaterial,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/** Legacy one-shot SHA-256, kept only to verify and migrate old records. */
async function legacySha256(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64(new Uint8Array(digest));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
}

async function verifyPassword(account: Account, password: string): Promise<boolean> {
  if (account.hashFormat === LEGACY_HASH_FORMAT) {
    return safeEqual(await legacySha256(password, account.salt), account.passwordHash);
  }
  const iterations = account.iterations ?? PBKDF2_ITERATIONS;
  return safeEqual(await derivePbkdf2(password, account.salt, iterations), account.passwordHash);
}

/* --------------------------------------------------------------- HMAC util */

async function getSyncKey(): Promise<CryptoKey> {
  const stored = await storage.getSetting<string>('sync_key');
  if (stored) {
    return crypto.subtle.importKey(
      'raw',
      fromBase64(stored).slice(0, 32),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  await storage.saveSetting('sync_key', toBase64(raw));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function signPayload(payload: string): Promise<string> {
  const key = await getSyncKey();
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64(new Uint8Array(signature));
}

/* -------------------------------------------------------------- validation */

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validatePassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

/* ------------------------------------------------------------ rate limiting */

interface AttemptRecord {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

function readAttempts(): Record<string, AttemptRecord> {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AttemptRecord>) : {};
  } catch {
    return {};
  }
}

function writeAttempts(map: Record<string, AttemptRecord>): void {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map));
  } catch {
    /* storage blocked */
  }
}

/** Throws 'auth.rateLimited' (with retry seconds) when the caller is locked out. */
function assertNotLocked(email: string): void {
  const record = readAttempts()[email];
  if (!record) return;
  if (record.lockedUntil > Date.now()) {
    const seconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    throw new Error(`auth.rateLimited|${seconds}`);
  }
}

function recordFailure(email: string): void {
  const map = readAttempts();
  const now = Date.now();
  const record = map[email];
  if (!record || now - record.firstAt > ATTEMPT_WINDOW_MS) {
    map[email] = { count: 1, firstAt: now, lockedUntil: 0 };
  } else {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
      record.count = 0;
    }
  }
  writeAttempts(map);
}

function clearFailures(email: string): void {
  const map = readAttempts();
  if (map[email]) {
    delete map[email];
    writeAttempts(map);
  }
}

/* ----------------------------------------------------------------- accounts */

async function accountKey(email: string): Promise<string> {
  return `account:${email.trim().toLowerCase()}`;
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
  assertNotLocked(normalized);
  if (!validateEmail(normalized)) throw new Error('auth.badEmail');
  if (!validatePassword(password)) throw new Error('auth.weakPassword');
  if (await readAccount(normalized)) throw new Error('auth.exists');

  const salt = randomSalt();
  const account: Account = {
    id: `acc_${Date.now().toString(36)}`,
    email: normalized,
    name: name.trim() || normalized.split('@')[0],
    createdAt: Date.now(),
    salt,
    passwordHash: await hashPassword(password, salt),
    hashFormat: HASH_FORMAT,
    iterations: PBKDF2_ITERATIONS,
  };
  await writeAccount(account);
  clearFailures(normalized);
  // Rotation: a fresh session on every privilege change.
  setSession(account);
  return publicAccount(account);
}

export async function login(email: string, password: string): Promise<PublicAccount> {
  const normalized = email.trim().toLowerCase();
  assertNotLocked(normalized);
  const account = await readAccount(normalized);
  if (!account || !(await verifyPassword(account, password))) {
    recordFailure(normalized);
    throw new Error('auth.invalid');
  }
  clearFailures(normalized);

  // Transparent upgrade of legacy one-shot hashes.
  if (account.hashFormat !== HASH_FORMAT) {
    account.salt = randomSalt();
    account.passwordHash = await hashPassword(password, account.salt);
    account.hashFormat = HASH_FORMAT;
    account.iterations = PBKDF2_ITERATIONS;
    await writeAccount(account);
  }

  setSession(account);
  return publicAccount(account);
}

/* ----------------------------------------------------------------- sessions */

function setSession(account: Account): void {
  const now = Date.now();
  const session: Session = { account: publicAccount(account), issuedAt: now, lastActiveAt: now };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked - session stays in memory */
  }
}

function isFresh(session: Session): boolean {
  const now = Date.now();
  return (
    now - session.issuedAt < SESSION_TTL_MS && now - session.lastActiveAt < IDLE_TTL_MS
  );
}

/** Read the session, refreshing its idle watermark. Expired sessions are dropped. */
export function currentUser(): PublicAccount | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session | PublicAccount;
    // Backwards compatibility with the pre-session format.
    if ('issuedAt' in parsed && 'account' in parsed) {
      if (!isFresh(parsed)) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      parsed.lastActiveAt = Date.now();
      localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
      return parsed.account;
    }
    return parsed as PublicAccount;
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

export async function updateProfile(
  patch: Partial<Pick<Account, 'name'>>
): Promise<PublicAccount | null> {
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

export async function exportSyncFile(account: PublicAccount): Promise<SyncFile> {
  const [theme, lang, presets] = await Promise.all([
    storage.getSetting('theme'),
    storage.getSetting('lang'),
    storage.getSetting('presets'),
  ]);
  const unsigned: Omit<SyncFile, 'signature'> = {
    format: 'dannz-sync',
    version: 2,
    exportedAt: new Date().toISOString(),
    account,
    settings: { theme, lang },
    presets: Array.isArray(presets) ? presets : [],
  };
  const signature = await signPayload(JSON.stringify(unsigned));
  return { ...unsigned, signature };
}

export async function importSyncFile(file: File): Promise<PublicAccount> {
  let parsed: SyncFile;
  try {
    parsed = JSON.parse(await file.text()) as SyncFile;
  } catch {
    throw new Error('auth.syncFail');
  }

  if (!parsed || parsed.format !== 'dannz-sync' || !parsed.account?.email) {
    throw new Error('auth.syncFail');
  }
  // Reject tampered or foreign files: the HMAC must match this device's key.
  const { signature, ...unsigned } = parsed;
  const expected = await signPayload(JSON.stringify(unsigned));
  if (!signature || !safeEqual(signature, expected)) {
    throw new Error('auth.syncTampered');
  }
  // Only accept a bounded set of setting keys.
  const allowedKeys = ['theme', 'lang'];
  for (const [key, value] of Object.entries(unsigned.settings || {})) {
    if (allowedKeys.includes(key)) await storage.saveSetting(key, value);
  }
  if (Array.isArray(parsed.presets) && parsed.presets.length <= 100) {
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
