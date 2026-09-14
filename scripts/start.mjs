/**
 * One command to bring D&VFly up: dev server + public tunnel, together.
 *
 * This exists because the manual routine — start the server in one window,
 * the tunnel in another, fish the URL out of the tunnel's log, paste it into
 * Shopify — proved to be where every session stumbled. The person running
 * this project should double-click one file and read one line.
 *
 * What it does, in order:
 *   1. Makes sure app/.env carries the app credentials (asks once if not —
 *      the secret cannot live in the repository; GitHub rightly blocks it).
 *   2. Starts the dev server and waits until it answers.
 *   3. Starts a Cloudflare quick tunnel, extracts its URL, prints it big and
 *      copies it to the clipboard on Windows.
 *   4. Keeps both alive; Ctrl+C (or closing the window) stops both.
 */

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, 'app', '.env');
const isWindows = process.platform === 'win32';

const log = (line) => console.log(`  ${line}`);
const banner = (lines) => {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  console.log('\n  ┌' + '─'.repeat(width) + '┐');
  for (const line of lines) console.log('  │  ' + line.padEnd(width - 2) + '│');
  console.log('  └' + '─'.repeat(width) + '┘\n');
};

// ---- 1. credentials -------------------------------------------------------

function envValue(content, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\r\\n]*)"?`, 'm').exec(content);
  return match?.[1] ?? '';
}

async function ensureCredentials() {
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (envValue(content, 'SHOPIFY_CLIENT_ID') && envValue(content, 'SHOPIFY_CLIENT_SECRET')) {
    return;
  }
  console.log('\n  Falta a credencial do app (uma vez só — fica gravada nesta máquina).');
  console.log('  Ela está na Shopify em: Dev Dashboard → seu app → Client credentials.\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const clientId = (await rl.question('  Client ID: ')).trim();
  const secret = (await rl.question('  Client secret (shpss_…): ')).trim();
  rl.close();
  if (!clientId || !secret) {
    console.log('\n  Sem credencial o app sobe mesmo assim, mas a loja não se registra sozinha.');
    return;
  }
  appendFileSync(envPath, `\nSHOPIFY_CLIENT_ID="${clientId}"\nSHOPIFY_CLIENT_SECRET="${secret}"\n`);
  log('credencial gravada em app/.env ✓');
}

// ---- 2. dev server --------------------------------------------------------

function startServer() {
  return new Promise((resolve) => {
    const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], {
      cwd: root,
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let port = null;
    const sniff = (chunk) => {
      const text = chunk.toString();
      const match = /localhost:(\d+)/.exec(text);
      if (match && !port) {
        port = match[1];
        log(`servidor de pé em http://localhost:${port} ✓`);
        resolve({ child, port });
      }
      if (/error/i.test(text)) process.stdout.write(text);
    };
    child.stdout.on('data', sniff);
    child.stderr.on('data', sniff);
    child.on('exit', (code) => {
      if (!port) {
        console.error(`\n  O servidor morreu antes de subir (código ${code}).`);
        console.error('  Roda "npm run dev" sozinho para ver o erro completo.');
        process.exit(1);
      }
    });
  });
}

// ---- 3. tunnel ------------------------------------------------------------

function startTunnel(port) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve({ child: null, url: null });
      return;
    }
    let url = null;
    const sniff = (chunk) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (match && !url) {
        url = match[0];
        resolve({ child, url });
      }
    };
    child.stdout.on('data', sniff);
    child.stderr.on('data', sniff);
    child.on('error', () => resolve({ child: null, url: null }));
    child.on('exit', () => {
      if (!url) resolve({ child: null, url: null });
    });
    setTimeout(() => {
      if (!url) resolve({ child, url: null });
    }, 30000);
  });
}

// ---- run ------------------------------------------------------------------

await ensureCredentials();

console.log('');
log('subindo o servidor…');
const server = await startServer();

log('abrindo o túnel…');
const tunnel = await startTunnel(server.port);

if (tunnel.url) {
  if (isWindows) {
    // Straight to the clipboard, so "colar no App URL" is literally colar.
    try {
      const clip = spawnSync('clip', { input: tunnel.url, shell: true });
      if (clip.status === 0) log('endereço copiado para a área de transferência ✓');
    } catch {
      /* clipboard is a convenience, never a failure */
    }
  }
  banner([
    'DVFly no ar!',
    '',
    `Local:    http://localhost:${server.port}`,
    `Público:  ${tunnel.url}`,
    '',
    'Se o endereço público MUDOU desde a última vez,',
    'cola ele no App URL do app na Shopify (já está copiado).',
    '',
    'Deixa esta janela aberta. Ctrl+C encerra tudo.',
  ]);
} else {
  banner([
    'DVFly no ar (só local)!',
    '',
    `Local: http://localhost:${server.port}`,
    '',
    'O túnel não subiu — sem ele o app não abre dentro da Shopify.',
    'Instala com:  winget install --id Cloudflare.cloudflared -e',
    'e roda este arquivo de novo.',
  ]);
}

const stop = () => {
  server.child.kill();
  tunnel.child?.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
