import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyPatch, defaultConfig, fieldAvailable } from './model';
import { GROUPS } from './schema';
import { generateIni, generateJson } from './generate';
import { generatePowerShell } from './powershell';
import { importIni, importJson } from './importer';
import { validateConfig } from './validate';
import { hypervVlanDeployment } from './hyperv-vlan';

const fields = GROUPS.flatMap((group) => group.fields).filter((field) => field.id.startsWith('hv_vlan'));
const config = (count = 3) => applyPatch(defaultConfig(), { platform: 'hyperv', values: {
  name: 'uag-test', deploymentOption: ['onenic', 'twonic', 'threenic'][count - 1], hv_vlan0: 101, hv_vlan1: 202, hv_vlan2: 303
} });

describe('Hyper-V access VLANs', () => {
  it.each([1, 2, 3])('exposes only %i active layout fields and emits only those VLANs', (count) => {
    const c = config(count);
    expect(fields.filter((field) => fieldAvailable(field, c.version, c.platform, c.values))).toHaveLength(count);
    const text = generatePowerShell(c);
    expect(text.match(/^Set-VMNetworkAdapterVlan /gm)).toHaveLength(count);
    expect(text).not.toContain('-SwitchName');
    expect(text).toContain(`$gfNics.Count -ne ${count}`);
    c.platform = 'vsphere';
    expect(fields.filter((field) => fieldAvailable(field, c.version, c.platform, c.values))).toHaveLength(0);
    expect(generatePowerShell(c)).not.toContain('Set-VMNetworkAdapterVlan');
  });

  it.each([0, 4095, -1, 1.5, 'bad', '1e2'])('rejects invalid active VLAN %s in lint and generated deployment', (value) => {
    const c = config();
    c.values.hv_vlan0 = value;
    expect(validateConfig(c).some((issue) => issue.fieldId === 'hv_vlan0')).toBe(true);
    expect(hypervVlanDeployment(c, '.\\vendor.ps1').join('\n')).toMatch(/^throw /);
  });

  it('accepts VLAN boundaries and ignores hidden invalid values without deleting them', () => {
    const c = config(1);
    c.values.hv_vlan0 = 4094;
    c.values.hv_vlan1 = 'invalid-but-hidden';
    expect(validateConfig(c).filter((issue) => issue.fieldId?.startsWith('hv_vlan'))).toEqual([]);
    expect(generatePowerShell(c)).toContain('-VlanId 4094');
    expect(c.values.hv_vlan1).toBe('invalid-but-hidden');
    c.values.hv_vlan0 = 1;
    expect(generatePowerShell(c)).toContain('-VlanId 1');
  });

  it('leaves unset VLANs unchanged and excludes project-only fields from vendor artifacts', () => {
    const c = config();
    c.values.hv_vlan0 = c.values.hv_vlan1 = c.values.hv_vlan2 = '';
    expect(hypervVlanDeployment(c, 'original invocation')).toEqual(['original invocation']);
    expect(generatePowerShell(c)).not.toContain('$gf');
    c.values.hv_vlan1 = 202;
    expect(generatePowerShell(c)).toContain('-VMNetworkAdapter $gfRoleAdapters[1] -Access -VlanId 202');
    expect(generatePowerShell(c).match(/^Set-VMNetworkAdapterVlan /gm)).toHaveLength(1);
    expect(generateIni(c)).not.toContain('hv_vlan');
    expect(generateJson(c)).not.toContain('hv_vlan');
    expect(importIni(generateIni(c), c).config.values.hv_vlan1).toBe(202);
    expect(importJson(generateJson(c), c).config.values.hv_vlan1).toBe(202);
    expect(JSON.parse(JSON.stringify(c)).values.hv_vlan1).toBe(202);
  });

  it('guards both password modes, quotes VM names and requires an explicit name/layout', () => {
    const c = config();
    for (const mode of ['interactive', 'headless'] as const) {
      const text = generatePowerShell(c, 'placeholder', mode);
      expect(text).toContain('2>&1 6>&1 | ForEach-Object');
      expect(text).toContain('$gfDeploymentSucceeded');
      expect(text).toContain("'Running'");
      expect(text).toContain('-ErrorAction Stop');
      if (mode === 'headless') expect(text).toContain('-rootPwd $env:UAG_ROOT_PASSWORD');
    }
    c.values.name = "operator's VM";
    expect(generatePowerShell(c)).toContain("$gfVmName = 'operator''s VM'");
    c.values.name = ' padded VM ';
    expect(generatePowerShell(c)).toContain("$gfVmName = ' padded VM '");
    c.values.name = '   ';
    expect(hypervVlanDeployment(c, 'command')[0]).toMatch(/^throw /);
    c.values.name = '';
    expect(hypervVlanDeployment(c, 'command')[0]).toMatch(/^throw /);
    c.values.name = 'uag-test';
    c.values.deploymentOption = 'unknown';
    expect(hypervVlanDeployment(c, 'command')[0]).toMatch(/^throw /);
  });
});

