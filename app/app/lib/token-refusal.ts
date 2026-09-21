/**
 * What a refused ID token means, said in words that name the repair.
 *
 * `verifySessionToken` answers with one exact word — "assinatura", "aud",
 * "expirado" — and that word is worthless to whoever is looking at the screen.
 * The two refusals a healthy install actually produces have a repair each, and
 * neither is guessable from the word alone:
 *
 *   - "assinatura": the `aud` DID match an app this server holds, so the right
 *     secret was used and it did not match. Somebody rotated the client secret
 *     in the Dev Dashboard (or typed it wrong) and this server still has the
 *     old one.
 *   - "aud": the token belongs to a Shopify app nobody ever told this server
 *     about — a second store installing its own custom app.
 *
 * Telling them apart on screen is the whole point: both look like "the app is
 * broken" and both are one script away from fixed. And both name the app the
 * token came from, because with two apps on one server that is the only fact
 * that separates "the stored secret is stale" from "this store is opening the
 * OTHER app" — two repairs that have nothing to do with each other. The client
 * id is public (it is in every page's meta tag), so naming it costs nothing.
 */
/**
 * The last four characters of a secret — never the secret.
 *
 * Enough to answer "which key was in memory when this failed?" against the
 * same four the VM's own scripts print, and not enough to be worth anything
 * to whoever reads the log. Goes to the server log, never to a screen: the
 * refusal page is public.
 */
export function secretFingerprint(secret: string | null | undefined): string {
  if (!secret || secret.length < 4) return '????';
  return secret.slice(-4);
}

export function tokenRefusalMessage(
  reason: string,
  /** The app the token says it belongs to, read unverified — for the text only. */
  aud: string | null,
  /** The apps this server holds, so an unknown one can be shown against them. */
  conhecidos: string[] = [],
): string {
  const app = aud ? `o app ${aud}` : 'este app';
  switch (reason) {
    case 'assinatura':
      return (
        `ID token recusado: a assinatura não confere. A loja abriu ${app}, e a chave secreta ` +
        `que este servidor guarda para ele não é a que a Shopify usou para assinar. Confira no ` +
        `Dev Dashboard qual app tem esse Client ID — tem que ser o mesmo que o admin abre — e ` +
        `copie a chave secreta DELE. Conserto na VM: rode "adicionar-app", escolha esse app e ` +
        `cole a chave.`
      );
    case 'aud':
      return (
        `ID token recusado: a loja abriu ${app}, que este servidor não conhece. ` +
        (conhecidos.length > 0 ? `Aqui só existem: ${conhecidos.join(', ')}. ` : '') +
        'Conserto na VM: rode "adicionar-app", escolha "um app NOVO" e cole o Client ID e a ' +
        'chave secreta desse app.'
      );
    case 'expirado':
    case 'ainda não válido':
      return (
        `ID token recusado (${reason}). Esse token vale um minuto. Recarregue a página; se continuar, ` +
        'o relógio deste servidor está fora de hora.'
      );
    default:
      return `ID token recusado (${reason}).`;
  }
}
