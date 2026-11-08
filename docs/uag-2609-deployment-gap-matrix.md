# UAG 2609 General/deployment gap matrix

Audited on 2026-11-08 against Omnissa's [PowerShell deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters) (page modified 2026-11-06). Older release pages were used only to establish version availability:

- routes, IP addressing modes, and per-NIC custom configuration first appear in the 2306 page and are absent from 2303;
- NIC0 IPv6 and `adminpasswordExpirationDays` first appear in the 2506 page and are absent from 2503.

`Supported` means the setting is represented in the schema/UI and maps through INI import and generation. Settings JSON is included only when the value is an appliance setting; deploy-time infrastructure and file values remain INI-only.

| Documented 2609 key(s) | Mapping in Gateway Forge | Status / rationale |
| --- | --- | --- |
| `defaultGateway` | `defaultGateway` | Supported |
| `routes0`, `routes1`, `routes2` | Per-NIC static routes | Added. Values are comma-separated `IPv4-CIDR gateway-IPv4` pairs. `routes0` applies to all one/two/three-NIC topologies, `routes1` to two/three NICs, and `routes2` to three NICs. |
| `ip0` | `ip0` | Supported for vSphere/Hyper-V NIC0 |
| `v6ip0`, `v6ipprefix0`, `v6DefaultGateway` | NIC0 IPv6 address, prefix, and gateway | Added. Omnissa 2609 documents only the NIC0 keys, so no `v6ip1`, `v6ip2`, or per-NIC IPv6 prefix/gateway keys are inferred. |
| `ipmode0`, `ipmode1`, `ipmode2` | Per-NIC addressing modes | Added with the 2609 documented mode values. The parameter page describes `ipmode0` as applying to all three NICs, while Omnissa's [UAG Terraform sample](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/uag-terraform/uagdeploytr.ps1) reads numbered `ipMode0`/`ipMode1`/`ipMode2` values. Gateway Forge exposes the three INI keys only for active NICs. |
| `netmask0` | `netmask0`; established `netmask1`/`netmask2` pattern | Supported. NIC1/NIC2 keys follow the existing deployment sample pattern and are topology-gated. |
| `adminMaxConcurrentSessions` | `adminMaxConcurrentSessions` | Supported, 1-50 |
| `adminpasswordPolicyUnlockTime` | `adminPasswordPolicyUnlockTime` internal field | Supported; corrected to the documented lowercase `p` INI/JSON key. Range 1-9999 minutes. |
| `adminpasswordPolicyMinLen` | `adminPasswordPolicyMinLen` internal field | Supported; corrected to the documented key. Range 8-64. |
| `adminpasswordExpirationDays` | `adminPasswordExpirationDays` internal field | Added; corrected to the documented key. Range 0-999, available since UAG 2506. |
| `adminSessionIdleTimeoutMinutes` | `adminSessionIdleTimeoutMinutes` | Supported, 0-1440 |
| `adminpasswordPolicyFailedLockoutCount` | `adminPasswordPolicyFailedLockoutCount` internal field | Compatibility-only: present in older Omnissa deployment pages, absent from the 2609 table. Retained and emitted only when changed from the default. |
| `ceipEnabled` | `ceipEnabled` | Supported and linted |
| `communityName` | SNMP `snmp_communityName`, emitted in `[SnmpSettings]` | Supported in its documented service section; not duplicated as a standalone `[General]` field. |
| `eth0CustomConfig`, `eth1CustomConfig`, `eth2CustomConfig` | Per-NIC `systemd.network` overrides | Added with `Section^Parameter=Value` validation. NIC applicability matches `ethN`: all / two-three / three respectively. INI-only. |
| `deploymentoption` | `deploymentOption` internal field | Supported; generation corrected to the exact documented lowercase key. |
| `dsComplianceOS` | `dsComplianceOS` | Supported |
| `headersToBeLogged` | `headersToBeLogged` | Supported since 2312 |
| `osLoginUsername` | `osLoginUsername` | Supported with the documented lowercase/number/underscore/hyphen format and 32-character limit |
| `osMaxLoginLimit` | `osMaxLoginLimit` | Added; shown only when `osLoginUsername` is set |
| `passwordPolicyFailedLockout` | `passwordPolicyFailedLockout` | Supported, 0 or 1-10 |
| `passwordPolicyMinClass` | `passwordPolicyMinClass` | Added, 1-4 |
| `passwordPolicyMinLen` | `passwordPolicyMinLen` | Supported, 6-64 |
| `passwordPolicyUnlockTime` | `passwordPolicyUnlockTime` | Added, 0-3600 seconds |
| `rootPasswordExpirationDays` | `rootPasswordExpirationDays` | Supported, 0 means no expiry |
| `rootSessionIdleTimeoutSeconds` | `rootSessionIdleTimeoutSeconds` | Supported, 0-3600 |
| `secureRandomSource` | `secureRandomSource` | Added as `/dev/random` or `/dev/urandom`; INI-only because Omnissa says it is deployment-time-only |
| `sshEnabled`, `sshPort`, `sshLoginBannerText` | Existing SSH fields | Supported; banner text now validates as printable ASCII |
| `sshInterface` | `sshInterface` | Added. Validation rejects `eth1`/`eth2` when the selected topology lacks those NICs. Empty retains the documented all-interface default. |
| `unrecognizedSessionsMonitoringEnabled` | `unrecognizedSessionsMonitoringEnabled` | Supported since 2406 |
| `quiesceMode` | No mapping | Intentionally excluded because it is a live maintenance state rather than a deployment profile setting |
| `sessionTimeout` | `sessionTimeout` | Supported |
| `snmpEnabled` | Synthetic General entry when SNMP is enabled | Supported; `[SnmpSettings]` values are managed in the SNMP group |
| `sshKeyAccessEnabled`, `sshPasswordAccessEnabled` | Existing SSH access fields | Supported |
| `sslProvider`, `tls12Enabled`, `tls13Enabled` | TLS group | Supported |
| `uagName` | `uagName` | Supported |

