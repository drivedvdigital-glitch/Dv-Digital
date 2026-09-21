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
 * broken" and both are one script away from fixed. The client id is public
 * (it is in every page's meta tag), so naming it costs nothing.
 */
export function tokenRefusalMessage(reason: string, clientId: string | null): string {
  const app = clientId ? `o app ${clientId}` : 'este app';
  switch (reason) {
    case 'assinatura':
      return (
        `ID token recusado: a assinatura não confere. A chave secreta que este servidor guarda para ` +
        `${app} não é a que está hoje no Dev Dashboard da Shopify — ela foi girada ali, ou foi digitada ` +
        `errada. Conserto na VM: rode "adicionar-app" com ESTE mesmo Client ID e a chave secreta atual.`
      );
    case 'aud':
      return (
        'ID token recusado: ele foi emitido para um app da Shopify que este servidor não conhece. ' +
        'Conserto na VM: rode "adicionar-app" e cole o Client ID e a chave secreta desse app.'
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
