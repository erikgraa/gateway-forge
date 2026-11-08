# Gateway Forge roadmap

This roadmap highlights current priorities and longer-running work. It is directional rather than a release commitment: items may be reprioritized as UAG guidance and project needs evolve.

## Near term

### High priority

- **Planned — reject malformed IPv4 addresses.** Require IPv4 inputs to contain exactly four octets so values with five or more octets are rejected for both individual-address fields and IP-list fields. Add regression tests for both input types.

## Ongoing

- Keep supported UAG versions and version-specific fields aligned with the Omnissa Lifecycle Matrix and deployment documentation.
- Improve validation and import coverage to catch malformed or ambiguous configurations.
- Maintain the existing client-side, privacy-preserving workflow and deployment output quality.

## Status and contribution conventions

- **Planned:** accepted for the roadmap but not actively being implemented.
- **In progress:** implementation is underway, usually linked to an issue or pull request.
- **Done:** the work has shipped and supporting documentation and tests are complete where applicable.

Open an issue to propose a roadmap item or change. Each implementation should link to its tracking issue, update the roadmap when its status changes, and include tests for behavior changes.
