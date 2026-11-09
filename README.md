<p align="center">
  <img src="assets/gateway-forge-icon.png" alt="Gateway Forge" width="140" />
</p>

<h1 align="center">Gateway Forge</h1>
<p align="center">Visual config builder for <strong>Omnissa Unified Access Gateway (UAG)</strong> - generates <code>uagdeploy</code> INI, settings JSON and PowerShell. 100% client-side.</p>

![Gateway Forge builder (dark)](docs/screenshots/builder-dark.png)

## 🚀 Demo

A live demo is available at **[gateway-forge.graa.dev](https://gateway-forge.graa.dev)** - everything runs in your browser, nothing is uploaded.

See the **[project roadmap](ROADMAP.md)** for planned work and ongoing priorities.
See **[SOURCES.md](SOURCES.md)** for the authoritative product and tool
references, the project evidence labels, and the source-review policy.

### Planned and investigative work

The [roadmap](ROADMAP.md) includes broader prerequisite-aware visibility for settings, helpers, topology and sections; planned `[WorkspaceOneIntelligenceSettings1]` support after schema verification; and an **investigation** into native vSphere PowerShell deployment without `ovftool`. `New-VApp` or an equivalent PowerCLI approach still needs feasibility validation; it is not a supported deployment path today. These are roadmap items, not completed features.

## ✨ Features

- 📄 **INI for `uagdeploy.ps1`** (the primary deploy path - the script takes an INI via `-iniFile`, not JSON) **and settings JSON** for the admin UI *Import settings* / `PUT /rest/v1/config/settings`.
- 💻 **Platform-aware deployment output** for vSphere, Hyper-V, Azure and Nutanix AHV. Nutanix generates the documented `[Nutanix]` INI and `uagdeployntnx.ps1` invocation for a QCOW2 image uploaded to Prism Central.
- ☸️ **Red Hat OpenShift Virtualization (Limited Availability):** generates the documented CDI `DataVolume` + `DataSource` YAML for a cluster-reachable QCOW2 URL, the `[OpenShift]` INI, `oc` preparation/verification commands and `uagdeployopenshift.ps1` invocation. A local QCOW2 uses explicit console-upload runbook mode rather than an invalid fake manifest.
- 🧬 **Version-aware form** driven by a data-driven schema ([`src/lib/schema.ts`](src/lib/schema.ts)): fields appear/disappear per UAG version and platform.
- 🎯 **Scope:** Horizon, Workspace ONE Tunnel, Workspace ONE Content Gateway and Web Reverse Proxy edge services; RADIUS, SAML, OpenID Connect, RSA SecurID and certificate authentication; TLS protocols/ciphers/certificates, outbound proxy, syslog (UDP/TCP/TLS/MQTT) and SNMP (v1/v2c/v3). Platforms: vSphere, Hyper-V, Azure, Nutanix AHV and Red Hat OpenShift Virtualization. OIDC, SecurID, certificate auth and outbound proxy are emitted to the INI only (their JSON shape is not documented).
- 🪜 **Cascading (double DMZ):** pick *Outer UAG* or *Inner UAG* under Horizon. The outer UAG is generated as a Horizon-WRP reverse proxy (documented proxy pattern, inner UAG URL/thumbprint) plus optional orwardrules for Blast/UDP tunnel/PCoIP; the inner UAG is a standard Horizon edge. Two ready-made templates are included. (Workspace ONE Tunnel cascade mode is not covered.)
- 📥 **Import** an existing INI or settings JSON (paste or file) with a preview of what was recognised/ignored; the UAG version is detected from the image file name.
- ✅ **Validation + best-practice lint** (required fields, IPv4/URL/port/thumbprint formats, RADIUS timing, duplicate IPs, TLS 1.0/1.1, SSH, missing syslog/NTP, no MFA on an external gateway, SHA-1 thumbprints …). Click a finding to jump to the field.
- 🗺️ **Topology diagram** that updates live, 📋 **templates** (e.g. *Horizon external access with RADIUS MFA*), 📝 **Docs** tab (Markdown runbook summary), ⌨️ **command palette** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>).
- 🌗 **Light/dark theme** - follows `prefers-color-scheme` by default, your choice is remembered.
- **Administrator access:** UAG 2609 `[adminSAMLSettings]` configuration and separate management/Admin UI TLS certificate paths in `[SSLCertAdmin]`.

