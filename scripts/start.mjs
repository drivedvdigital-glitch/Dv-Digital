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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts the server with its output going straight to this window — no pipe
 * sniffing, which proved unreliable on Windows — and then knocks on the ports
 * Vite uses until one answers. What answers is what gets tunnelled.
 */
const PORTS = [5173, 5174, 5175, 5176, 5177];

async function anyPortAlive() {
  for (const port of PORTS) {
    try {
      const response = await fetch(`http://localhost:${port}/app`, { redirect: 'manual' });
      if (response.status > 0) return port;
    } catch {
      /* fechada */
    }
  }
  return null;
}

async function startServer() {
  // A leftover window would answer first and the tunnel would point at stale
  // code. Refusing beats silently serving yesterday's app.
  const busy = await anyPortAlive();
  if (busy) {
    banner([
      'Já existe um DVFly rodando nesta máquina!',
      '',
      `Alguma janela antiga está segurando a porta ${busy}.`,
      'Fecha as outras janelas do DVFly (e de "npm run dev")',
      'e dá duplo clique no INICIAR-DVFLY.cmd de novo.',
    ]);
    process.exit(1);
  }

  const child = spawn('npm run dev', { cwd: root, shell: true, stdio: 'inherit' });
  let dead = false;
  child.on('exit', () => {
    dead = true;
  });

  for (let attempt = 0; attempt < 120; attempt++) {
    if (dead) {
      console.error('\n  O servidor morreu antes de subir — o erro está logo acima.');
      process.exit(1);
    }
    const port = await anyPortAlive();
    if (port) {
      log(`servidor de pé em http://localhost:${port} ✓`);
      return { child, port };
    }
    await sleep(1000);
  }
  console.error('\n  O servidor não respondeu em 2 minutos. Manda um print desta janela.');
  process.exit(1);
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
