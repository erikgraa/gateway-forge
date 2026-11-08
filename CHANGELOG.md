# Changelog

All notable user-facing changes to Gateway Forge are documented here. This format follows the [Keep a Changelog](https://keepachangelog.com/) structure.

## Unreleased

### Added

- Added a prominent security-baseline warning when an older UAG version is selected, with UAG 2609 identified as the recommended release and a one-click upgrade action.
- Added UAG 2609 General/deployment coverage for per-NIC static routes, IPv6, IP mode, custom NIC configuration, SSH interface selection, OS/admin policy controls, and exact documented key spellings.
- Added source-backed Nutanix AHV and Red Hat OpenShift Virtualization deployment profiles, templates, generated scripts/manifests, prerequisites, and import validation.
- Added Workspace ONE Tunnel configuration across vSphere, Hyper-V, Azure, Nutanix, and OpenShift, including realistic templates and the documented UAG 2609 `[Airwatch]` key set.
- Added repeatable trusted CA PEM path rows, SSH public-key inputs, per-NIC addressing mode controls, and accessible row editors for DNS, search-domain, NTP, and Blast allowed Host header values.
- Added paste-certificate/WebCrypto and PowerShell methods for obtaining Horizon Connection Server thumbprints.
- Added a security design and staged roadmap for future opt-in secret-management and PKI providers, plus dormant provider-neutral contracts.
- Added a live, responsive trust-zone topology with NIC roles, service protocols, destinations, cascade direction, identity, and monitoring relationships.
- Added planned Content Gateway roadmap coverage and a consolidated authoritative source map for UAG, platform, schema, lifecycle, security, and tooling references.

### Changed

- Redesigned the UAG configuration workspace into a responsive layout with section navigation, live readiness and validation context, and persistent INI, JSON, PowerShell, and Docs previews.
- Added a source-backed UAG 2609 deployment gap matrix covering implemented settings, NIC applicability, exclusions, and uncertain keys.
- Moved `uagdeploy` runtime switches into the PowerShell output panel and added interactive or environment-backed headless deployment modes.
- Added platform-aware VM-name guidance and clarified immutable/redeploy behavior for root and Admin UI passwords in the UI and generated runbooks.
- Validated deployment image formats per platform, retained vSphere `.ova` local/URL input, and restricted Hyper-V source images to local `.vhdx` paths.
- Kept Blast allowed Host header values comma-separated in INI and arrays in settings JSON while providing a validated add/remove row editor.
- Expanded UAG 2609 Horizon coverage and documented where sample, runtime-only, unsupported, or uncertain settings differ from the published schema.

### Fixed

- Tightened NIC network requirements and topology gating across one-, two-, and three-NIC deployments.
- Removed duplicate Nutanix/OpenShift schema groups that prevented Network & deploy from rendering after navigating away from another section.
- Required Horizon Workspace ONE UEM API URLs to be HTTPS origins without paths, query strings, fragments, or embedded credentials.
- Preserved imported DNS/NTP rows, SSH keys, trusted certificates, origin details, cascades, runtime controls, and platform-specific fields through generation and round trips.
- Promoted missing Horizon Connection Server trust configuration to a warning with click-through focus on the trusted certificate editor.

### Removed

- Removed the optional localhost thumbprint helper, its browser UI, client APIs, executable, package script, documentation, and container permissions; certificate paste and PowerShell methods remain available.

## Changelog conventions

- Add user-visible improvements and fixes under `Unreleased` using the appropriate Keep a Changelog section, such as `Added`, `Changed`, `Fixed`, or `Security`.
- Describe the outcome for users rather than implementation details, and keep each entry concise.
- Use past tense, link related references when useful, and move entries into a dated release heading when a release is published.