| Light theme | RADIUS & validation |
| --- | --- |
| ![Light](docs/screenshots/builder-light.png) | ![RADIUS](docs/screenshots/radius.png) |
| **JSON output** | **Command palette** |
| ![JSON](docs/screenshots/json.png) | ![Palette](docs/screenshots/palette.png) |
| **Import** |
| --- |
| ![Import](docs/screenshots/import.png) |

## 🛡️ Supported UAG versions

Gateway Forge supports every Omnissa UAG release that is **not end-of-life** according to the [Omnissa Lifecycle Matrix](https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html) (snapshot **2026-10-30**; UAG inherits the lifecycle of the product it is integrated with):

`2212 · 2303 · 2306 · 2309 · 2312 · 2406 · 2412 · 2503 · 2506 · 2512 · 2603 · 2606 · 2609`

2209 and older are no longer listed and are intentionally not offered. The list lives in [`src/lib/versions.ts`](src/lib/versions.ts) - update it when the matrix changes. Maintenance releases (e.g. `2509.1`) use the schema of their parent release.

Per-version field availability (`since` in the schema) was derived by diffing the published *Deploying and Configuring UAG* INI/Horizon reference pages of each release (2212 → 2609), e.g. `headersToBeLogged`/`minSHAHashSize` (2312), `enableAuthOnRedirectedSite`/`unrecognizedSessionsMonitoringEnabled` (2406), additional Blast/Tunnel external URLs and `disableWebClient` (2412), `originCheckEnabled` (2503), SAML IdP binding keys (2603). Treat gating as best-effort: Omnissa's pages reorganised over time, so a key may exist slightly earlier than the page first lists it.

The completed [UAG 2609 Horizon schema audit](docs/horizon-2609-schema-audit.md) records every documented Horizon row, the schema decision, exact type/default/version gate where known, and explicit exclusions or uncertainty. It was audited on **2026-11-08**.

## 🧭 Using it

1. Pick the **UAG version** and **platform** (vSphere, Hyper-V, Azure, Nutanix AHV or OpenShift Virtualization) in the header - or start from a **template**, or **Import** an existing INI/JSON. Nutanix output is available from UAG 2606; OpenShift output is UAG 2609 and Limited Availability.
2. Fill in the sections. Required fields and lint findings are flagged inline and in the *Validation & lint* panel.
3. Take the result from the right-hand panel: **INI**, **JSON**, **PowerShell** or **Docs**; *Copy* or *Download* (also in **Export**).
4. Deploy with the command shown for the selected platform. Every variant explicitly passes `-iniFile <config-file>`: vSphere `.\uagdeploy.ps1`, Hyper-V `.\uagdeployhv.ps1`, Azure `.\uagdeployaz.ps1`, Nutanix `.\uagdeployntnx.ps1`, and OpenShift `.\uagdeployopenshift.ps1` after preparing the bootable volume. Credential handling remains platform-specific.

   vSphere, Hyper-V and Azure also support **Headless** mode in the PowerShell tab, using `UAG_ROOT_PASSWORD` / `UAG_ADMIN_PASSWORD` from the runtime environment. Nutanix uses the verified interactive script flow.

Fresh sessions and **Reset** leave Horizon, Blast, Horizon Tunnel and Workspace ONE Content Gateway disabled; templates can explicitly enable them. The live topology appears in Horizon, Workspace ONE Tunnel, Workspace ONE Content Gateway and Web Reverse Proxy only when that section's service is enabled. In three-NIC deployments, NIC1 is management-only and NIC2 is backend-only (two-NIC deployments still combine management/backend on NIC1).

