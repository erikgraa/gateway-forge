import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetUrl = process.argv[2] ?? 'https://gateway-forge.graa.dev/';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), 'gateway-forge-screenshots-'));
const outputDir = join(root, 'docs', 'screenshots');

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

const executable = chromePath();
if (!executable) throw new Error('Chrome or Chromium was not found. Set CHROME_PATH to its executable.');

const browser = spawn(executable, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  targetUrl
], { stdio: 'ignore' });

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function waitForPage() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready.');
}

const socket = new WebSocket(await waitForPage());
await new Promise((resolveReady, reject) => {
  socket.addEventListener('open', resolveReady, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, reject) => pending.set(id, { resolve: resolvePromise, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForApp() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('#app')?.innerText.trim()`)) return;
    await sleep(100);
  }
  throw new Error('Gateway Forge did not render.');
}

async function viewport(width = 1480, height = 900) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
}

async function capture(name, height = 900) {
  await viewport(1480, height);
  await sleep(250);
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(join(outputDir, name), Buffer.from(data, 'base64'));
  console.log(`Captured ${name}`);
}

async function reset(theme = 'dark') {
  await evaluate(`localStorage.clear(); localStorage.setItem('gateway-forge.theme', '${theme}'); true;`);
  await command('Page.navigate', { url: targetUrl });
  await sleep(700);
  await waitForApp();
  await evaluate(`document.querySelector('.center')?.scrollTo(0, 0)`);
}

async function clickByText(text) {
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.includes(${JSON.stringify(text)})); button?.click(); return !!button; })()`);
  if (!clicked) throw new Error(`Could not find button containing "${text}".`);
  await sleep(180);
}

try {
  await mkdir(outputDir, { recursive: true });
  await command('Page.enable');
  await command('Runtime.enable');
  await viewport();
  await reset('dark');
  await clickByText('Network & deployStep 2');
  await capture('builder-dark.png');

  await reset('light');
  await clickByText('Network & deployStep 2');
  await capture('builder-light.png');

  await reset('dark');
  await clickByText('AuthenticationStep 7');
  await capture('radius.png');

  await reset('dark');
  await clickByText('JSON');
  await capture('json.png');

  await reset('dark');
  await clickByText('Search settings…');
  await capture('palette.png');

  await reset('dark');
  await clickByText('Import');
  await capture('import.png', 1000);
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => browser.once('exit', resolveExit)),
    sleep(5000)
  ]);
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(250);
    }
  }
}
