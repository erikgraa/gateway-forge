# Horizon 2609 INI schema audit

**Audit date:** 2026-11-08  
**Target:** Gateway Forge UAG 2609 Horizon schema

## Authoritative sources

- [Configure Horizon Settings (UAG 2609)](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ConfigureHorizonSettings) — setting names, controls, interactions, and documented defaults.
- [Run PowerShell script to deploy (UAG 2609)](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy) — canonical INI sample and structured origin-header examples.
- The equivalent Horizon and PowerShell pages for 2212 through 2606 were compared to establish conservative version gates. A UI setting documented in an older two-column table does not prove the corresponding INI token; where the exact INI token first appears in the 2506 three-column reference, the schema uses `since: 2506`.

## Documented-key gap matrix

`Existing` means the field was already represented. `Added` means this audit added the field or an interaction. `Excluded` means the setting is runtime-only, advanced cross-service configuration, or lacks a stable standalone INI/JSON shape.

| Official label / key | Status | Gateway Forge field | Type and 2609 default | Gate | Notes |
|---|---|---|---|---|---|
| Connection Server URL `proxyDestinationUrl` | Existing | `proxyDestinationUrl` | text, empty; required | all | HTTPS URL validation. |
| Minimum SHA Hash Size `minSHAHashSize` | Existing | `minSHAHashSize` | select, `SHA-256` | 2312 | SHA-1 is linted as weak. |
| Connection Server URL Thumbprint `proxyDestinationUrlThumbprints` | Existing | `proxyDestinationUrlThumbprints` | text, empty | all | Algorithm and byte-length validation. |
| Honor Connection Server Redirect `hostRedirectionEnabled` | Existing | `hostRedirectionEnabled` | bool, `false` | all | — |
| Enable PCoIP `pcoipEnabled` | Existing | `pcoipEnabled` | bool, `false` | all | External URL must be IPv4:port. |
| Disable PCoIP Legacy Certificate `pcoipDisableLegacyCertificate` | Added | `pcoipDisableLegacyCertificate` | bool, `false` | 2506 | Warns that legacy PCoIP clients cannot connect. Exact token first appears in the 2506 reference. |
| PCoIP External URL `pcoipExternalUrl` | Existing | `pcoipExternalUrl` | IPv4:port, empty | all | Defaults to appliance IPv4 and 4172 at UAG when unset. |
| Enable Blast `blastEnabled` | Existing | `blastEnabled` | bool, builder default `false` | all | Disabled on fresh load/reset; templates explicitly opt in. |
| Blast External URL `blastExternalURL` | Existing | `blastExternalUrl` | HTTPS URL, empty | all | Generation follows the 2609 deployment sample's `blastExternalUrl` spelling. INI keys are case-insensitive. |
| Additional Blast External URLs `blastUrls` | Existing | `additionalBlastExternalUrls` | comma-separated URL list, empty | 2412 | Generation follows the deployment sample's `additionalBlastExternalUrls`; `blastUrls` is accepted on import. |
| Connection Server IP mode `proxyDestinationIPSupport` | Existing | `proxyDestinationIPSupport` | select, `IPV4` | all | Omitted when equal to default. |
| Client Encryption Mode `clientEncryptionMode` | Existing | `clientEncryptionMode` | select, `ALLOWED` | all | `DISABLED` is linted. |
| Origin Check Required `originCheckEnabled` | Existing | `originCheckEnabled` | bool, `true` | 2503 | 2503 page documents the control; disabling is linted. |
| Allowed Origins `origin` | Added | `origin` | newline list, empty | 2503 | Input is serialized as `originHeaderDetailsList` plus `[OriginHeaderDetailsN]`; JSON remains structured objects. |
| Auth Methods `authMethods` | Added | `authMethods` | select, `passthrough` | all | Added every 2609 combination, including unauthenticated and device-certificate combinations. |
| Identity Provider `idpEntityID` | Existing | `idpEntityID` | text, empty | 2603 | SAML-only conditional UI. |
| Binding Protocol `idpBindingType` | Existing | `idpBindingType` | select, empty | 2603 | `POST` or `ARTIFACT`. |
| OIDC Configuration ID `oidcConfigurationId` | Added | `horizon_oidcConfigurationId` | text, empty; conditionally required | 2506 | Distinct Horizon reference to the provider configured by `[OidcProviderSetting]`. |
| Enable Windows SSO `windowsSSOEnabled` | Existing | `windowsSSOEnabled` | bool, `false` | all | Visible for RADIUS methods. |
| RADIUS Class Attributes `radiusClassAttributeList` | Added | `radiusClassAttributeList` | comma-separated text, empty | 2506 | Exact token first appears in the 2506 reference. |
| Disclaimer Text `disclaimerText` | Added | `disclaimerText` | text, empty | all | Kept separate from the 2609 sample's pre-login-message toggle. |
| Smart Card Hint Prompt `smartCardHintPrompt` | Existing | `smartCardHintPrompt` | bool, `false` | all | Shown for certificate methods. |
| Enable Re-authentication in Home Site `enableAuthOnRedirectedSite` | Existing | `enableAuthOnRedirectedSite` | bool, `false` | 2406 | Shown only for applicable authentication combinations. |
| Health Check URI Path `healthCheckUrl` | Existing | `healthCheckUrl` | path, empty | all | Must start with `/`. |
| Enable UDP Server `udpTunnelServerEnabled` | Added | `udpTunnelServerEnabled` | bool, `true` | 2506 | Exact key and default are inferred from the UI's enable control; disabling source-address behavior is explained. |
| Blast Proxy Certificate `proxyBlastPemCert` | Added | `proxyBlastPemCert` | PEM path, empty | 2506 | INI-only deploy-time file path; no JSON certificate content is emitted. |
| Blast Allowed Host Header Values `blastAllowedHostHeaderValues` | Existing | `blastAllowedHostHeaderValues` | comma-separated host[:port], empty | all | Accepts `_empty_`; JSON array. |
| Enable Tunnel `tunnelEnabled` | Existing | `tunnelEnabled` | bool, builder default `false` | all | Disabled on fresh load/reset; templates explicitly opt in. |
| Tunnel External URL `tunnelExternalUrl` | Existing | `tunnelExternalUrl` | HTTPS URL, empty | 2412 | Default TCP port at UAG is 443. |
| Additional Tunnel External URLs `tunnelUrls` | Existing | `additionalTunnelExternalUrls` | comma-separated URL list, empty | 2412 | Generation follows the deployment sample; `tunnelUrls` is accepted on import. |
| Tunnel Proxy Certificate `proxyTunnelPemCert` | Added | `proxyTunnelPemCert` | PEM path, empty | 2506 | INI-only deploy-time file path. |
| Endpoint Compliance Check Provider `endpointComplianceCheckProvider` | Added | `endpointComplianceCheckProvider` | text, empty (`none`) | all | Provider details remain in their own advanced-settings section. |
| Compliance Check on Authentication `complianceCheckOnAuthentication` | Added | `complianceCheckOnAuthentication` | bool, `true` | all | Conditional on a provider; initial-delay behavior remains provider-owned. |
| Proxy Pattern `proxyPattern` | Existing | `proxyPattern` | regex text, empty | all | UAG's documented default is retained when omitted. |
| SAML SP `samlSP` | Existing | `samlSP` | text, empty | all | Must name configured metadata or `DEMO`. |
| Enable Proxy Pattern Canonical Match `canonicalizationEnabled` | Added | `canonicalizationEnabled` | bool, `true` | 2506 | Disabling is a validation warning. |
| Logout on Certificate Removal `logoutOnCertRemoval` | Added | `logoutOnCertRemoval` | bool, `false` | 2506 | Certificate authentication only. |
| User name label for RADIUS `radiusUsernameLabel` | Existing | `radiusUsernameLabel` | text, empty | all | 20-character maximum; UAG default `Username` applies when empty. |
| Passcode label for RADIUS `radiusPasscodeLabel` | Existing | `radiusPasscodeLabel` | text, empty | all | 20-character maximum; UAG default `Passcode` applies when empty. |
| Match Windows User Name `matchWindowsUserName` | Existing | `matchWindowsUserName` | bool, `false` | all | Visible for RADIUS and SecurID. |
| Gateway Location `gatewayLocation` | Existing | `gatewayLocation` | select, `external` | all | Unauthenticated methods require `internal`. |
| Show Connection Server Pre-login message `disclaimerText` | Added | `proxyDestinationPreLoginMessageEnabled` | bool, `true` | 2609 | Token comes from the 2609 deployment sample; it resolves the table's duplicate `disclaimerText` label. |
| JWT Producer (no INI key published) | Excluded | — | runtime selection | — | Requires a separately configured JWT advanced setting; no stable standalone parameter is published. |
| JWT Audiences (no INI key published) | Excluded | — | runtime list | — | Do not confuse this with `allowedAudiences`, which is the SAML audience setting. |
| JWT Consumer (no INI key published) | Excluded | — | runtime selection | — | Requires an advanced JWT consumer setting. |
| Trusted Certificates `trustedCert1` | Existing | `trustedCert1`, `trustedCert2` | PEM path, empty | all | INI-only; numbered paths. |
| Response Security Headers `securityHeaders` | Added | `securityHeaders` | text, empty | 2506 | INI import/export is retained; JSON is excluded because the object shape is undocumented. |
| Client Custom Executables | Excluded | — | advanced object reference | — | Depends on `[CustomExecutableSettingsN]` and the `customExecutableN` selection pattern; not a standalone Horizon scalar. |
| Host Port Redirect Mappings `redirectHostPortMappingList` | Added | `redirectHostPortMappingList` | comma-separated mappings, empty | 2506 | Validates `source_host:port_redirect_host:port`. |
| Host Entries `hostEntry1..hostEntryn` | Added | `hostEntry1`–`hostEntry6` | IP host [alias], empty | all | Add/remove rows, maximum six; contiguous INI keys and `hostEntries` JSON array, matching `GetHostEntries` in the vendor sample module. |
| SAML Audiences `allowedAudiences` | Existing | `allowedAudiences` | comma-separated URL list, empty | all | JSON array; SAML-only. |
| SAML Unauthenticated Username Attribute `samlUnauthUsernameAttribute` | Added | `samlUnauthUsernameAttribute` | text, empty | 2506 | Exact INI token first appears in the 2506 reference. |
| Default Unauthenticated Username `defaultUnauthUsername` | Added | `defaultUnauthUsername` | text, empty | 2506 | Valid for SAML, SecurID, and RADIUS unauthenticated combinations. |
| Disable Web Client `disableWebClient` | Existing | `disableWebClient` | bool, `false` | 2412 | — |
| Blast standard/custom feature controls | Excluded | — | dynamic feature lists | — | `[Horizon/Blast]` numbered features and the nested `blastSettings` JSON node depend on separately configured executables/features and are outside the scalar Horizon schema. |
| 2609 sample `queryBrokerInterval` | Added | `queryBrokerInterval` | integer seconds, `300` | 2609 | Present in the 2609 PowerShell sample but absent from the setting table. |