Additional Blast external URLs and Horizon/Workspace ONE/WRP host entries use add/remove rows. Host entries are limited to six, kept isolated per WRP instance, and exported as contiguous `hostEntry1` through `hostEntry6`; supported settings JSON uses the documented `hostEntries` array. Blast URLs remain comma-separated in INI and arrays in JSON.

Workspace ONE Content Gateway supports a dedicated `[AirwatchContentGateway]` section or `contentGatewayEnabled=true` in the shared `[Airwatch]` section. `cgConfigId` is emitted in INI and maps to `cgConfigurationId` in settings JSON. The UEM API password is runtime-only: interactive PowerShell lets the vendor script prompt, while headless mode reads `UAG_CONTENT_GATEWAY_API_PASSWORD` and passes `-awCGAPIServerPwd` for standalone mode or `-awAPIServerPwd` for shared mode. Outbound-proxy passwords remain interactive vendor prompts.

Administrator SAML is separate from Horizon SAML: enable it under **Authentication** on UAG 2609 and configure the matching IdP metadata. Its INI and settings JSON use `adminSAMLSettings`. Under **TLS**, choose a PEM chain/private-key pair or PFX for `[SSLCertAdmin]`. Certificate file paths are intentionally INI-only: settings JSON requires PEM content, which Gateway Forge does not read from local paths. Workspace ONE Tunnel remains INI-only as described in its source notes.

**Certificate modes:** `[SSLCert]` and `[SSLCertAdmin]` offer appliance-default, PEM/key-pair or PFX input. Switching mode clears incompatible paths and PFX aliases; mixed imported inputs remain available for correction and are validation errors. PEM requires both the certificate chain and private key. A password-protected PFX triggers the vendor script's interactive password prompt, even when root/admin parameters are supplied. Gateway Forge never collects or serializes a PFX password.

**SAML certificates and trust:** `[SAMLIdentityProviderMetadata]` accepts a dedicated PEM/RSA-private-key pair, never PFX. External IdP signing/encryption in `[IDPExternalMetadata1]` is also PEM-only (`signingCertificateType`, `signingPrivateKeyPem`, `signingCertChainPem`; `encryptionCertificateType`, `privateKeyPem`, `certChainPem`). Metadata XML is not a certificate-input mode. Add up to nine trusted CA PEM paths, exported contiguously as `trustedCert1` through `trustedCert9`, and optionally enter comma-separated `idpUrlThumbprints`, including `sha1:xx xx ...` syntax. Thumbprints are not required when CA rows are populated. These URL trust settings apply to the Artifact Resolution Service URL inside the metadata XML. They remain INI-only: uagdeploy reads the XML/certificate files and builds `idpURL` and certificate-content wrappers. The builder cannot manufacture JSON trusted-certificate arrays or a metadata-derived URL from local filenames; the JSON preview states this limitation explicitly. `[SAMLServiceProviderMetadata]` contains SP names/metadata XML, not a PFX/PEM wrapper, and remains outside this certificate change.

### Nutanix and OpenShift support boundaries

- **Nutanix AHV:** UAG 2606+ uses the native QCOW2 image format. Upload the image to Prism Central before deployment and provide existing cluster/subnet names. The official script creates the VM directly and **deletes/recreates** an existing VM with the same name. The official script prompts for root, Admin UI and Prism Central passwords when omitted. Gateway Forge keeps Nutanix deployment Interactive-only.
- **OpenShift Virtualization:** Limited Availability and requires Omnissa-granted access. Gateway Forge targets the official two-stage flow: a CDI bootable-volume preparation followed by the `uagdeployopenshift.ps1` VM deployment. The namespace, RWX-capable StorageClass, `NetworkAttachmentDefinition` resources, RBAC, capacity and any referenced NetworkPolicies must pre-exist. NAD mapping is numeric (`nadName0` = NIC0/eth0, `nadName1` = NIC1/eth1, `nadName2` = NIC2/eth2).
- **OpenShift local image:** the official web-console upload path is represented as an explicit Markdown runbook mode. Gateway Forge cannot upload a local browser file to the cluster and does not emit a misleading YAML reference to a local path.
- **Sizing:** OpenShift accepts an external `instanceType` name; the reference only states a minimum of 2 vCPU and 4 GB RAM and does not enumerate valid profile names. Disk size is enforced at 20 GiB or larger. The generated volume manifest uses `ReadWriteMany` and `Filesystem`.
- **NIC configuration boundary:** Nutanix and OpenShift generation currently models the documented IPv4 `DHCPV4` and `STATICV4` modes and numeric eth0/eth1/eth2 mapping. IPv6 modes, per-interface `routesN`, and `CustomConfig`/`ethNCustomConfig` inputs are intentionally not offered because they need additional source-backed validation.