type Scenario = { count?: number; names?: string[]; vendor?: string; before?: boolean; reused?: boolean; missing?: boolean; stopped?: boolean; failName?: string; missingId?: boolean; onlyManagement?: boolean };
function runMock(scenario: Scenario = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'gateway-forge-vlan-'));
  const count = scenario.count ?? 3;
  const names = scenario.names ?? ['Backend Network Adapter', 'Network Adapter', 'Management Network Adapter'].filter((name) => count === 3 || (count === 2 ? name !== 'Backend Network Adapter' : name === 'Network Adapter'));
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const objects = names.map((name, index) => `[pscustomobject]@{ Name=${quote(name)}; Id='${scenario.missingId ? '' : `nic-${index}`}'; SwitchName='Shared-Trunk' }`).join(',');
  const c = config(count);
  if (scenario.onlyManagement) c.values.hv_vlan0 = c.values.hv_vlan2 = '';
  const code = `
$global:mockCalls = @()
$global:mockReads = 0
function Get-VM {
  param($ErrorAction)
  $global:mockReads++
  if ($global:mockReads -eq 1) { ${scenario.before ? "[pscustomobject]@{Name='uag-test';Id='old';State='Running'}" : ''}; return }
  ${scenario.missing ? 'return' : `[pscustomobject]@{Name='uag-test';Id='${scenario.reused ? 'old' : 'new'}';State='${scenario.stopped ? 'Off' : 'Running'}'}`}
}
function Get-VMNetworkAdapter { param($VM, $ErrorAction); ${objects} }
function Set-VMNetworkAdapterVlan {
  param($VMNetworkAdapter, [switch]$Access, $VlanId, $ErrorAction)
  if ($VMNetworkAdapter.Name -eq ${quote(scenario.failName ?? 'never')}) { throw 'Simulated cmdlet failure' }
  $global:mockCalls += [pscustomobject]@{Name=$VMNetworkAdapter.Name;Vlan=$VlanId}
}
try {
${hypervVlanDeployment(c, '.\\vendor.ps1').join('\n')}
} catch { $global:mockFailure = $_.ToString() }
Write-Output ('MOCK_RESULT:' + (ConvertTo-Json -Compress -Depth 5 -InputObject @{Calls=@($global:mockCalls);Failure=$global:mockFailure}))
`;
  try {
    writeFileSync(join(directory, 'vendor.ps1'), scenario.vendor ?? "Write-Host 'UAG virtual appliance uag-test deployed successfully'", 'utf8');
    writeFileSync(join(directory, 'harness.ps1'), code, 'utf8');
    const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-File', join(directory, 'harness.ps1')], { cwd: directory, encoding: 'utf8', timeout: 15000 });
    const line = output.split(/\r?\n/).find((line) => line.startsWith('MOCK_RESULT:'))!;
    return JSON.parse(line.slice('MOCK_RESULT:'.length)) as { Calls: { Name: string; Vlan: number }[]; Failure?: string };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform !== 'win32')('generated PowerShell with isolated mocks (no Hyper-V execution)', () => {
  it.each([1, 2, 3])('maps %i NIC roles independently of order/shared switch', (count) => {
    const result = runMock({ count, before: true });
    expect(result.Failure).toBeFalsy();
    expect(result.Calls).toEqual([
      { Name: 'Network Adapter', Vlan: 101 },
      ...(count >= 2 ? [{ Name: 'Management Network Adapter', Vlan: 202 }] : []),
      ...(count === 3 ? [{ Name: 'Backend Network Adapter', Vlan: 303 }] : [])
    ]);
  }, 20000);

  it.each([
    { vendor: "Write-Host 'Error: failed'; exit" },
    { vendor: 'exit 1' },
    { vendor: "Write-Error 'failed'; Write-Host 'UAG virtual appliance uag-test deployed successfully'" },
    { missing: true }, { stopped: true }, { before: true, reused: true }, { missingId: true },
    { names: ['Network Adapter', 'Management Network Adapter', 'Management Network Adapter'] },
    { names: ['Network Adapter', 'Backend Network Adapter'] },
    { names: ['Network Adapter', 'Management Network Adapter', 'Backend Network Adapter', 'Unrelated'] }
  ])('fails before any mutation for %j', (scenario) => {
    const result = runMock(scenario);
    expect(result.Failure).toBeTruthy();
    expect(result.Calls).toEqual([]);
  }, 20000);

  it('leaves unset adapters untouched on a shared switch', () => {
    const result = runMock({ onlyManagement: true });
    expect(result.Failure).toBeFalsy();
    expect(result.Calls).toEqual([{ Name: 'Management Network Adapter', Vlan: 202 }]);
  }, 20000);

  it('stops on cmdlet failure without changing subsequent adapters', () => {
    const result = runMock({ failName: 'Management Network Adapter' });
    expect(result.Failure).toContain('Simulated cmdlet failure');
    expect(result.Calls).toEqual([{ Name: 'Network Adapter', Vlan: 101 }]);
  }, 20000);
});
