# 🗺️ Gateway Forge roadmap

This roadmap highlights current priorities and longer-running work. It is directional rather than a release commitment: items may be reprioritized as UAG guidance and project needs evolve.

## 🚀 Near term

- 🔎 **Planned — audit paired JSON and INI exports against the Forge schema.** Await operator-provided, sanitized exports from the same UAG configuration, with the UAG version, export method and vendor deployment-package version identified where available. Compare field coverage, naming, types and import/export behavior without assuming the two formats have identical schemas; distinguish deployment file paths from embedded JSON content. Specifically audit SSH public keys and trusted CA certificates against existing Forge support and authoritative vendor sources, then add confirmed missing mappings/fields and regression fixtures. Remove passwords, private keys, tokens and environment-identifying data before sharing; use synthetic replacement content where needed.
- 🧪 **Planned — complete full Hyper-V support verification.** Storage/image guidance and guarded per-NIC access VLAN generation are implemented; audit release/package coverage and verify generated deployment, VLAN read-back, failure handling and service connectivity in an explicitly approved lab before claiming full live support. Track remaining work in [#139](https://github.com/erikgraa/gateway-forge/issues/139).
- 🧪 **Planned — add Pester-based UAG functional verification.** Develop high-level, configuration-driven checks against deployed UAGs, with explicit opt-in execution in a lab or other approved test environment. Detailed coverage will be defined before implementation.
- 🔐 **Planned — add a deployment-time secret wrapper.** Resolve credentials from an operator-selected secret-management provider on the deployment host, keeping the source INI passwordless and secret values out of the browser. Inject credentials into an isolated per-run temporary INI with restrictive permissions; invoke the vendor script against that copy rather than modifying/restoring the original. Fail clearly on missing secrets, verify locator handling against the deployed tool version, avoid secret-bearing logs, and clean up in `finally` on success or failure. Account for credentials exposed through vendor process arguments/logs and interrupted cleanup; deletion is not guaranteed secure erasure. Test successful deployment, missing credentials and failure cleanup before claiming unattended support. Coordinate provider choices with [#58](https://github.com/erikgraa/gateway-forge/issues/58); this wrapper is not implemented.

### 🔥 High priority

- 📱 **Planned — support smartphones and tablets.** Make the configuration builder usable on phone and tablet screens in portrait and landscape, with touch-friendly controls, responsive navigation/forms, and accessible topology, template previews and output panels. Verify the complete configure/import/export workflow on mobile browsers; mobile support is not yet validated.
- 🧠 **Planned — add Workspace ONE Intelligence support.** Verify `[WorkspaceOneIntelligenceSettings1]` and its supported keys, version/platform availability and JSON mapping against authoritative sources before adding UI, validation, import/export, topology representation and regression coverage. This integration is not currently implemented.
- ✉️ **Planned — add `AirwatchSecureEmailGateway` support.** Verify the vendor section, supported fields, UAG version availability, shared/standalone selection, runtime credentials, JSON mapping and deployment-script parameters before implementation.
- 🔑 **Planned — add JWT support.** Verify the UAG JWT configuration surface, supported claims/signing inputs, version and service availability, and then add source-backed schema, UI, import/export, validation and generation coverage.
- 🌐 **Planned — add HA/VIP support.** Verify the supported high-availability topology, virtual IP ownership and failover constraints, required networking inputs, and vendor deployment/configuration surfaces before modeling multi-node output.

## 🔭 Future goals

- 🚀 **Investigative — rewrite `uagdeploy` with PowerCLI bootstrap and API-based configuration.** Explore a PowerShell deployment path using vSphere PowerCLI rather than requiring `ovftool`. Validate whether `Import-VApp` and vSphere APIs can import UAG, map its networks and supply the minimal bootstrap properties needed for networking and admin access. Investigate applying service configuration after authenticated API readiness through the UAG settings PUT API rather than injecting the full configuration through OVF properties. Require trusted HTTPS reachability to the management API on port 9443, secure runtime authentication and certificate/secret materialization; the operator need not be on the same subnet if routing and firewall policy permit access. Include structured, redacted stage/error logging and post-configuration read-back verification, with functional checks aligned to the planned Pester work. Verify release-specific payload mappings and update semantics before implementation; current Forge JSON is not a verified drop-in API request. PowerCLI bootstrap feasibility and this two-stage deployment path are not verified or supported today.
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
