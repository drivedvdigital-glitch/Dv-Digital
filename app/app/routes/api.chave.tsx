import type { ActionFunctionArgs } from 'react-router';

import { AttemptLimiter, keyMatches, waitLabel } from '../lib/access.ts';
import { config } from '../lib/config.server.ts';
import { keyVerdict } from '../lib/refusals.server.ts';
import { appCredentialsList } from '../lib/shopify.server.ts';
import { secretFingerprint } from '../lib/token-refusal.ts';

/**
 * "A chave guardada aqui é a que a Shopify usou para assinar?"
 *
 * The one question that could never be answered before the fact. Bringing a
 * store online means copying a client secret out of the Dev Dashboard, and the
 * only thing that ever judged the copy was opening the app in the admin and
 * reading a 401 — with three apps carrying the same name in three
 * organizations, the wrong secret is one click away, and each wrong try cost a
 * full round trip. The server already held the proof: a token Shopify signed,
 * which it had just refused. This route tests keys against it.
 *
 * Three gates, because this one route can say more about the secrets than any
 * other and it is the only one not standing behind a Shopify ID token:
 *
 * 1. **It does not exist from the outside.** Caddy stamps `X-Forwarded-For`
 *    with the real client address on everything it proxies, overwriting what
 *    the caller sent — so the header's presence is proof the request came
 *    through the proxy, and its absence is proof of a direct call to
 *    127.0.0.1, which is exactly how the two VM scripts call it. From outside
 *    the answer is 404, before the password is even looked at: a server with
 *    a key and one without must not be distinguishable from there.
 * 2. **The password is counted**, with the same brake the unlock screen uses.
 *    The first version had none, so the one password that also unlocks every
 *    store was a free guessing target.
 * 3. **No key configured means no answer at all**, rather than an answer to
 *    anyone.
 *
 * POST only, and the password travels in the body. It used to ride in the
 * query string — where Caddy's access log would have written it down in plain
 * text, since that log's filter drops `id_token`, `session` and `hmac`, and
 * knows nothing about `senha`.
 *
 * What a caller who clears all three gates learns: which client ids this
 * server holds (public — they ship in every page's meta tag), the last four
 * characters of each stored secret, and whether a key signs a token refused
 * for that app. It never returns a secret, and never returns a token.
 */

/** Guessing brake. Per process, like the one on the unlock screen. */
const limiter = new AttemptLimiter();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Did this request come through the proxy — that is, from the internet? */
function veioDeFora(request: Request): boolean {
  const encaminhado = request.headers.get('x-forwarded-for');
  if (encaminhado === null) return request.headers.has('x-forwarded-host');
  // Caddy writes the real client address here; a loopback value means the VM
  // itself, which some proxy setups still stamp.
  return !LOOPBACK.has(encaminhado.split(',')[0].trim());
}

export async function action({ request }: ActionFunctionArgs) {
  if (veioDeFora(request)) return new Response('Not Found', { status: 404 });

  const agora = Date.now();
  const espera = limiter.blockedFor('api/chave', agora);
  if (espera > 0) {
    return Response.json({ erro: `Muitas tentativas. Tente de novo em ${waitLabel(espera)}.` }, { status: 429 });
  }

  const form = await request.formData();
  if (!config.accessKey) {
    return Response.json(
      {
        erro:
          'Sem DVFLY_ACCESS_KEY configurada, esta conferência fica desligada — ela só responde a ' +
          'quem sabe a senha de acesso. Defina a senha (senha.ps1) e tente de novo.',
      },
      { status: 503 },
    );
  }
  if (!keyMatches(String(form.get('senha') ?? ''), config.accessKey)) {
    const agoraEspera = limiter.fail('api/chave', agora);
    return Response.json(
      {
        erro:
          agoraEspera > 0
            ? `Senha de acesso incorreta. Agora são ${waitLabel(agoraEspera)} de espera.`
            : 'Senha de acesso incorreta.',
      },
      { status: 403 },
    );
  }
  limiter.clear('api/chave');

  // Uma chave candidata, que ainda NÃO foi gravada: é a diferença entre
  // descobrir o erro antes ou depois. O candidato não é guardado em lugar
  // nenhum — a resposta é um booleano sobre um token que já estava aqui.
  const clientId = String(form.get('clientId') ?? '').trim();
  const chave = String(form.get('chave') ?? '');
  if (clientId && chave) {
    return Response.json({ clientId, ...keyVerdict(clientId, chave, agora) });
  }

  // Sem candidato: o relatório das chaves que este servidor já tem.
  const apps = await appCredentialsList();
  return Response.json({
    apps: apps.map((app) => ({
      clientId: app.clientId,
      fimDaChave: secretFingerprint(app.clientSecret),
      tamanhoDaChave: app.clientSecret.length,
      ...keyVerdict(app.clientId, app.clientSecret, agora),
    })),
  });
}
