/**
 * Prints a fresh DVFLY_TOKEN_KEY (`npm run gerar-chave`).
 *
 * 32 random bytes in base64: the key that encrypts each store's access token in
 * the database (app/app/lib/secrets.server.ts). It is generated once per
 * installation, stored in the host's environment, and never committed — losing
 * it means every store has to open the app again to mint a new token.
 */
import { randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('base64');

console.log('');
console.log('  DVFLY_TOKEN_KEY=' + key);
console.log('');
console.log('  Guarde esta linha no painel do servidor (Vercel: Settings → Environment Variables;');
console.log('  VM: o arquivo .env ao lado do docker-compose.yml). Ela criptografa o acesso às');
console.log('  suas lojas dentro do banco.');
console.log('');
console.log('  Trocar a chave depois obriga cada loja a abrir o app de novo para renovar o acesso.');
console.log('');
