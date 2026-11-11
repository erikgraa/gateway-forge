# Changelog

All notable user-facing changes to UAG Foundry are documented here. Earlier releases were named Gateway Forge; historical entries retain their original names and links. This format follows the [Keep a Changelog](https://keepachangelog.com/) structure.

## Unreleased

## 0.9.0 - 2026-11-11

### Added

- Scenario-first native workspaces for Single UAG, Horizon UAG topology and Web proxy, with named browser-local drafts and blank/default configurations.
- Horizon UAG groups, shared templates, individual appliance identity/address/destination controls, removal with Undo and checked grouped fleet downloads with compatible topology imports. Static validation does not certify live connectivity or failover.
- Visible “UAG group” terminology instead of “Backend group,” without migrating existing labels or topology identifiers; the overview links to Omnissa’s Horizon Architecture reference.
- Space-free INI paths in fleet ZIPs: whitespace becomes hyphens, stable IDs prevent filename collisions, and manifest/README references stay aligned without changing configuration values or contents.
- Original purple, Harbor and Warm slate palettes independent of System, Light and Dark appearance modes.
- Confirmed Clear all drafts alongside individual deletion, with count, keyboard/focus safeguards and storage-failure protection. Previous legacy configuration, appearance and unsupported physical registries remain intact.
- Landing-page builder version and source/Omnissa links, retaining the independent-community disclaimer.
- Theme-aware topology and action icons, stable backend-group accents, and read-only green checked-box/red warning validation statuses. Blocking links identify the affected appliance by its INI VM name.
- Confirmation before removing a UAG or UAG group, with safe Cancel focus, a group member count and retained Undo behavior.
- Collapsible UAG groups with shared UAG High Availability (XML API VIP) and Connection Server branches, simpler gap-routed desktop arrows and separate individual or imported destinations.
- Friendly Configuration ready statuses; the bottom error panel hides when clear. Selected-appliance conflicts also appear beside address inputs, and unused NIC0 IPv6 controls stay hidden until an active member has a configured address.
- Full UAG configuration editor and Download fleet configuration actions with readable labels and icons.
- Compact read-only fleet overview above collapsible UAG groups, with Horizon clients, supported HA VIPs, appliance names and configured Connection Server destinations; no configuration details or inferred pods/server pools.
- Narrower fleet workspace and compact overview/backend diagrams, with tighter node spacing and separate HA DNS guidance instead of a tall VIP card.
- Validation & lint above full-editor fields, retaining field navigation and severity counts with a bounded findings list; topology blocking findings open the affected UAG at the exact field.
- Slightly wider fleet and backend-group diagrams preserve the compact layout and narrow-screen scrolling; Clear all drafts gains a decorative trash icon and theme-aware destructive-action tint without changing confirmation safeguards.
- Backend LB / pool selections reveal a contextual Cloud Pod Architecture note without inferring or configuring federation, pod membership, global entitlements or inter-pod connectivity.
- Fleet collision messages identify conflicting appliances by INI name and member ID, including address, duplicate-name and VIP/appliance collisions in the full configuration editor.
- Independently collapsible fleet overview with an optional dotted hypothetical client-facing LB and independent per-destination LB / Connection Server pool switches. Pools represent 1–N unknown members without combining distinct endpoints; visual toggles do not change or save configuration.
- New UAG groups start without inherited network addresses, subnet masks, gateways, DNS, routes or custom overrides.
- Unique numeric Group IDs across active supported native HA groups and cross-group VIP collision guardrails, without rewriting retained configurations.

### Fixed

- Rejected extension-only source images, including local/UNC paths or OVA URLs without a filename before the extension. Existing platform format restrictions and imported source spelling are retained.
- Made the incomplete Horizon-baseline prerequisite an amber warning beside the topology actions, replacing it with next-step guidance once the baseline is valid.
- Blocked static IPv4 default gateways equal to the NIC0 appliance address, with linked errors on both fields and the same policy in full-editor, topology and checked-fleet validation. Imported values are retained; hidden DHCP/IPv6-only and managed Azure fields are not treated as active static settings.

### Changed

- Renamed Gateway Forge to UAG Foundry with the original Cast gateway U + arrow mark across the app, browser metadata, icons, sharing artwork, generated guidance and refreshed screenshots. README artwork has a white-backed light treatment and transparent dark treatment.
- Updated repository links to `erikgraa/uag-foundry` and the public address to `uagfoundry.graa.dev`. Existing GHCR packages keep their separate namespace; browser drafts and preferences do not move across domains. See the technical guide migration notes before switching.
- Replaced duplicate New/save controls with one icon-labelled teal Save & return action; drafts have matching scenario accents and explicit labels/icons.
- Trimmed trailing whitespace in ordinary single-line fields on blur/save/export while preserving passwords, raw/multiline content, opaque imports and untouched advanced locators.
- Added source-backed INI `honorCipherOrder` with a true default and explicit-false preservation; clarified Azure NIC subnets, optional NSGs, existing NIC0 public-IP resource names and optional resource-group fallbacks. Applicable subnet requirements are builder safety policy, not a new vendor claim.
- Simplified README and moved detailed support evidence, storage/output limitations and hosting guidance to the technical guide. Preserved legacy browser-storage keys and fleet-format identifiers.

Targeted desktop/tablet/phone checks and automated tests do not establish complete mobile workflows or certify appliance deployment/services.

## 0.8.7 - 2026-11-10

### Changed

- Simplified workspace hierarchy: compact target summary with expandable release/platform controls and advice, visible older-release/platform caution markers, contextual section descriptions and less repetitive readiness/navigation text.
- Moved destructive-deployment advice beside artifact Copy and into Export. Expandable details retain all source-backed platform risks, including Azure OS-disk/NIC deletion; generated PowerShell and runbook warnings remain unchanged.
- Collapsed runtime guidance and nonblocking lint by default; blocking validation findings remain expanded. All controls, configuration values, gates, import/export semantics and saved-draft compatibility are preserved.
- Refreshed README guidance and screenshots for the quieter workspace. Targeted desktop/tablet/phone checks do not establish full mobile workflow or live appliance coverage.

### Fixed

- Kept the desktop configuration preview in its assigned grid column when the divider is hidden, so Collapse leaves a clickable Output control and reopening no longer requires a refresh.

## 0.8.6 - 2026-11-10

### Changed

- Replaced Horizon response security-header text entry with key/value rows. Both fields are required for each added row; no examples, placeholders or appliance defaults are seeded. Removing all rows restores default appliance behavior.
- Preserved untouched imported spelling/escaping and raw JSON/quoted INI editing. Incomplete rows and duplicate header names remain in saved drafts with accessible errors instead of being silently dropped or overwritten. Header names are compared case-insensitively.
- Kept the existing UAG 2506 gate, disabled-Horizon value preservation and INI-only serialization; settings JSON and live header combinations remain unverified.

## 0.8.5 - 2026-11-10

Changes since 0.8.0, including the merged output/configuration work and the reviewed OIDC grouping and deployment warnings. Intermediate 0.8.1–0.8.4 releases were not published. This builder version does not certify every UAG deployment or service.

### Added

- Repeatable OIDC provider configuration, numbered INI import/export, duplicate-ID and Horizon-reference checks, safe legacy imports and OIDC/JWT draft restoration on reload ([#148](https://github.com/erikgraa/gateway-forge/pull/148)).
- A prominent VM-replacement advisory for all five supported platforms, also emitted before deployment in PowerShell and Docs: same-name VMs are deleted/recreated, not updated in place. The warning identifies the deployment VM name rather than the OS hostname, includes Azure OS-disk/NIC deletion, Nutanix cluster/duplicate-name handling and OpenShift namespace/deletion-wait behavior, and recommends checking the target, backups and downtime.
- A draggable desktop divider between the form and configuration preview, with keyboard resizing, bounded widths, a locally remembered preference and double-click reset. Collapse and narrow-screen stacked layouts are preserved.
- Optional High availability configuration before Edge services: unseeded integer Group ID (1–255), IPv4 VIP, exact `[HighAvailability]` INI keys, verified `loadBalancerSettings` JSON mapping, retained disabled values and field-associated guidance. Azure is excluded; multi-node deployment and live failover remain unverified.
- Standalone-first Secure Email Gateway configuration and independent JWT consumer/producer profiles in one settings card, with source-backed INI mappings, synthetic round-trip coverage, secret/material stripping and explicit deployment-host file/JSON limitations. Appliance exports and live SEG interoperability remain unverified.
- SEG MEM and Azure subscription GUID-format validation, advisory unknown-Azure-region feedback, and precautionary older-release deployment-script/schema guidance. Unknown regions remain accepted.
- An accessible output-pane collapse/expand control: a desktop side tab or compact bar on narrower layouts, keeping the configuration, selected artifact and mounted preview intact.

### Changed

- Made subsection Enabled controls more prominent with larger native checkboxes, bordered controls, green active states and visible keyboard focus; disabled sections retain their configuration values.
- Grouped all OIDC provider cards in one enabled section. Confirmed the vendor module intentionally starts with unnumbered `[OidcProviderSetting]`; visual card numbering does not change INI suffixes, stored values or Horizon references. Client secrets remain deployment-time prompts.
- Added distinct theme-aware platform-button accents while preserving keyboard focus, selected emphasis and disabled release gating.
- Disabled all non-passthrough Horizon authentication methods until their RADIUS, RSA SecurID, OpenID Connect, SAML or X.509 providers are enabled in Identity and access. Combined methods require every named provider; existing/imported selections remain intact with accessible prerequisite guidance. Reverse-proxy authentication selectors are unchanged.
- Added `/iwa(.*)` as the last alternative in the Horizon proxy-pattern example, without filling or rewriting existing patterns.
- Matched the operator-confirmed Horizon security-header INI format: quoted JSON with one escaping layer, string-map validation, no prefilled appliance defaults, and preservation of explicitly imported defaults/custom headers. Settings JSON support remains unverified and omitted.
- Renamed steps to TLS Server Certificates and Identity and access, placed Web reverse proxy between Horizon and Workspace ONE Tunnel, grouped JWT settings, and moved default-off Quiesce mode to the end of Appliance settings.
- Made SSH restriction guidance follow the effective configured port, rejected HA VIP collisions with any retained NIC0–NIC2 IPv4 address, and marked an empty Edge services step with warning feedback.
- Made the PowerShell preview's Run-time options section collapsible, expanded by default. Collapsing preserves selected options and generated artifacts.
- Made INI, JSON, PowerShell and Docs output tabs more prominent with distinct icons, larger labeled buttons, a stronger selected state and keyboard arrow/Home/End navigation. Tabs wrap on narrow screens without overlapping Copy; generated artifacts are unchanged.
- Gave the desktop output preview more width while retaining its collapse control and horizontal scrolling for long commands and configuration lines.
- Split PowerShell deployment/password guidance into short comment lines with spacing between topics. Executable commands and embedded configuration remain unchanged; the formatted comments also appear in copied/downloaded scripts.
- Refreshed all six README screenshots for 0.8.5 and updated their capture helper to use current section labels rather than obsolete step numbers.
- Closed the implemented Hyper-V support and native HA/VIP tracking items ([#139](https://github.com/erikgraa/gateway-forge/issues/139), [#145](https://github.com/erikgraa/gateway-forge/issues/145)) and removed their pending roadmap entries. Specific live-test and certification limitations remain documented.

## 0.8.0 - 2026-11-10

First tagged Gateway Forge release. The previous package-only `1.0.0` value was not a published release. This pre-1.0 version identifies the builder, not the selected UAG version or certification of every deployment path.

### Added

- Displayed the Gateway Forge version in the tool footer, sourced from package metadata and independent of the selected UAG release; added a README badge tracking the latest GitHub release.
- Explicitly recorded Admin UI SAML authentication, Workspace ONE Content Gateway and Workspace ONE Tunnel as still untested, without extending confirmed Horizon or scoped Hyper-V deployment coverage.
- Platform-specific vSphere `.ova` and Hyper-V `.vhdx` source image examples, with no seeded VMware source in fresh drafts and no rewriting of saved/imported paths. Documented operator-supplied named-adapter VLAN examples for one/two/three NICs while preserving generated deployment/identity safeguards.
- Optional active-layout Hyper-V access VLAN fields (1–4094), saved in browser drafts and emitted as guarded post-deployment PowerShell without adding vendor INI/JSON keys. Adapter-role checks are based on read-only vendor-script inspection; live Hyper-V execution remains unverified.
- Added display-only line-number gutters to INI, JSON and PowerShell previews, with long-line horizontal scrolling and unchanged selection, clipboard and downloaded artifact content.
- Added guided vCenter target editing and accessible feedback for missing locator parts, incomplete usernames, and pasted protocols/paths, while retaining imported spelling and advanced locators ([#128](https://github.com/erikgraa/gateway-forge/pull/128), [#131](https://github.com/erikgraa/gateway-forge/pull/131)).
- Added expandable explanations for hidden SSH/key-access, Horizon protocol, and NIC/static-IPv4 settings without discarding their saved values ([#131](https://github.com/erikgraa/gateway-forge/pull/131)).
- Added static social-sharing metadata and a branded preview image, with rehosting and crawler-cache guidance ([#134](https://github.com/erikgraa/gateway-forge/pull/134)).
- Documented operator-tested Horizon settings application on vSphere with UAG 2609 and OVF Tool 5.0; distinguished reported 5.1/9.1 regressions and untested platforms from verified results ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
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

- Updated Hyper-V support status to distinguish implemented storage/image/VLAN generation from scoped operator deployment evidence and pending full-platform validation ([#139](https://github.com/erikgraa/gateway-forge/issues/139)); no live generated-VLAN or untested-service coverage is claimed.
- Gave Templates a dedicated violet section accent and each template card a distinct, theme-aware accent with descriptive labels, preserving template behavior ([#132](https://github.com/erikgraa/gateway-forge/pull/132), [#133](https://github.com/erikgraa/gateway-forge/pull/133)).
- Explained fully unattended vSphere prerequisites, credentialed UPN target ordering, plaintext target persistence, and the generated PowerShell wrapper's INI rewrite across UI and deployment documentation ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Expanded the roadmap with a deployment-time secret wrapper, functional deployment tests, and an investigative PowerCLI/API bootstrap alternative; these remain planned, not implemented ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Made TLS PEM/key and PFX inputs mutually exclusive, with explicit mode selection, imported-conflict validation, and deployment-time protected-PFX password guidance. Certificate file paths remain INI-only, with an explicit JSON-preview notice.
- Split deployment and networking fields into separate Step 2 cards, replaced platform and recommended-release dropdowns with direct buttons, and renamed legacy release choices to “Other releases”.
- Disabled Horizon, Blast and Horizon Tunnel on first load/reset; templates still opt in explicitly.
- Show the topology only in enabled Horizon, Workspace ONE Tunnel and Web Reverse Proxy sections; clarify management-only NIC1 and backend-only NIC2 for three-NIC deployments.
- Redesigned the UAG configuration workspace into a responsive layout with section navigation, live readiness and validation context, and persistent INI, JSON, PowerShell, and Docs previews.
- Added a source-backed UAG 2609 deployment gap matrix covering implemented settings, NIC applicability, exclusions, and uncertain keys.
- Moved `uagdeploy` runtime switches into the PowerShell output panel and added interactive or environment-password deployment modes; supplying root/Admin UI passwords alone does not guarantee unattended execution.
- Added platform-aware VM-name guidance and explained separate root/Admin UI password rules, the Admin UI FIPS minimum, and administrator SAML's effect on password authentication. Omitted password parameters trigger the official deployment scripts' prompts ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Validated deployment image formats per platform, retained vSphere `.ova` local/URL input, and restricted Hyper-V source images to local `.vhdx` paths.
- Kept Blast allowed Host header values comma-separated in INI and arrays in settings JSON while providing a validated add/remove row editor.
- Expanded UAG 2609 Horizon coverage and documented where sample, runtime-only, unsupported, or uncertain settings differ from the published schema.

### Fixed

- Removed the fresh-draft VMware datastore sample so Hyper-V can show its filesystem-path placeholder; existing saved/imported/custom values are not guessed at or reset.
- Clarified Hyper-V deployment storage as a host filesystem path with a Windows path example, while retaining the `ds` INI key, imported/custom values and vSphere datastore terminology.
- Omitted exact default Horizon `authMethods=passthrough` from INI so appliance defaults can apply; placed explicit non-default methods first and restored passthrough when importing a Horizon section without the key. JSON and saved selections remain unchanged ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Passed the configured CEIP choice explicitly as the named `-ceipEnabled 'yes'`/`'no'` runtime argument instead of a hardcoded positional value ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Flagged duplicate DNS/NTP servers and regular/fallback NTP overlap with row-specific errors, without rewriting stored values or restricting reuse across DNS and NTP ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
- Required an operator-provided syslog server CA PEM path for TLS and emitted the configured Admin UI minimum password length explicitly, including its default ([#136](https://github.com/erikgraa/gateway-forge/pull/136)).
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
