/**
 * Production server (`npm start`).
 *
 * The stock `react-router-serve` would do, except for two things a real host
 * needs and it cannot be told:
 *
 *   - `trust proxy`: behind Cloudflare, Fly, Render or any TLS-terminating
 *     proxy the process sees plain `http://` while the browser sends
 *     `Origin: https://…`. React Router's CSRF check compares the two and
 *     answers 400 to every Salvar / Publicar — the failure already paid on the
 *     dev tunnel, guaranteed on the real host. Trusting the proxy's
 *     `X-Forwarded-Proto` makes the server see what the browser sees.
 *   - the access log prints the path only: the first document load carries
 *     `?id_token=…`, and a token, however short-lived, has no place in a log.
 */
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from '@react-router/express';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const build = await import(here('./build/server/index.js'));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use('/assets', express.static(here('./build/client/assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(here('./build/client'), { maxAge: '1h' }));

morgan.token('path', (req) => (req.originalUrl ?? req.url ?? '').split('?')[0]);
app.use(morgan(':method :path :status :res[content-length] - :response-time ms'));

app.all('*', createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = process.env.HOST ? app.listen(port, process.env.HOST) : app.listen(port);
server.on('listening', () => console.log(`[dvfly] http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close());
}
