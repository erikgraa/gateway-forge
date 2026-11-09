# 🗺️ Gateway Forge roadmap

This roadmap highlights current priorities and longer-running work. It is directional rather than a release commitment: items may be reprioritized as UAG guidance and project needs evolve.

## 🚀 Near term

### 🔥 High priority

- 📱 **Planned — support smartphones and tablets.** Make the configuration builder usable on phone and tablet screens in portrait and landscape, with touch-friendly controls, responsive navigation/forms, and accessible topology, template previews and output panels. Verify the complete configure/import/export workflow on mobile browsers; mobile support is not yet validated.
- 🧠 **Planned — add Workspace ONE Intelligence support.** Verify `[WorkspaceOneIntelligenceSettings1]` and its supported keys, version/platform availability and JSON mapping against authoritative sources before adding UI, validation, import/export, topology representation and regression coverage. This integration is not currently implemented.
- ✉️ **Planned — add `AirwatchSecureEmailGateway` support.** Verify the vendor section, supported fields, UAG version availability, shared/standalone selection, runtime credentials, JSON mapping and deployment-script parameters before implementation.
- 🔑 **Planned — add JWT support.** Verify the UAG JWT configuration surface, supported claims/signing inputs, version and service availability, and then add source-backed schema, UI, import/export, validation and generation coverage.
- 🌐 **Planned — add HA/VIP support.** Verify the supported high-availability topology, virtual IP ownership and failover constraints, required networking inputs, and vendor deployment/configuration surfaces before modeling multi-node output.

## 🔭 Future goals

- 🚀 **Investigative — rewrite `uagdeploy` so vSphere deployment does not require OVF Tool.** Explore a PowerShell `uagdeploy.ps1` path using vSphere PowerCLI rather than requiring `ovftool`. Validate whether `Import-VApp` can import the UAG appliance and correctly apply its deployment properties, network mappings and configuration before choosing an implementation. `Import-VApp` feasibility and this deployment path are not verified or supported today.
- 🔑 **Future goal — integrate secrets and PKI providers.** Follow the [provider integration design](docs/secret-pki-provider-design.md) and milestone gates before enabling a reviewed adapter; the default workflow remains browser-only and offline-capable. ([#58](https://github.com/erikgraa/gateway-forge/issues/58))
- 🤖 **Future goal — automate robust UAG schema/key diff detection.** Layer source-aware detection of new, removed, and renamed keys onto the existing weekly lifecycle workflow, compare authoritative schemas and `since`/`until` version gates, fail explicitly on parsing or availability errors, and deduplicate tracking issues. Record snapshot/source provenance and confidence, with fixture tests for parser and comparison behavior. ([#92](https://github.com/erikgraa/gateway-forge/issues/92))

## 🔄 Ongoing

- 📅 Keep offered UAG versions and version-specific fields aligned with the Omnissa Lifecycle Matrix and deployment documentation.
- 🧪 Improve validation and import coverage to catch malformed or ambiguous configurations.
- 🛡️ Maintain the existing client-side, privacy-preserving workflow and deployment output quality.

## 🏷️ Status and contribution conventions

- 📌 **Planned:** accepted for the roadmap but not actively being implemented.
- 🔭 **Future goal:** valuable work that needs discovery, design, or prerequisites before it is ready for implementation.
- 🔎 **Investigative:** a feasibility question that must be validated before an implementation or support claim is made.
- 🚧 **In progress:** implementation is underway, usually linked to an issue or pull request.
- ✅ **Done:** the work has shipped and supporting documentation and tests are complete where applicable.

Open an issue to propose a roadmap item or change. Each implementation should link to its tracking issue, update the roadmap when its status changes, and include tests for behavior changes.
