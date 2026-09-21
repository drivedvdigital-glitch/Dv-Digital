import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

import { keyMatches } from '../lib/access.ts';
import { config } from '../lib/config.server.ts';
import { keyVerdict } from '../lib/refusals.server.ts';
import { appCredentialsList } from '../lib/shopify.server.ts';
import { secretFingerprint } from '../lib/token-refusal.ts';

/**
 * "A chave que está guardada aqui é a que a Shopify usou para assinar?"
 *
 * The one question that could never be answered before the fact. Bringing a
 * store online means copying a client secret out of the Dev Dashboard, and the
 * only thing that ever judged the copy was opening the app in the admin and
 * reading a 401 — with three apps carrying the same name in three
 * organizations, the wrong secret is one click away, and each wrong try cost a
 * full round trip. The server already held the proof: a token Shopify signed,
 * which it had just refused. This route tests the configured keys against it.
 *
 * Not `requireShop`, by design — and that exception is the whole point. This
 * is what you call BECAUSE the token check is failing; gating it behind the
 * token check would make it useless exactly when it is needed. The gate is the
 * access key instead (`DVFLY_ACCESS_KEY`), compared in constant time, and with
 * no key configured the route refuses to answer at all rather than answering
 * to anyone.
 *
 * What it can tell a caller who has the access key: which client ids this
 * server holds (public — they ship in every page's meta tag), the last four
 * characters of each stored secret, and whether each one signs the last token
 * refused for that app. It never returns a secret, and it never returns the
 * token.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const senha = url.searchParams.get('senha') ?? '';

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
  if (!keyMatches(senha, config.accessKey)) {
    return Response.json({ erro: 'Senha de acesso incorreta.' }, { status: 403 });
  }

  const agora = Date.now();
  const apps = await appCredentialsList();
  return Response.json({
    apps: apps.map((app) => {
      const veredito = keyVerdict(app.clientId, app.clientSecret, agora);
      return {
        clientId: app.clientId,
        fimDaChave: secretFingerprint(app.clientSecret),
        tamanhoDaChave: app.clientSecret.length,
        ...veredito,
      };
    }),
  });
}

/**
 * O mesmo veredito, para uma chave que ainda NÃO foi gravada.
 *
 * É a diferença entre descobrir o erro antes ou depois: com esta, o script que
 * acrescenta um app conta se a chave serve no instante em que ela é colada, e
 * uma chave errada nunca chega ao `.env` nem custa um reinício. O candidato
 * chega por `POST` em 127.0.0.1 e não é guardado em lugar nenhum — a resposta
 * é um booleano sobre um token que este servidor já tinha.
 */
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (!config.accessKey) {
    return Response.json({ erro: 'Sem DVFLY_ACCESS_KEY, a conferência de chave fica desligada.' }, { status: 503 });
  }
  if (!keyMatches(String(form.get('senha') ?? ''), config.accessKey)) {
    return Response.json({ erro: 'Senha de acesso incorreta.' }, { status: 403 });
  }
  const clientId = String(form.get('clientId') ?? '').trim();
  const chave = String(form.get('chave') ?? '');
  if (!clientId || !chave) {
    return Response.json({ erro: 'Faltou clientId ou chave.' }, { status: 400 });
  }
  return Response.json({ clientId, ...keyVerdict(clientId, chave, Date.now()) });
}
