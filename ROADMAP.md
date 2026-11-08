# Gateway Forge roadmap

This roadmap highlights current priorities and longer-running work. It is directional rather than a release commitment: items may be reprioritized as UAG guidance and project needs evolve.

## Near term

### High priority

- **Planned — reject malformed IPv4 addresses.** Require IPv4 inputs to contain exactly four octets so values with five or more octets are rejected for both individual-address fields and IP-list fields. Add regression tests for both input types.
- **Planned — add row-based DNS and NTP list editing.** Support adding, removing, validating, importing, and exporting individual DNS and fallback NTP server rows. ([#48](https://github.com/erikgraa/gateway-forge/issues/48))
- **Planned — expose the SSH public key when SSH key access is enabled.** Confirm the supported UAG key and format, then show a contextual public-key input with validation and import/export coverage. ([#49](https://github.com/erikgraa/gateway-forge/issues/49))
- **Planned — verify and enforce required topology networks.** Validate the required networks and NIC-role mapping for one-, two-, and three-NIC deployments, including the unresolved two-NIC role mapping. ([#51](https://github.com/erikgraa/gateway-forge/issues/51))
- **Planned — publish authoritative sources and reference guidance.** Document the authoritative product and tooling sources, distinguish verified guidance from inference, and define how references are maintained. ([#50](https://github.com/erikgraa/gateway-forge/issues/50))

## Ongoing

- Keep supported UAG versions and version-specific fields aligned with the Omnissa Lifecycle Matrix and deployment documentation.
- Improve validation and import coverage to catch malformed or ambiguous configurations.
- Maintain the existing client-side, privacy-preserving workflow and deployment output quality.

## Status and contribution conventions

- **Planned:** accepted for the roadmap but not actively being implemented.
- **In progress:** implementation is underway, usually linked to an issue or pull request.
- **Done:** the work has shipped and supporting documentation and tests are complete where applicable.

Open an issue to propose a roadmap item or change. Each implementation should link to its tracking issue, update the roadmap when its status changes, and include tests for behavior changes.
