/**
 * Encryption of the store credentials kept in the database.
 *
 * Shopify's own hosting guidance is explicit about this: "apps should encrypt
 * the access tokens in their storage to prevent unwanted access to shop data,
 * in case their database is compromised". On a laptop the database is a file
 * next to the source; on a host it is a managed Postgres with backups, log
 * drains and a connection string that travels through a dashboard. A token in
 * there is a key to the merchant's store, and it must not be readable by
 * whoever ends up holding a dump of it.
 *
 * AES-256-GCM, from Node's own crypto — authenticated, so a tampered value
 * fails to open instead of decrypting into something else. The key is
 * `DVFLY_TOKEN_KEY` (32 bytes, base64), and it lives with the other secrets:
 * in the host's environment, never in the database it protects.
 *
 * Two compatibility rules, both deliberate:
 *
 *   - A value that is not sealed (no `dvf1.` prefix) is returned as it is.
 *     Databases that existed before this module keep working, and a row
 *     re-sealed on the next install.
 *   - Without a key, sealing is a no-op. Development stays frictionless; in
 *     production the app refuses to boot without one (see config.server.ts),
 *     so "no key" can never silently mean "no encryption" on a host.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { config } from './config.server.ts';

const PREFIX = 'dvf1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer | null {
  const raw = config.tokenKey;
  if (!raw) return null;
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) {
    throw new Error(
      'DVFLY_TOKEN_KEY precisa ser uma chave de 32 bytes em base64 — ' +
        'gere uma com `npm run gerar-chave` e guarde no ambiente do servidor.',
    );
  }
  return bytes;
}

/** True when the value carries this module's envelope. */
export function isSealed(value: string): boolean {
  return value.startsWith(`${PREFIX}.`);
}

/** Encrypts a secret for storage. Returns it unchanged when there is no key. */
export function seal(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const secret = key();
  if (!secret || isSealed(value)) return value;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, secret, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join('.');
}

/**
 * Decrypts a stored secret. A value stored before encryption existed comes
 * back as it is; a sealed value with no key, or with the wrong one, throws —
 * failing loudly beats acting on a secret we could not read.
 */
export function open(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!isSealed(value)) return value;
  const secret = key();
  if (!secret) {
    throw new Error(
      'O banco tem credenciais criptografadas e DVFLY_TOKEN_KEY não está no ambiente. ' +
        'Sem a chave o app não consegue falar com as lojas.',
    );
  }
  const [, iv, tag, body] = value.split('.');
  try {
    const decipher = createDecipheriv(ALGORITHM, secret, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(
      'Não foi possível decifrar a credencial de uma loja: a DVFLY_TOKEN_KEY do ambiente ' +
        'não é a mesma que criptografou este banco.',
    );
  }
}
