import { generateIni, generateJson, iniFileName, jsonFileName, type SecretMode } from './generate';
import { generatePowerShell, type DeploymentMode } from './powershell';
import { generateDocs } from './topology';
import { validateConfig } from './validate';
import type { Config } from './model';
import type { OutputTab } from './store.svelte';

export interface Rendered {
  text: string;
  filename: string;
  mime: string;
}

export function render(
  c: Config,
  tab: OutputTab,
  mode: SecretMode,
  deploymentMode: DeploymentMode = 'interactive'
): Rendered {
  switch (tab) {
    case 'ini':
      return { text: generateIni(c, { secrets: mode }), filename: iniFileName(c), mime: 'text/plain' };
    case 'json':
      return { text: generateJson(c, { secrets: mode }), filename: jsonFileName(c), mime: 'application/json' };
    case 'ps': {
      const base = iniFileName(c).replace(/\.ini$/, '');
      const text = generatePowerShell(c, mode, deploymentMode);
      return { text, filename: `deploy-${base}.ps1`, mime: 'text/plain' };
    }
    case 'docs':
      return { text: generateDocs(c, validateConfig(c)), filename: iniFileName(c).replace(/\.ini$/, '.md'), mime: 'text/markdown' };
  }
}

export function download(r: Rendered): void {
  const url = URL.createObjectURL(new Blob([r.text], { type: `${r.mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = r.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Minimal syntax highlighting; input is HTML-escaped first so it is safe for {@html}. */
export function highlight(text: string, tab: OutputTab): string {
  const lines = text.split('\n').map((line) => {
    const e = esc(line);
    if (tab === 'ini') {
      if (/^\s*#/.test(e)) return `<span class="hl-com">${e}</span>`;
      if (/^\[.*\]$/.test(e)) return `<span class="hl-sec">${e}</span>`;
      const m = /^([^=]+)=(.*)$/.exec(e);
      if (m) return `<span class="hl-key">${m[1]}</span>=${m[2].replace(/&lt;REDACTED&gt;/g, '<span class="hl-red">&lt;REDACTED&gt;</span>')}`;
    } else if (tab === 'ps') {
      if (/^\s*#/.test(e)) return `<span class="hl-com">${e}</span>`;
      return e.replace(/(\[[A-Za-z0-9]+\])(?=\r?$)/, '<span class="hl-sec">$1</span>').replace(/&lt;REDACTED&gt;/g, '<span class="hl-red">&lt;REDACTED&gt;</span>');
    } else if (tab === 'json') {
      return e.replace(/^(\s*)(&quot;|")([^"]+?)(&quot;|")(:)/, '$1<span class="hl-key">"$3"</span>$5').replace(/&lt;REDACTED&gt;/g, '<span class="hl-red">&lt;REDACTED&gt;</span>');
    } else if (tab === 'docs') {
      if (/^#/.test(e)) return `<span class="hl-sec">${e}</span>`;
    }
    return e;
  });
  return lines.join('\n');
}