### 📚 Where do the key names come from?

**Gateway Forge is documentation-first.** A setting is added to the schema only after its meaning and parameter name can be traced to an official Omnissa source; UI-only controls are not treated as proof of a stable INI key. Where the reference table, release page, and deployment sample disagree, the 2609 deployment sample is the generation source, older spellings are accepted on import, and the discrepancy is recorded in the audit matrix. Version gates are deliberately conservative, runtime-only or unsupported JSON settings are explicit exclusions rather than silent omissions, and inferred names or unresolved details remain visibly marked for appliance-export verification.

INI section and key names (`[General]`, `[Horizon]`, `[RADIUSAuth]`, `[SnmpSettings]`, `[SyslogServerSettingsN]`, `[WebReverseProxyN]`, `[IDPExternalMetadata1]`, `[SSLCert]`, `[Azure]`) were taken from the official Omnissa documentation - *Run PowerShell script to deploy* (sample INI), [*PowerShell deployment parameters*](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters), *Configure Horizon Settings*, the vSphere/Hyper-V/Azure deployment pages and *Non-Interactive mode deployment parameters*. The UAG 2609 `[General]` audit, including added static-route mapping, intentional exclusions and uncertain keys, is recorded in the [deployment gap matrix](docs/uag-2609-deployment-gap-matrix.md). Keys whose name is only inferred from a documented pattern (secondary RADIUS server `hostName_2`/`sharedSecret_2`) carry a **verify** badge in the UI; the SNMPv3 *security level* token is free text because the docs do not list the INI values.

