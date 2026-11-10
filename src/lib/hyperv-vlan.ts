import type { Config } from './model';
import { deploymentNicCount } from './schema';

export function hypervVlanDeployment(c: Config, command: string): string[] {
  const count = deploymentNicCount(c.values);
  const selected = Array.from({ length: count }, (_, nic) => ({ nic, value: c.values[`hv_vlan${nic}`] }))
    .filter(({ value }) => value !== undefined && value !== null && String(value).trim() !== '');
  if (c.platform !== 'hyperv' || selected.length === 0) return [command];
  if (selected.some(({ value }) => !/^\d+$/.test(String(value).trim()) || Number(value) < 1 || Number(value) > 4094)) {
    return ["throw 'Hyper-V access VLANs must be integers from 1 to 4094. Deployment was not started.'"];
  }
  const name = String(c.values.name ?? '');
  if (!name.trim() || !/^(one|two|three)nic(?:-large|-XL)?$/.test(String(c.values.deploymentOption))) {
    return ["throw 'Configure an explicit VM name and a supported NIC layout before deploying with Hyper-V VLANs.'"];
  }
  const out = [
    '# Optional Hyper-V access VLANs. Run on the deployment host; the shared external switch/uplink must carry these VLANs.',
    '# Adapter roles follow the inspected uagdeployhv.ps1 contract. Different package naming/layouts fail closed.',
    '# The vendor script deletes/recreates a same-name VM. VLAN changes require its explicit success message and a new VM ID.',
    `$gfVmName = '${name.replace(/'/g, "''")}'`,
    '$gfBefore = @(Get-VM -ErrorAction Stop | Where-Object { $_.Name -eq $gfVmName })',
    "if ($gfBefore.Count -gt 1) { throw 'Ambiguous VM name; deployment was not started.' }",
    '$gfDeploymentSucceeded = $false',
    '$gfDeploymentError = $false',
    '$global:LASTEXITCODE = 0',
    `${command} 2>&1 6>&1 | ForEach-Object {`,
    '    if ($_ -is [System.Management.Automation.ErrorRecord]) { $gfDeploymentError = $true }',
    '    if ($_.ToString() -ceq "UAG virtual appliance $gfVmName deployed successfully") { $gfDeploymentSucceeded = $true }',
    '    Write-Host $_',
    '}',
    "if (!$gfDeploymentSucceeded -or $gfDeploymentError -or $LASTEXITCODE -ne 0) { throw 'Deployment did not report clean success; no VLANs were changed.' }",
    '$gfAfter = @(Get-VM -ErrorAction Stop | Where-Object { $_.Name -eq $gfVmName })',
    "if ($gfAfter.Count -ne 1 -or $gfAfter[0].State -ne 'Running') { throw 'Expected one running deployed VM; no VLANs were changed.' }",
    "if ($gfBefore.Count -eq 1 -and $gfBefore[0].Id -eq $gfAfter[0].Id) { throw 'VM was not recreated; no VLANs were changed.' }",
    '$gfNics = @(Get-VMNetworkAdapter -VM $gfAfter[0] -ErrorAction Stop)',
    `if ($gfNics.Count -ne ${count}) { throw 'Unexpected adapter count; no VLANs were changed.' }`,
    "if (@($gfNics | Where-Object { [string]::IsNullOrWhiteSpace($_.Id) }).Count -gt 0 -or @($gfNics.Id | Select-Object -Unique).Count -ne $gfNics.Count) { throw 'Missing or duplicate adapter identities; no VLANs were changed.' }",
    '$gfRoleAdapters = @{}',
    "$gfInternet = @($gfNics | Where-Object { $_.Name -ne 'Management Network Adapter' -and $_.Name -ne 'Backend Network Adapter' })",
    "if ($gfInternet.Count -ne 1) { throw 'Internet adapter is missing or ambiguous; no VLANs were changed.' }",
    '$gfRoleAdapters[0] = $gfInternet[0]'
  ];
  for (const [nic, adapter] of [[1, 'Management Network Adapter'], [2, 'Backend Network Adapter']] as const) {
    if (nic >= count) continue;
    out.push(
      `$gfMatches = @($gfNics | Where-Object { $_.Name -eq '${adapter}' })`,
      `if ($gfMatches.Count -ne 1) { throw '${adapter} is missing or ambiguous; no VLANs were changed.' }`,
      `$gfRoleAdapters[${nic}] = $gfMatches[0]`
    );
  }
  out.push('# All roles/counts are validated before the first mutation; only explicitly configured VLANs are changed.');
  for (const { nic, value } of selected) {
    out.push(`Set-VMNetworkAdapterVlan -VMNetworkAdapter $gfRoleAdapters[${nic}] -Access -VlanId ${Number(value)} -ErrorAction Stop`);
  }
  out.push('# A cmdlet failure stops subsequent changes; earlier VLAN changes are not automatically rolled back.');
  return out;
}
