import { defaultConfig, stripSecrets, applyPatch, type Config } from './model';
import { isSupportedVersion, DEFAULT_VERSION } from './versions';
import type { SectionId } from './schema';
import type { SecretMode } from './generate';
import type { DeploymentMode } from './powershell';

const RUNTIME_FIELD_IDS = new Set(['run_noSSLVerify', 'run_disableVerification']);

const DRAFT_KEY = 'gateway-forge.draft';
const THEME_KEY = 'gateway-forge.theme';

/** One-time move of values saved under the pre-rename "uagforge.*" and "uag-forge.*" keys. */
function migrateLegacyKeys(): void {
  try {
    for (const [from, to] of [['uagforge.draft', DRAFT_KEY], ['uagforge.theme', THEME_KEY], ['uag-forge.draft', DRAFT_KEY], ['uag-forge.theme', THEME_KEY]]) {
      const v = localStorage.getItem(from);
      if (v !== null) {
        if (localStorage.getItem(to) === null) localStorage.setItem(to, v);
        localStorage.removeItem(from);
      }
    }
  } catch {
    /* storage unavailable */
  }
}
migrateLegacyKeys();

export type OutputTab = 'ini' | 'json' | 'ps' | 'docs' | 'manifest';

function loadDraft(): Config {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Config;
      const merged = applyPatch(defaultConfig(), { version: parsed.version, platform: parsed.platform, values: parsed.values });
      if (typeof merged.values.sessionTimeout === 'number' && merged.values.sessionTimeout >= 60000) {
        merged.values.sessionTimeout /= 60000;
      }
      merged.wrp = (parsed.wrp ?? []).map((i) => ({ ...i }));
      merged.syslog = (parsed.syslog ?? []).map((i) => ({ ...i }));
      merged.adminUsers = applyPatch(defaultConfig(), { adminUsers: parsed.adminUsers }).adminUsers;
      if (!isSupportedVersion(merged.version)) merged.version = DEFAULT_VERSION;
      return merged;
    }
  } catch {
    /* corrupt draft - start fresh */
  }
  return sampleConfig();
}

function sampleConfig(): Config {
  return applyPatch(defaultConfig(), {
    values: {
      uagName: 'uag-dmz-01',
      name: 'uag-dmz-01',
      source: 'C:\\images\\euc-unified-access-gateway-26.09.0.0_OVF10.ova',
      target: 'vi://administrator@vsphere.local@vcsa.corp.local/DC1/host/Cluster1',
      folder: 'DMZ Gateways',
      ds: 'vsanDatastore',
      netInternet: 'DMZ-Internet',
      netManagementNetwork: 'DMZ-Management',
      deploymentOption: 'twonic-large',
      ip0: '192.0.2.21',
      netmask0: '255.255.255.0',
      ip1: '10.20.10.21',
      netmask1: '255.255.255.0',
      defaultGateway: '192.0.2.1',
      dns: '10.20.0.10 10.20.0.11',
      dnsSearch: 'corp.local',
      ntpServers: 'ntp1.corp.local ntp2.corp.local',
      horizon_enabled: false,
      proxyDestinationUrl: 'https://horizon-cs.corp.local',
      authMethods: 'radius-auth',
      gatewayLocation: 'external',
      tunnelEnabled: false,
      tunnelExternalUrl: 'https://horizon.example.com:443',
      blastEnabled: false,
      blastExternalUrl: 'https://horizon.example.com:443',
      minSHAHashSize: 'SHA-256',
      clientEncryptionMode: 'REQUIRED',
      originCheckEnabled: true,
      healthCheckUrl: '/favicon.ico',
      radius_enabled: true,
      radius_hostName: 'radius01.corp.local',
      radius_authPort: 1812,
      radius_authType: 'PAP',
      radius_sharedSecret: '',
      radius_numAttempts: 3,
      radius_serverTimeout: 5,
      radius_radiusDisplayHint: 'MFA passcode',
      tls12Enabled: true,
      tls13Enabled: true,
      tls11Enabled: false,
      tls10Enabled: false,
      sshEnabled: false,
      ceipEnabled: false
    },
    syslog: [
      {
        sysLogType: 'TLS',
        syslogCategory: 'ALL',
        syslogFormat: 'TEXT',
        hostname: 'siem.corp.local',
        port: 6514,
        syslogSystemMessagesEnabledV2: true,
        syslogSettingName: 'siem-primary'
      }
    ]
  });
}

function initialTheme(): 'dark' | 'light' {
  const t = document.documentElement.dataset.theme;
  return t === 'light' ? 'light' : 'dark';
}

class AppState {
  config = $state<Config>(loadDraft());
  section = $state<SectionId>('general');
  tab = $state<OutputTab>('ini');
  secretMode = $state<SecretMode>('placeholder');
  deploymentMode = $state<DeploymentMode>('interactive');
  theme = $state<'dark' | 'light'>(initialTheme());
  focusField = $state<string | null>(null);
  showImport = $state(false);
  showPalette = $state(false);
  toast = $state<string | null>(null);

  setTheme(t: 'dark' | 'light', persist = true) {
    this.theme = t;
    document.documentElement.dataset.theme = t;
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* storage unavailable */
      }
    }
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  say(msg: string) {
    this.toast = msg;
    setTimeout(() => {
      if (this.toast === msg) this.toast = null;
    }, 3200);
  }

  goTo(section: SectionId, fieldId?: string) {
    const runtimeControl = fieldId && RUNTIME_FIELD_IDS.has(fieldId);
    if (runtimeControl) this.tab = 'ps';
    this.section = section;
    this.focusField = fieldId ?? null;
    if (fieldId) {
      setTimeout(() => {
        const el = document.getElementById(`f-${fieldId}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el as HTMLElement | null)?.focus?.();
      }, 60);
    }
  }

  saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stripSecrets(this.config)));
    } catch {
      /* storage unavailable */
    }
  }

  clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    this.config = defaultConfig();
  }
}

export const app = new AppState();
