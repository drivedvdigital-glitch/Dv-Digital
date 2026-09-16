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

/** A real filesystem path — what express.static needs. */
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const port = Number(process.env.PORT ?? 3000);

// A URL, not a path: on Windows `import('C:\\dvfly\\app\\build\\...')` dies with
// ERR_UNSUPPORTED_ESM_URL_SCHEME ("Received protocol 'c:'"), because the ESM
// loader reads the drive letter as a scheme. Linux never shows this — an
// absolute POSIX path happens to be accepted — so it is the kind of line that
// only fails on the machine that serves the merchant.
const build = await import(new URL('./build/server/index.js', import.meta.url).href);

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