## Intentional exclusions

- `quiesceMode` is documented as a maintenance action that pauses a live appliance. It is intentionally excluded from persistent deployment profiles and generated output so an exported INI cannot accidentally deploy an appliance in quiescent mode.
- General deployment infrastructure keys are omitted from settings JSON. This includes VM/image/network values, static routes, IPv6 interface addressing, `ipmode0`/`ipmode1`/`ipmode2`, custom `systemd.network` values, and `secureRandomSource`.
- Azure's route tables and network security groups remain represented by the dedicated `[Azure]` keys. The per-NIC `[General]` route/IP fields are shown only for vSphere and Hyper-V, where Gateway Forge also exposes the corresponding appliance NIC addresses.
- Password values and deploy-script arguments (`-rootPwd`, `-adminPwd`, `-noSSLVerify`, `-disableVerification`) are not schema values. Passwords are supplied by the operator at deployment time; script flags remain represented as runtime controls rather than INI keys.

## Uncertain or compatibility-only keys

- `adminpasswordPolicyFailedLockoutCount` remains represented for compatibility: it appears on older official deployment pages but is absent from the 2609 table. Gateway Forge emits it only when the user changes the default.
- The 2609 page documents the format and a single complete example only for `routes0`. Gateway Forge applies that exact comma-separated `CIDR gateway` format to `routes1` and `routes2`; this is the natural per-NIC interpretation stated by the page, but Omnissa does not provide separate examples for those two keys.
- The parameter page's `ipmode0` description refers to all NICs but names one key. Omnissa's UAG Terraform sample separately establishes the numbered `ipMode0`/`ipMode1`/`ipMode2` convention; Gateway Forge retains lowercase `ipmodeN` generation for the INI while importing case-insensitively.
- The 2609 page documents IPv6 address keys for NIC0 only. NIC1/NIC2 IPv6 support is not represented until an authoritative key name and semantics are published.