## Interaction decisions

- Blast and Tunnel additional URLs are validated independently for duplicate hostnames; duplicate hosts are rejected even when schemes or ports differ.
- Unauthenticated methods require `gatewayLocation=internal`; SAML, RADIUS, certificate, SecurID, and OIDC selections require their corresponding configured authentication provider.
- PCoIP enabling is independent from Blast/Tunnel, but both TCP and UDP 4172 cascade forwarding are linted together.
- SAML controls are visible for all SAML combinations, including device-certificate-and-SAML and unauthenticated variants.
- Origin details preserve each origin's `rewriteEnabled` and `autoGenerated` flags. The INI index entry is emitted only once in `[Horizon]`; numbered detail sections are emitted separately.
- In cascade mode, Horizon fields remain disabled on the outer UAG. The inner UAG owns Horizon external URLs and authentication settings.

## Explicit uncertainty

1. Older Horizon pages describe several UI settings but do not publish the INI parameter column. Gates for `pcoipDisableLegacyCertificate`, `radiusClassAttributeList`, proxy certificates, UDP tunnel, canonicalization, logout, redirect mappings, security headers, and unauthenticated username keys therefore begin at 2506, the first page with the exact token, rather than 2212, the first page with the UI behavior. Appliance-export testing may prove an earlier exact gate.
2. `securityHeaders` is represented as verbatim INI text. Omnissa does not publish its settings-JSON object schema, so import/export intentionally does not map it to JSON.
3. The 2609 setting table labels pre-login display as `disclaimerText`, duplicating the actual disclaimer-text row. The schema preserves `disclaimerText` for text and uses `proxyDestinationPreLoginMessageEnabled` from the 2609 PowerShell sample for the boolean.
4. The setting table names additional URL parameters `blastUrls` and `tunnelUrls`, while the 2609 deployment sample uses `additionalBlastExternalUrls` and `additionalTunnelExternalUrls`. Generation uses the sample; both spellings import.
5. `udpTunnelServerEnabled` is documented as an enable toggle but no explicit default is stated. Gateway Forge uses `true`, matching the enable-oriented control and avoids changing the product's normal behavior.
