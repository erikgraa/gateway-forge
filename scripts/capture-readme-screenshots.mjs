import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/';
const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const port = 9300 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(join(tmpdir(), 'uag-studio-screenshots-'));
const outputDir = join(root, 'docs', 'screenshots');
const chooserOnly = process.argv.includes('--chooser-only');

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
  throw new Error('UAG Studio did not render.');
}

async function viewport(width = 1480, height = 900) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
}

async function capture(name, height = 900) {
  await viewport(1480, height);
  await sleep(250);
  const currentBranding = await evaluate(`document.querySelector('.scenario-brand-mark svg path')?.getAttribute('d') === 'M9 3H29V23H26V6H9Z' && document.getElementById('app')?.textContent.includes(${JSON.stringify(`UAG Studio v${packageInfo.version}`)})`);
  if (!currentBranding) throw new Error('Screenshot target must show the current package version and workspace mark.');
  const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(join(outputDir, name), Buffer.from(data, 'base64'));
  console.log(`Captured ${name}`);
}

async function reset(theme = 'dark', scenario = 'single') {
  // This script owns a disposable profile; never attach it to an operator's browser.
  const { identifier } = await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.clear(); localStorage.setItem('gateway-forge.appearance.v1', JSON.stringify({palette: 'original', theme: '${theme}'}));`
  });
  try {
    await command('Page.navigate', { url: targetUrl });
    await sleep(700);
    await waitForApp();
  } finally {
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  if (!await evaluate(`document.title.startsWith('UAG Studio') && !!document.getElementById('scenario-single')`)) {
    throw new Error('Capture requires the unreleased UAG Studio scenario build, not the published legacy app.');
  }
  if (scenario) {
    await evaluate(`document.getElementById('scenario-${scenario}').click(); true;`);
    await sleep(300);
    if (!await evaluate(`!!document.getElementById('workspace-name')`)) throw new Error('Scenario editor did not open.');
  }
  await evaluate(`document.querySelector('.center')?.scrollTo(0, 0)`);
}

async function seedReadyDraft() {
  const sample = {
    id: 'readme-ready-uag', name: 'Office gateway', scenario: 'single', fleet: null, retainedImports: [],
    config: {
      version: '2609', platform: 'vsphere',
      values: {
        name: 'office-uag', uagName: 'uag01.example.com',
        source: 'C:\\images\\euc-unified-access-gateway-demo.ova',
        target: 'vi://operator@vc.example.com/Datacenter/host/Compute', ds: 'Datastore',
        deploymentOption: 'threenic', netInternet: 'DMZ', netManagementNetwork: 'Management', netBackendNetwork: 'Backend',
        ipmode0: 'STATICV4', ipmode1: 'STATICV4', ipmode2: 'STATICV4',
        ip0: '198.51.100.21', netmask0: '255.255.255.0',
        ip1: '192.0.2.21', netmask1: '255.255.255.0',
        ip2: '198.18.0.21', netmask2: '255.255.255.0',
        defaultGateway: '198.51.100.1', dns: '192.0.2.53 192.0.2.54',
        ntpServers: 'ntp1.example.com ntp2.example.com'
      },
      wrp: [], syslog: [], adminUsers: [], jwt: [], jwtIssuers: [], oidc: [], iniExtras: []
    }
  };
  const { identifier } = await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('gateway-forge.workspaces.v1', ${JSON.stringify(JSON.stringify({ revision: 1, current: null, drafts: [sample] }))});`
  });
  try {
    await command('Page.navigate', { url: targetUrl });
    await sleep(700);
    await waitForApp();
  } finally {
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  if (!await evaluate(`document.querySelector('[data-draft-id="readme-ready-uag"] .readiness-status')?.textContent.trim() === 'Ready to export' && document.querySelectorAll('.resume-item').length === 1`)) {
    throw new Error('The synthetic README UAG must pass real checked-export validation before capture.');
  }
  await evaluate('window.scrollTo(0, 0)');
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
  await reset('dark', null);
  await seedReadyDraft();
  await capture('chooser-dark.png');
  await reset('light', null);
  await seedReadyDraft();
  await capture('chooser-light.png');
  if (!chooserOnly) {
    await reset('dark');
    await clickByText('Network & deploy');
    await capture('builder-dark.png');

    await reset('light');
    await clickByText('Network & deploy');
    await capture('builder-light.png');

    await reset('dark');
    await clickByText('Identity and access');
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
  }
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