The [source map](SOURCES.md#uag-ini-keys-and-deployment) records the exact
evidence hierarchy for these keys and distinguishes Omnissa documentation from
release-artifact observations and Gateway Forge assumptions.

The `[Nutanix]` and `[OpenShift]` sections, QCOW2 constraints, NIC mappings and OpenShift CDI manifest come from the official UAG 2609 platform pages. See [SOURCES.md](SOURCES.md) for the exact references, verified facts and documented non-goals.

### 🧾 Settings JSON - read this

Omnissa documents the JSON as an *export/import format* of the admin UI but does not publish a schema page; the authoritative schema is the Swagger UI on your appliance (`https://<uag>:9443/swagger`). Gateway Forge mirrors the admin-UI export structure (`systemSettings`, `edgeServiceSettingsList`, `authMethodSettingsList`, …) and uses the same key names as the INI. Deploy-time-only values (VM name, networks, IPs, certificate file paths …) are intentionally **not** part of the JSON. **Validate JSON on a non-production appliance first**, and prefer exporting a baseline from your own UAG and using *Import* here to compare.

## 🔒 Security & privacy

- Everything runs in your browser. **No telemetry and no network calls.**
- Secrets (RADIUS shared secrets, SNMP community/passwords) are **masked in the form**, **never saved** in the browser draft, and exported as `<REDACTED>` placeholders by default. Choose *Omit entirely* or *Include (plain text)* under the output panel. UAG root/Admin UI passwords are never asked for or stored by Gateway Forge. Interactive PowerShell lets `uagdeploy` prompt; headless PowerShell reads them from `UAG_ROOT_PASSWORD` and `UAG_ADMIN_PASSWORD` at runtime and fails clearly when either is absent.
- Omitting root/Admin UI password parameters from `uagdeploy.ps1` or its platform variants triggers interactive prompts; it does **not** by itself make console/Admin UI/API access unavailable. Both passwords must be supplied for [non-interactive deployment](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/NonInteractiveModeParameters).
- Treat the complete, validated INI as the recovery baseline and test that clean redeployment restores service. Keep deployment artifacts in an approved secrets-managed location and assess break-glass recovery, monitoring, password rotation, change control, backup and compliance.
- SSH public keys are public, so they are not treated as secrets. Paste one OpenSSH RSA key per line, or provide `.pub` file paths for INI deployment. The PowerShell artifact writes pasted keys to numbered companion files; settings JSON uses UAG's `sshPublicKeys` `{name, data}` array.
- The form state (minus secrets) is kept in `localStorage` so a refresh does not lose work; use **Reset** to clear it.
- Certificates are referenced by *file path* (read by `uagdeploy` at deploy time); certificate or key content is never stored.
- Future external secret-management and PKI integrations are design-only and explicitly opt-in; see the [provider security design and implementation roadmap](docs/secret-pki-provider-design.md).

## 🐳 Container

A self-contained image (static files + nginx, non-root, no outbound calls, strict CSP) is built nightly at 02:30 UTC by [container.yml](.github/workflows/container.yml), after type-check, tests and a Lifecycle Matrix comparison pass, and published as multi-arch (amd64/arm64) to GitHub Container Registry:

```bash
# Docker
docker run --rm -p 8080:8080 ghcr.io/erikgraa/gateway-forge:nightly

# Podman (rootless works; the image runs as a non-root user)
podman run --rm -p 8080:8080 ghcr.io/erikgraa/gateway-forge:nightly

# then open http://localhost:8080
```r

Tags: `nightly` / `latest` (newest build), `nightly-YYYYMMDD` and `sha-<commit>` (pin these for reproducibility). Build locally with `docker build -t gateway-forge .` or `podman build -t gateway-forge .`.

## 🛠️ Develop

Run locally with Node.js 20+:

```bash
npm install
npm run dev       # open http://localhost:5173
```

Validate a change before shipping:

```bash
npm test          # Vitest: generation, import/parsing, validation, thumbprints
npm run check     # svelte-check / TypeScript
npm run build     # static site in dist/ (relative base - host it anywhere)
npm run preview   # serve the production build locally
```

Stack: Vite + Svelte 5 + TypeScript. Layout:

| Path | Purpose |
| --- | --- |
| `src/lib/schema.ts` | Data-driven field schema (INI key, JSON key, version/platform gating, validation rules) |
| `src/lib/generate.ts` | INI + JSON generation, secret handling |
| `src/lib/importer.ts` | INI/JSON parsing and mapping back onto the schema |
| `src/lib/validate.ts` | Field validation and best-practice lint |
| `src/lib/certificate-input.ts` | Certificate-mode inference and explicit mode transitions |
| `src/lib/templates.ts` | Ready-made designs |
| `src/components/` | Svelte UI |
| `SOURCES.md` | Authoritative source map and evidence/source-review policy |

### 🧩 Adding a setting

Add a `Field` to a group in `schema.ts` (key, type, optional `since`/`until`, `rule`, `showIf`). The form, INI/JSON output, import mapping, validation and command palette pick it up automatically. See [CONTRIBUTING.md](CONTRIBUTING.md).

### 🌐 Hosting

The demo is deployed to GitHub Pages by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`. The build is a plain static site with a relative base path, so `dist/` can be hosted anywhere. A weekly workflow checks the Omnissa Lifecycle Matrix and opens an issue when the supported UAG versions change.

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for notable user-facing improvements and fixes.

## 📄 License

[MIT](LICENSE)

## ⚠️ Disclaimer

Gateway Forge is an independent community tool and is not affiliated with or endorsed by Omnissa. Always review generated configuration before deploying to production.
