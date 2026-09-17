/**
 * The access key, and the counting that stops someone guessing it.
 *
 * Pure on purpose — no database, no configuration, no request. What decides
 * whether a store gets in is small enough to be read in one sitting and tested
 * without a server, and the server module beside this one (`access.server.ts`)
 * is what talks to the world.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** Where a store that has not been unlocked is sent. */
export const UNLOCK_PATH = '/liberar';

/** Wrong tries before the store is made to wait. */
export const MAX_TRIES = 5;

/** How long the wait lasts. */
export const BLOCK_MS = 5 * 60 * 1000;

/**
 * Same key?
 *
 * Both sides are hashed first for two reasons: `timingSafeEqual` throws on
 * lengths that differ (and the throw itself would leak the length), and
 * comparing digests means the time this takes says nothing about how much of
 * the key was right.
 */
export function keyMatches(typed: string, expected: string): boolean {
  if (!expected) return false;
  const a = createHash('sha256').update(typed, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

interface Attempt {
  count: number;
  blockedUntil: number;
}

/**
 * Wrong tries per store, in memory.
 *
 * Deliberately not in the database: this is a brake, not a record. It resets
 * when the app restarts, which is fine — five tries every few minutes is
 * nowhere near enough to find a key, and nobody should be locked out forever
 * by a counter that outlives the mistake.
 */
export class AttemptLimiter {
  private readonly attempts = new Map<string, Attempt>();
  private readonly maxTries: number;
  private readonly blockMs: number;

  // Written out instead of as constructor parameter properties: Node runs this
  // file by stripping the types, and that shorthand is the one piece of
  // TypeScript stripping cannot do (it emits code, not just deletions).
  constructor(maxTries: number = MAX_TRIES, blockMs: number = BLOCK_MS) {
    this.maxTries = maxTries;
    this.blockMs = blockMs;
  }

  /** Milliseconds this store still has to wait; 0 when it may try. */
  blockedFor(shop: string, now: number = Date.now()): number {
    const attempt = this.attempts.get(shop);
    if (!attempt) return 0;
    const left = attempt.blockedUntil - now;
    if (left <= 0) {
      // The wait is over: the slate is clean, not "one try left".
      if (attempt.blockedUntil > 0) this.attempts.delete(shop);
      return 0;
    }
    return left;
  }

  /** Counts a wrong key. Returns the wait it just caused, in milliseconds. */
  fail(shop: string, now: number = Date.now()): number {
    const attempt = this.attempts.get(shop) ?? { count: 0, blockedUntil: 0 };
    attempt.count += 1;
    if (attempt.count >= this.maxTries) {
      attempt.blockedUntil = now + this.blockMs;
      attempt.count = 0;
    }
    this.attempts.set(shop, attempt);
    return Math.max(0, attempt.blockedUntil - now);
  }

  /** The right key was typed. */
  clear(shop: string): void {
    this.attempts.delete(shop);
  }

  /** Tries left before the wait, for the message on screen. */
  triesLeft(shop: string): number {
    const attempt = this.attempts.get(shop);
    return this.maxTries - (attempt?.count ?? 0);
  }
}

/** "5 minutos", "40 segundos" — for a message a person reads. */
export function waitLabel(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}
