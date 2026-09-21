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
 * WHO CAN WRITE HERE, and why the shape below is what it is. The write happens
 * on the refusal path of `requireShop`, which is open to the internet, and
 * everything a token says before verification is just bytes a stranger chose.
 * The first version kept ONE token per app and let the newest win, which handed
 * any passer-by two tricks: replace the genuine refusal with a forged token so
 * the CORRECT key reads "errada", or flood made-up `aud`s until every real
 * memory is evicted. Both turn the tool that was meant to end a wild goose
 * chase into the thing that starts one. So:
 *
 *   - only an `aud` this server actually holds is remembered (the caller
 *     passes the app it resolved, never the token's own claim), which bounds
 *     the whole store to one small ring per configured app;
 *   - a token that could not plausibly have just come from Shopify — no
 *     `dest` on a myshopify domain, no `exp` near now — is not kept;
 *   - a ring per app instead of a single slot, and the verdict is "does this
 *     key sign ANY of them". A positive answer cannot be forged: producing a
 *     token the right key signs requires the right key. Noise can be added; it
 *     cannot turn a yes into a no while the genuine refusal is still in the
 *     ring.
 *
 * A negative answer is therefore weaker than a positive one, and the callers
 * say so: they report how many tokens were tested.
 *
 * What is kept: the refused tokens themselves, in memory only, for half an
 * hour. They are already a minute from expiring when they arrive, never reach
 * the disk, never leave the process, and are never part of any response.
 */
import { destinationOf, secretSignsToken, unverifiedNumber } from '../../../packages/shopify/src/session.ts';

interface Refusal {
  /** The configured app this token was checked against — never the raw claim. */
  aud: string;
  /** The shop the token named. For the screen, never for trust. */
  loja: string | null;
  token: string;
  at: number;
}

/** Long enough to paste a key after seeing the error; short enough to forget. */
const TTL_MS = 30 * 60 * 1000;
/** Tokens kept per app. Noise lands beside the genuine one instead of on it. */
const POR_APP = 8;

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
/** A Shopify ID token lives one minute; this is slack, not a security check. */
const EXP_SLACK_S = 10 * 60;

const refusals: Refusal[] = [];

const vivos = (now: number): Refusal[] => refusals.filter((r) => now - r.at < TTL_MS);

/**
 * Records a token this server could not verify, for an app it holds.
 *
 * `aud` is the resolved app — what the caller matched the token against — not
 * what the token claims. A token for an app nobody configured has no key to be
 * tested against anyway, and accepting one would mean strangers deciding how
 * much room the real ones get.
 */
export function rememberRefusal(token: string, aud: string, now: number): void {
  if (!aud) return;
  const loja = destinationOf(token);
  if (!loja || !SHOP_DOMAIN.test(loja)) return;
  const exp = unverifiedNumber(token, 'exp');
  // Neither a token minted long ago nor one dated into next year is a token the
  // admin just sent. Cheap, and it costs a forger nothing to satisfy — which is
  // why it is a filter and not a defence.
  if (exp === null || Math.abs(exp - now / 1000) > EXP_SLACK_S) return;

  const kept = vivos(now).filter((r) => !(r.aud === aud && r.token === token));
  const doApp = kept.filter((r) => r.aud === aud).slice(-(POR_APP - 1));
  const outros = kept.filter((r) => r.aud !== aud);
  refusals.length = 0;
  refusals.push(...outros, ...doApp, { aud, loja, token, at: now });
}

export interface KeyVerdict {
  /**
   * `true` is conclusive: only the real secret signs a token Shopify signed.
   * `false` means none of the remembered tokens matched — read it together
   * with `testados`. `null` means there was nothing to test against, which is
   * a different answer from "no".
   */
  assina: boolean | null;
  loja: string | null;
  /** Minutes since the token that answered, so the operator knows which one. */
  minutos: number | null;
  /** How many tokens this verdict looked at. */
  testados: number;
}

/** Does `clientSecret` sign any token this server refused for `aud`? */
export function keyVerdict(aud: string, clientSecret: string, now: number): KeyVerdict {
  const alvos = vivos(now).filter((r) => r.aud === aud);
  if (alvos.length === 0) return { assina: null, loja: null, minutos: null, testados: 0 };
  const casou = alvos.find((r) => secretSignsToken(r.token, clientSecret));
  const qual = casou ?? alvos[alvos.length - 1];
  return {
    assina: Boolean(casou),
    loja: qual.loja,
    minutos: Math.floor((now - qual.at) / 60000),
    testados: alvos.length,
  };
}

/** For tests: nothing else should ever need to forget. */
export function forgetRefusals(): void {
  refusals.length = 0;
}
