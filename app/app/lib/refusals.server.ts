/**
 * The last ID tokens this server refused, kept in memory to answer one
 * question: **is the key I just pasted the one Shopify signed with?**
 *
 * Why this exists. Getting a store's app running means copying a client secret
 * from the Dev Dashboard into the server, and the only thing that ever told
 * anyone whether the copy was right was opening the app in the admin and
 * reading a 401. With three apps in three organizations, all carrying the same
 * name, the wrong secret is one click away — and every wrong attempt cost a
 * full round of "paste, restart, open the admin, read the error". A key can be
 * proven against a token Shopify actually signed; there was just never a token
 * within reach when the key was being pasted. Now there is.
 *
 * What is kept: the refused token itself, in memory only, for a few minutes.
 * The exposure is small and bounded — the token is already a minute from
 * expiring when it arrives, it never reaches the disk, never leaves the
 * process, and is never part of any response. It is worth stating plainly
 * because the alternative considered was writing it to the log file, which
 * would have put it on disk, in a file people paste into chats.
 */
import { secretSignsToken } from '../../../packages/shopify/src/session.ts';

interface Refusal {
  /** The app the token said it was for. */
  aud: string;
  /** The shop, when the token named one — for the screen, not for trust. */
  loja: string | null;
  token: string;
  at: number;
}

/** Long enough to paste a key after seeing the error; short enough to forget. */
const TTL_MS = 30 * 60 * 1000;
/** One per app is what matters; a few more cost nothing. */
const MAX = 8;

const refusals: Refusal[] = [];

const fresh = (now: number): Refusal[] => refusals.filter((r) => now - r.at < TTL_MS);

/** Records a token this server could not verify. Called on the refusal path. */
export function rememberRefusal(token: string, aud: string | null, loja: string | null, now: number): void {
  if (!aud) return;
  const kept = fresh(now);
  // One entry per app: the newest refusal is the one worth testing against.
  const semEsseApp = kept.filter((r) => r.aud !== aud);
  refusals.length = 0;
  refusals.push(...semEsseApp.slice(-(MAX - 1)), { aud, loja, token, at: now });
}

export interface KeyVerdict {
  /** null when no refusal for this app is remembered — nothing to test against. */
  assina: boolean | null;
  loja: string | null;
  /** Minutes since that refusal, for the operator to know it is the right one. */
  minutos: number | null;
}

/**
 * Does `clientSecret` sign the most recent token refused for `aud`?
 *
 * `null` means "no token to test against" — not "no". The difference matters:
 * the first is "open the app in the admin once, then ask again", the second is
 * "this key is wrong".
 */
export function keyVerdict(aud: string, clientSecret: string, now: number): KeyVerdict {
  const alvo = fresh(now)
    .filter((r) => r.aud === aud)
    .at(-1);
  if (!alvo) return { assina: null, loja: null, minutos: null };
  return {
    assina: secretSignsToken(alvo.token, clientSecret),
    loja: alvo.loja,
    minutos: Math.floor((now - alvo.at) / 60000),
  };
}

/** For tests: nothing else should ever need to forget. */
export function forgetRefusals(): void {
  refusals.length = 0;
}
