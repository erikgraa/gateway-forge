# Gateway Forge roadmap

This roadmap highlights current priorities and longer-running work. It is directional rather than a release commitment: items may be reprioritized as UAG guidance and project needs evolve.

## Near term

### High priority

- **Planned — reject malformed IPv4 addresses.** Require IPv4 inputs to contain exactly four octets so values with five or more octets are rejected for both individual-address fields and IP-list fields. Add regression tests for both input types.
- **Planned — add row-based DNS and NTP list editing.** Support adding, removing, validating, importing, and exporting individual DNS and fallback NTP server rows. ([#48](https://github.com/erikgraa/gateway-forge/issues/48))
- **Planned — expose the SSH public key when SSH key access is enabled.** Confirm the supported UAG key and format, then show a contextual public-key input with validation and import/export coverage. ([#49](https://github.com/erikgraa/gateway-forge/issues/49))
- **Planned — verify and enforce required topology networks.** Validate the required networks and NIC-role mapping for one-, two-, and three-NIC deployments, including the unresolved two-NIC role mapping. ([#51](https://github.com/erikgraa/gateway-forge/issues/51))
- **Planned — publish authoritative sources and reference guidance.** Document the authoritative product and tooling sources, distinguish verified guidance from inference, and define how references are maintained. ([#50](https://github.com/erikgraa/gateway-forge/issues/50))
- **Planned — complete the General schema and static routes.** Audit the UAG 2609 General/deployment schema and add supported gaps, including per-NIC `routes0`-`routes2` handling. Static-route format and NIC cardinality mappings require official-source verification. ([#53](https://github.com/erikgraa/gateway-forge/issues/53))
- **Planned — add Workspace ONE Tunnel configuration and a template.** Model the supported `[Airwatch]` settings with schema, validation, import/export, generated output, and a ready-to-use template. Key and platform mappings require official-source verification. ([#54](https://github.com/erikgraa/gateway-forge/issues/54))
- **Planned — support Nutanix and OpenShift Virtualization.** Add verified deployment choices, artifacts, templates, and platform-specific validation for Nutanix and Red Hat OpenShift. Artifact and NIC/network mappings require official-source verification. ([#55](https://github.com/erikgraa/gateway-forge/issues/55))
- **Planned — complete the Horizon schema.** Audit all relevant Horizon INI settings, close documented schema gaps, and record explicit inclusion or exclusion decisions with regression coverage. ([#56](https://github.com/erikgraa/gateway-forge/issues/56))
- **Planned — add a trustedCert2-9 row editor.** Support up to eight additional trusted certificate path rows with ordered, validated import and generation across verified certificate-list targets. Key and target mappings require official-source verification. ([#57](https://github.com/erikgraa/gateway-forge/issues/57))
- **Planned — polish the live topology.** Improve architecture clarity, dependencies, responsiveness, accessibility, and stale-edge handling while preserving live updates and performance. ([#59](https://github.com/erikgraa/gateway-forge/issues/59))
- **Planned — document passwordless stateless redeployments.** Explain omitted root/admin password behavior, operational tradeoffs, and intentionally stateless redeployment guidance without implying unsupported passwordless behavior. Official-source verification is required before guidance is published. ([#60](https://github.com/erikgraa/gateway-forge/issues/60))

## Future goals

- **Future goal — integrate secrets and PKI providers.** Follow the [provider integration design](docs/secret-pki-provider-design.md) and milestone gates before enabling a reviewed adapter; the default workflow remains browser-only and offline-capable. ([#58](https://github.com/erikgraa/gateway-forge/issues/58))

## Ongoing

- Keep supported UAG versions and version-specific fields aligned with the Omnissa Lifecycle Matrix and deployment documentation.
- Improve validation and import coverage to catch malformed or ambiguous configurations.
- Maintain the existing client-side, privacy-preserving workflow and deployment output quality.

## Status and contribution conventions

- **Planned:** accepted for the roadmap but not actively being implemented.
- **Future goal:** valuable work that needs discovery, design, or prerequisites before it is ready for implementation.
- **In progress:** implementation is underway, usually linked to an issue or pull request.
- **Done:** the work has shipped and supporting documentation and tests are complete where applicable.

Open an issue to propose a roadmap item or change. Each implementation should link to its tracking issue, update the roadmap when its status changes, and include tests for behavior changes.
