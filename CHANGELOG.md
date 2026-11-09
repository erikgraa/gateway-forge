# Changelog

All notable user-facing changes to Gateway Forge are documented here. This format follows the [Keep a Changelog](https://keepachangelog.com/) structure.

## Unreleased

### Added

- Added source-backed external IdP trusted CA rows (maximum nine), optional comma-separated URL thumbprints, and PEM-only SAML signing/encryption and dedicated IdP certificate inputs.
- Added UAG 2609 administrator SAML access (`[adminSAMLSettings]`) with settings JSON import/export and IdP validation, plus separate management/Admin UI certificate paths (`[SSLCertAdmin]`).
- Added Workspace ONE Content Gateway support, Tunnel row-based trusted CA paths, and additional Admin UI/API monitoring users with runtime-only password handling.
- Added Additional Blast external URL rows and six-slot Horizon/Workspace ONE Tunnel host entry editors, including contiguous INI output and Horizon `hostEntries` JSON arrays.
- Added a prominent security-baseline warning when an older UAG version is selected, with UAG 2609 identified as the recommended release and a one-click upgrade action.
- Added UAG 2609 General/deployment coverage for per-NIC static routes, IPv6, IP mode, custom NIC configuration, SSH interface selection, OS/admin policy controls, and exact documented key spellings.
- Added source-backed Nutanix AHV and Red Hat OpenShift Virtualization deployment profiles, templates, generated scripts/manifests, prerequisites, and import validation.
- Added Workspace ONE Tunnel configuration across vSphere, Hyper-V, Azure, Nutanix, and OpenShift, including realistic templates and the documented UAG 2609 `[Airwatch]` key set.
- Added repeatable trusted CA PEM path rows, SSH public-key inputs, per-NIC addressing mode controls, and accessible row editors for DNS, search-domain, NTP, and Blast allowed Host header values.
- Added a security design and staged roadmap for future opt-in secret-management and PKI providers, plus dormant provider-neutral contracts.
- Added a live, responsive trust-zone topology with NIC roles, service protocols, destinations, cascade direction, identity, and monitoring relationships.
- Added collapsible configuration cards, topology, validation, templates, and list instances, all expanded by default.

### Changed

- Made TLS PEM/key and PFX inputs mutually exclusive, with explicit mode selection, imported-conflict validation, and deployment-time protected-PFX password guidance. Certificate file paths remain INI-only, with an explicit JSON-preview notice.
- Split deployment and networking fields into separate Step 2 cards, replaced platform and recommended-release dropdowns with direct buttons, and renamed legacy release choices to “Other releases”.
- Disabled Horizon, Blast and Horizon Tunnel on first load/reset; templates still opt in explicitly.
- Show the topology only in enabled Horizon, Workspace ONE Tunnel and Web Reverse Proxy sections; clarify management-only NIC1 and backend-only NIC2 for three-NIC deployments.
- Redesigned the UAG configuration workspace into a responsive layout with section navigation, live readiness and validation context, and persistent INI, JSON, PowerShell, and Docs previews.
- Added a source-backed UAG 2609 deployment gap matrix covering implemented settings, NIC applicability, exclusions, and uncertain keys.
- Moved `uagdeploy` runtime switches into the PowerShell output panel and added interactive or environment-backed headless deployment modes.
- Added platform-aware VM-name guidance and corrected root/Admin UI password guidance: omitted parameters trigger the official deployment scripts' prompts; headless mode requires both passwords.
- Validated deployment image formats per platform, retained vSphere `.ova` local/URL input, and restricted Hyper-V source images to local `.vhdx` paths.
- Kept Blast allowed Host header values comma-separated in INI and arrays in settings JSON while providing a validated add/remove row editor.
- Expanded UAG 2609 Horizon coverage and documented where sample, runtime-only, unsupported, or uncertain settings differ from the published schema.

### Fixed

- Unified deployment command generation so every PowerShell variant explicitly passes `-iniFile`, including Azure and Nutanix; retained named INI arguments across both OpenShift preparation and credential flows.
- Tightened NIC network requirements and topology gating across one-, two-, and three-NIC deployments.
- Removed duplicate Nutanix/OpenShift schema groups that prevented Network & deploy from rendering after navigating away from another section.
- Required Horizon Workspace ONE UEM API URLs to be HTTPS origins without paths, query strings, fragments, or embedded credentials.
- Preserved imported DNS/NTP rows, SSH keys, trusted certificates, origin details, cascades, runtime controls, and platform-specific fields through generation and round trips.
- Promoted missing Horizon Connection Server trust configuration to a warning with click-through focus on the trusted certificate editor.
- Promoted the missing server-certificate advisory to a warning and added certificate extension, duplicate CA, and certificate/private-key path separation checks.

### Removed

- Removed all Horizon thumbprint helper UI and README references, including the earlier localhost helper; direct thumbprint and trusted CA configuration remain available.

## Changelog conventions

- Add user-visible improvements and fixes under `Unreleased` using the appropriate Keep a Changelog section, such as `Added`, `Changed`, `Fixed`, or `Security`.
- Describe the outcome for users rather than implementation details, and keep each entry concise.
- Use past tense, link related references when useful, and move entries into a dated release heading when a release is published.
