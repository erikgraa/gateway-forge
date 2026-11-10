# Nutanix and OpenShift deployment sources

Gateway Forge distinguishes official product contracts from UI guidance and project inference. This file records the authoritative deployment references used for source-backed behavior.

## Omnissa Unified Access Gateway 26.09

### Administrator SAML, management TLS and host entries

- [Omnissa EUC deployment sample module](https://github.com/euc-oss/euc-samples/blob/b75247f2f149fab9c4a3f6d3dca622d7a4f77450/UAG-Samples/uag-terraform/uagdeploy.psm1): `GetAdminSAMLSettings` reads `[adminSAMLSettings]` keys `enable`, `entityId`, `spEntityId` and `signAuthNRequestWithAdminCert`; `GetCertificateWrapper $settings "Admin"` reads `[SSLCertAdmin]` PEM/PFX paths; `GetHostEntries` reads contiguous `hostEntryN` keys and produces `hostEntries` arrays.
- [Omnissa EUC UAG API schema](https://github.com/euc-dev/uag-apis/blob/b6087a7a038d631a25483439d75b8b274fb399b0/docs/rest-api-swagger.json): `Settings.adminSAMLSettings` / `AdminSAMLSettings` confirms the JSON shape and `signAuthNRequestWithAdminCert` spelling. The deployment sample internally emits the inconsistent `signingAuthNRequestWithAdminCert`; Gateway Forge uses the published API spelling in settings JSON and the documented input spelling in INI.
- `Settings.certificateWrapperAdmin` expects actual `certChainPem` / `privateKeyPem` content (or `pfxCertStoreWrapperAdmin` content), not filesystem paths. Management certificate path inputs are therefore INI-only, consistent with internet-facing certificate paths. No private-key content is collected in the browser.
- Administrator SAML is conservatively gated to UAG 2609 as requested; the sample/API schemas establish names and shape, not the earliest product version. The six-row host-entry cap is a builder UX limit, not a claimed appliance limit.
- Direct access to the 2609 Omnissa documentation returned HTTP 403 during this update; the published vendor module and API schema above were used instead. Live appliance import/deployment has not been verified.

### Downloaded deployment module: certificate and external-IdP inputs

The user-supplied deployment package (`uagdeploy.psm1` and `uag18-saml-external-idp.ini`) was inspected statically; no deployment scripts were executed. Line references below identify that supplied snapshot, not the older GitHub module.

- `uagdeploy.psm1:1597-1631`: `GetPfxPassword` detects password protection and prompts with `Read-Host -AsSecureString` at line 1615. The browser does not collect or serialize a PFX password.
- `uagdeploy.psm1:1679` onward: `GetCertificateWrapper` reads PEM/private-key or PFX inputs for `[SSLCert]` / `[SSLCertAdmin]`. Exclusive mode selection is a builder safeguard, not a new INI key.
- `uagdeploy.psm1:1433-1494`: `[SAMLServiceProviderMetadata]` reads `spNameN`, `metadataXmlN`, `encryptAssertionN`; it is not a certificate wrapper. This section has not been implemented by the certificate-input change.
- `uagdeploy.psm1:1516-1582`: `[SAMLIdentityProviderMetadata]` uses `pemCerts` and `pemPrivKey`, validating an RSA PEM private key; absent custom inputs cause UAG to generate a self-signed pair. No PFX mode is offered.
- `uagdeploy.psm1:4773-4914`: `GetIDPExternalMetadataSettings` handles `[IDPExternalMetadataN]`. Its explicit rejection of non-PEM signing/encryption at lines 4852-4854 / 4881-4883 applies to this external-IdP section, not the SP metadata section. Signing uses `signingCertificateType=PEM`, `signingPrivateKeyPem`, `signingCertChainPem`; encryption uses `encryptionCertificateType=PEM`, `privateKeyPem`, `certChainPem`. The generated payload uses `signingCertAndKeyWrapper` / `encryptionCertAndKeyWrapper`.
- `uagdeploy.psm1:4820-4839` and `uag18-saml-external-idp.ini:222-231`: `idpUrlThumbprints` accepts comma-separated SHA thumbprints with colon-prefixed algorithms and space-separated bytes, alongside `trustedCertN` PEM files. The script embeds certificate content in `idpURL.trustedCertificates` and derives `idpURL.url` from an Artifact Resolution Service location in metadata XML. Paths are not valid substitutes for JSON certificate content; these builder inputs are INI-only, with an explicit JSON-preview notice. The nine-row cap is a builder limit, not a vendor limit.
- `uagdeploy.psm1:6094-6139`: the supplied module emits `signAuthNRequestWithAdminCert` correctly; the earlier `signingAuthNRequestWithAdminCert` typo described above belongs to the older public reference only. Administrator SAML signing reuses `[SSLCertAdmin]`; no separate admin-SAML certificate wrapper is invented.

The downloaded `uagdeploy.ps1`, `uagdeployhv.ps1`, `uagdeployaz.ps1`, `uagdeployntnx.ps1`, and `uagdeployopenshift.ps1` all declare `$iniFile` in their `param` blocks. Generated commands consistently name it with `-iniFile`; Azure retains its positional root/admin/CEIP credential arguments, Nutanix remains interactive-only, and OpenShift retains its named root/admin/OpenShift-password flow.

### Nutanix AHV

- [PowerShell deployment to Nutanix AHV](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymenttoNutanix)

Verified implementation facts:

- UAG is deployed with `uagdeployntnx.ps1` and a platform INI.
- UAG 2606 and later use the native QCOW2 image format for Nutanix; the image must be uploaded to Prism Central first.
- `[Nutanix]` uses `prismCentralUserName`, `prismCentralAddress`, `cluster`, `image`, and `subnet0`/`subnet1`/`subnet2`.
- `subnetN` follows the numeric NIC mapping: NIC0/eth0, NIC1/eth1, NIC2/eth2.
- Prism Central, the cluster and subnets must already exist. The vendor script prompts for root, admin and Prism Central passwords when omitted.
- Minimum Nutanix software versions are Prism Central 2024.3, AOS 7.0 and AHV 10.0.
- `-noSSLVerify` is a documented command-line option for an untrusted Prism Central certificate.
- A VM with the same name is deleted and recreated by the script.
- The page provides an interactive invocation; Gateway Forge does not generate an unverified Nutanix non-interactive invocation.

### Red Hat OpenShift Virtualization

- [Limited Availability: PowerShell deployment to Red Hat OpenShift](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/OpenShiftDeployment)

Verified implementation facts:

- This feature is Limited Availability and requires Omnissa-granted access.
- The script runner is Windows with PowerShell 5 or 7, and `oc` must be installed and authenticated.
- Deployment has two stages: create a bootable volume from the QCOW2 image, then deploy the VM with `uagdeployopenshift.ps1`.
- `[OpenShift]` uses `openShiftUserName`, `openShiftEndpoint`, `namespace`, `instanceType`, `storageClass`, `diskSizeGi`, `volume`, `nadNameN`, and optional `networkPolicies`, `labels`, and `bearerToken`.
- `nadNameN` follows the numeric NIC mapping: NIC0/eth0, NIC1/eth1, NIC2/eth2. NADs must exist in the target namespace or resolve to a same-named NAD in the default namespace.
- The namespace, StorageClass, NADs, RBAC permissions, cluster capacity and NetworkPolicies must already exist.
- The bootable volume artifact is a CDI `DataVolume` plus `DataSource` using `ReadWriteMany`, `Filesystem`, the selected StorageClass, and a disk size matching `diskSizeGi`.
- The generated URL-based manifest imports a QCOW2 over HTTP(S). A local QCOW2 uses the documented OpenShift console upload flow; Gateway Forge emits an explicit runbook instead of an invalid local-path manifest.
- The disk must be at least 20 GiB. The instance type must provide at least 2 vCPU and 4 GB RAM; the documentation does not enumerate valid instance-type names.
- The generated PowerShell includes `oc apply`, `oc get dv/pvc/datasource`, the official deployment script, optional token authentication, and documented password-history cleanup.

## Shared deployment parameters

- [PowerShell deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters)
- [PowerShell deployment to vSphere](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PSDeploymenttovSphere)
- [PowerShell deployment to Hyper-V](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PSDeploymentforHyperV)

This reference supplies the common `[General]` deployment options, including `deploymentOption`, per-NIC `ipModeN`, `ipN`, `netmaskN`, and the 0/1/2 numeric NIC convention. Gateway Forge currently exposes the documented IPv4 `DHCPV4` and `STATICV4` modes for Nutanix and OpenShift output.

The vSphere page accepts a local path or remote URL to the UAG `.ova`.
The Hyper-V page requires the extracted UAG `.vhdx` file as a full local path.
The shared parameter page publishes the supported IP mode combinations, while
the official [UAG Terraform sample](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/uag-terraform/uagdeploytr.ps1)
maps `ipMode0`, `ipMode1`, and `ipMode2` to the numbered NICs.

IPv6 mode combinations, per-interface `routesN`, and raw `CustomConfig`/`ethNCustomConfig` inputs are documented platform capabilities but are intentionally not generated yet; they require additional validation so Gateway Forge cannot emit a partially supported networking configuration by accident.

### CEIP command-line values and remaining prompts

The [UAG 2609 non-interactive parameter reference](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/NonInteractiveModeParameters) documents `<ceip-yes-no>` as `yes` or `no` and includes the named Nutanix example `-ceipEnabled "yes"`. The [OpenShift deployment reference](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/OpenShiftDeployment) also uses CEIP `yes`/`no`. Gateway Forge maps its boolean setting to the explicit named PowerShell argument `-ceipEnabled 'yes'` or `-ceipEnabled 'no'`; INI and settings JSON retain their existing boolean representation.

This is documentation-backed syntax, not verification of every downloadable deployment script: the vSphere/Hyper-V examples omit CEIP, and the current packages and all historical releases have not been executed. Check the deployment script supplied with the target UAG release. Environment-password mode only supplies the generated runtime parameters; vCenter passwords, PFX passwords and other vendor-required credentials may still prompt. Explicit CEIP removes that prompt only, not all interaction.

TLS syslog destinations require an operator-provided server CA PEM path. Examples intentionally leave it missing rather than inventing trust material. Required-path validation does not verify the local file or its trust chain, and certificate paths remain INI-only.

### vSphere unattended deployment and operator evidence

The [Broadcom OVF Tool vSphere locator reference](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere-sdks-tools/9-1/ovf-tool-user-s-guide/using-ovf-tool-commands/specifying-a-locator/vsphere-locators.html) documents `vi://username:password@host:port/path` and prompts when credentials are omitted. For a UPN, the domain is part of the username before the colon: `vi://uagdeploy@vsphere.local:PASSWORD@vcenter.example.com/DC1/host/Cluster1`. The operator confirmed this credential order with **OVF Tool 5.0**, not 9.1. The [URL syntax reference](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere-sdks-tools/9-1/ovf-tool-user-s-guide/using-ovf-tool-commands/specifying-a-locator/using-url-file-syntax.html) explicitly distinguishes VI/vCloud from generic URL percent encoding; no new credential encoding or normalization is implemented. Check special-character handling with the actual deployed tool version.

Fully unattended vSphere deployment is conditional: supply root/Admin UI passwords, explicit CEIP and vCenter target credentials, avoid password-protected PFX (use appliance defaults or an unencrypted PEM/key pair), and satisfy all other feature credentials, validation and OVF Tool confirmations. This is not a claim that Environment-password mode removes every possible prompt. The supplied vendor scripts were inspected read-only; Gateway Forge validation did not execute a deployment.

**Operator-tested runtime evidence:** UAG 2609 Horizon settings applied on vSphere with OVF Tool 5.0 when default `authMethods=passthrough` was omitted. Explicit `certificate-auth` with X.509 configured also applied. The operator additionally confirmed the credentialed UPN target syntax. This does not establish every authentication workflow or an end-to-end client session. Regressions were reported with OVF Tool 5.1 and 9.1, but their causes and affected configurations have not been independently verified. No equivalent platform-wide test claim is made for other platforms.

**Credential handling:** a full locator remains a plain configuration value: inline passwords can persist in browser drafts and INI/PowerShell output regardless of secret mode. Guidance recommends adding the real password only to a protected deployment copy outside Gateway Forge and keeping credential-bearing files/logs private. No vCenter password field, automatic insertion or target rewriting was added.

### Admin UI password requirements

The [UAG 2609 password requirements](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PasswordRequirementsforUAG) distinguish root and Admin UI rules. Admin requires 8–64 characters on non-FIPS appliances or 14–64 on FIPS, subject to any higher configured minimum, with uppercase, lowercase, a digit and a special character. Only `! @ # $ % ^ & * ( )` are documented as allowed special characters. The [deployment procedure](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy) explicitly warns that script-side validation can accept an 8-character password even though a FIPS appliance requires 14. Guidance appears in the PowerShell UI, generated script and runbook; passwords remain runtime-only and are not validated in the browser. The configured `adminpasswordPolicyMinLen` is now emitted explicitly in `[General]` and settings JSON even at the existing default of 8; this does not lower the FIPS floor or change the configured minimum.

The [adminpwd recovery procedure](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ResettheAdminPasswordusingtheUnifiedAccessGatewayConsole) documents default password pre-expiration and the ensuing first-login password change. The password-requirements page is inconsistent about whether a noncompliant deployment password produces a randomized admin password or no usable admin account. Treat the deployed release/package and its logs as authoritative for diagnosing that outcome; do not assume successful VM deployment proves admin access or configuration application.

The [administrator SAML configuration reference](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ConfigureSAMLAuthenticationforAdminUI) states that enabling administrator SAML automatically disables default admin basic/password authentication. Conditional guidance explains this in the configuration card, PowerShell UI, script and runbook without changing authentication settings.

## Maintenance

When a source-backed rule or documented limitation changes, update the schema, validation, generators, regression tests and this file together. Treat undocumented script behavior and accepted platform object names as external constraints rather than inferred values. Sources were reviewed for this implementation on 2026-11-08.
# Authoritative sources

This file is the source map for Gateway Forge. It records where product facts
come from and, just as importantly, which Gateway Forge behavior is an
implementation decision rather than a fact published by Omnissa.

Gateway Forge is an unofficial consumer of these interfaces. A supported version
list does not make generated output a supported Omnissa configuration, and a
valid JSON document is not necessarily a valid UAG settings document. Always
review generated output against the target UAG release and test it on a
non-production appliance.

## Evidence labels

| Label | Meaning |
| --- | --- |
| **Verified documentation** | The claim was checked in an official Omnissa page, release note, or downloadable release artifact for the stated UAG version. |
| **Verified runtime** | The claim was checked against a real appliance export, its Swagger document, or the exact deployment script shipped with that release. |
| **Inferred behavior** | Gateway Forge extrapolated from a documented pattern or observed export. The corresponding UI field is marked `inferred` where applicable and must be verified before production use. |
| **Project behavior** | A Gateway Forge choice, validation rule, recommendation, default, or presentation detail. It is not an Omnissa product guarantee. |
| **Unverified assumption** | A proposed behavior without an official or runtime source. It must not be treated as authoritative and should not silently become a required field or validation rule. |

When a source and the implementation disagree, use this order of precedence:

1. The exact downloaded or installed UAG release artifact.
2. Runtime output from that release's appliance: admin-UI export and Swagger.
3. The same release's official Omnissa deployment documentation and release
   notes.
4. Official product-wide sources such as the Lifecycle Matrix and security
   advisories.
5. Official tool or standards documentation.
6. Gateway Forge's schema, templates, validation, and comments.

## UAG INI keys and deployment

### Official product documentation

The [Omnissa documentation site](https://docs.omnissa.com/) is the starting
point. Select the exact UAG release before consulting it. The project has used
the release-specific *Deploying and Configuring Unified Access Gateway*
material, including pages titled:

- *Run PowerShell script to deploy* and its sample INI
- *PowerShell deployment parameters*
- *Configure Horizon Settings*
- vSphere, Hyper-V, and Azure deployment configuration
- *Non-Interactive mode deployment parameters*

The 2026-11-08 audit of the UAG 2609
[*PowerShell deployment parameters*](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters)
is recorded in [`docs/uag-2609-deployment-gap-matrix.md`](docs/uag-2609-deployment-gap-matrix.md).
That matrix distinguishes documented mappings, release-history evidence,
NIC applicability, intentional exclusions, and uncertain compatibility-only
keys.

The page hierarchy and URLs have changed over time, so use the official search
result or product table of contents for the target release rather than reusing
a URL from a newer or older release. These pages are the **verified
documentation** source for the documented section names, key names, script
arguments, and platform-specific deployment behavior reflected in
`src/lib/schema.ts` and `src/lib/powershell.ts`.

### Downloaded release artifacts

[Omnissa Customer Connect](https://customerconnect.omnissa.com/) distributes
the UAG images, release notes, and PowerShell deployment packages. For a claim
about script syntax or a key missing from the web documentation, inspect the
`uagdeploy.ps1`, `uagdeployhv.ps1`, `uagdeployaz.ps1`, and `uagdeploy.psm1`
files in the package for the exact UAG release.

The shipped scripts, module, and sample files are the release's strongest
source for deployment-time behavior. A PowerShell command generated by Gateway
Forge is **verified documentation/runtime** only when it has been checked
against those files; otherwise it is project behavior.

For Workspace ONE Content Gateway, the locally inspected UAG 2609
`uagdeploy.psm1` is the runtime source for `GetEdgeServiceSettingsAWCG`,
`GetEdgeServiceSettingsAWCommon`, `GetTrustedCertificates`, and
`GetHostEntries`. It establishes the `CONTENT_GATEWAY`/`CG` identifier pair,
the `cgConfigId` → `cgConfigurationId` mapping, shared versus standalone INI
selection, and the `-awCGAPIServerPwd` standalone password parameter. Content
Gateway passwords are deployment runtime inputs and are never persisted in
INI, JSON, or browser drafts. The same module establishes WRP `hostEntryN`
handling; Gateway Forge's six-row cap is a project UI limit.

**Blank UEM password key check (2026-11-09):** the public
[deployment module's `GetEdgeServiceSettingsAWCommon`](https://github.com/euc-oss/euc-samples/blob/b75247f2f149fab9c4a3f6d3dca622d7a4f77450/UAG-Samples/uag-terraform/uagdeploy.psm1#L2474-L2500)
receives `$pwd` from the deployment parameter, prompts only if it is absent,
and inserts a nonempty password into the deployment payload. It does not read
`apiServerPassword` from the INI. Its Airwatch and standalone Content Gateway
callers pass `awAPIServerPwd` and `awCGAPIServerPwd`, respectively. Therefore
an explicit blank `apiServerPassword=` INI entry is not required by this
public reference, and Gateway Forge continues to omit it. This public snapshot
was last updated on 2025-08-14; this check does **not** independently establish
the same behavior for the downloaded UAG 2609 package, which was unavailable
in this workspace. Recheck the exact release module before treating this as
a release-specific guarantee.

The same UAG 2609 module's `GetNewAdminUserSettings`,
`GetAdminUserSetting`, `ValidateMonitorUserName`, and `ReadPwdToHash`
functions establish `[AdminUserN]` metadata, the fixed `ROLE_MONITORING`
role, 1-35 character usernames, `-newAdminUserPwd` handling, and the
semicolon-separated `username:password` runtime format. Gateway Forge
keeps those passwords out of INI, settings JSON, and browser drafts. The
unnumbered `[AdminUser]` compatibility form is accepted on import because
the vendor loop includes it as index zero.

For the NIC deployment mapping, the UAG 2609
[secure DMZ guide](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/SecureDMZdesignwithmultiplenetworkinterfaces)
states that the first NIC is Internet-facing and that a two-NIC deployment
combines authenticated back-end and management traffic on the second NIC. The
[deployment parameter](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters)
page defines the standard, large, and XL `onenic`, `twonic`, and `threenic`
families. Omnissa's maintained
[UAG automation notes](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/UAG%20Automation%20and%20Day%202%20Operations/README.md)
map `netInternet` to eth0/NIC0, `netManagementNetwork` to eth1/NIC1, and
`netBackendNetwork` to eth2/NIC2. Its
[`uagdeploytr.ps1`](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/uag-terraform/uagdeploytr.ps1)
shows that `twonic*` consumes NIC0 and NIC1, while `threenic*` additionally
consumes NIC2. Thus `twonic` uses Internet plus combined back-end/management;
it is not Internet plus a dedicated back-end-only interface.

Key names in `src/lib/schema.ts` should be copied with their documented
capitalization. The following are not public Omnissa schema facts:

- `trustedCert2`, `radius_hostName_2`, and `radius_sharedSecret_2` are
  **inferred behavior** from numbered-key patterns. Gateway Forge labels them
  for verification.
- The acceptable SNMPv3 security-level tokens are not exhaustively listed by
  the currently consulted UAG documentation. Treat the free-text field as an
  **unverified assumption at the value level** until checked against an
  appliance or release artifact.
- One-, two-, and three-NIC required-field choices are verified against the
  release mapping above, while the exact blocking-validation policy remains
  Gateway Forge **project behavior**.
- The `since` and `until` gates were established from release-to-release
  documentation comparisons. Their values are **inferred behavior**: first
  publication in the sampled documentation is not proof that a key was
  introduced in exactly that release.

## Settings JSON

The settings JSON is an admin-UI export/import document, not a publicly
versioned replacement for the deployment INI. Omnissa does not publish a
single public JSON schema covering the structures emitted by Gateway Forge.

For the selected release, use:

1. The real appliance's admin UI export from **Monitoring > Export** as the
   **verified runtime** baseline.
2. The appliance's Swagger UI at `https://<uag>:9443/swagger` as the
   authoritative API contract for that installed release.
3. The `PUT /rest/v1/config/settings` contract exposed by that Swagger document
   before applying Gateway Forge output.

Gateway Forge's `systemSettings`, `edgeServiceSettingsList`,
`authMethodSettingsList`, and other nesting mirrors observed admin-UI exports.
That mapping is **inferred behavior** until it is tested on the same UAG
release. Deploy-time-only values, file paths, and settings intentionally marked
`json: false` are absent from the generated settings document. In particular,
the OpenID Connect, SecurID, certificate-authentication, outbound-proxy, and
some certificate details remain INI-only because Gateway Forge does not yet
have a verified public JSON shape for them.

[RFC 8259](https://www.rfc-editor.org/info/rfc8259) defines JSON syntax only. It
does not establish the validity of UAG keys, nesting, or values.

## Lifecycle, release, and security data

- The [Omnissa Product Lifecycle
  Matrix](https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html)
  is the **verified documentation** source for product support status. The
  weekly lifecycle workflow in `.github/workflows/lifecycle-check.yml` is only
  an automated comparison with that source.
- `LIFECYCLE_SNAPSHOT` in `src/lib/versions.ts` records when the matrix was
  reviewed; it is an evidence date, not a lifecycle guarantee. `VERSIONS`
  remains a project snapshot and is not itself authoritative.
- Release dates, build identifiers, and maintenance-release relationships must
  come from the corresponding official UAG release notes or Customer Connect
  package metadata. A maintenance release sharing its parent's schema is a
  Gateway Forge assumption unless the release notes or appliance export
  verifies it.
- The [Omnissa security response and advisory
  index](https://www.omnissa.com/omnissa-security-response) is the official
  source for Omnissa Security Advisories. Follow the linked OMSA PDF and its
  affected-version/fixed-version table. The Lifecycle Matrix alone does not
  show whether a supported release has a known vulnerability or required
  patch.
- CVE databases such as [NVD](https://nvd.nist.gov/) are useful indexes, but
  their records are secondary. The applicable OMSA and the vendor's fixed
  release are authoritative for Omnissa remediation guidance.

## Certificate crypto and web-platform behavior

Browser-side certificate hashing uses
[Web Crypto `SubtleCrypto.digest()`](https://www.w3.org/TR/webcrypto-2/#dfn-SubtleCrypto-method-digest).
The digest algorithms are defined by
[FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final). These sources
verify how bytes are hashed; UAG's accepted `sha1=...`/`sha256=...` text syntax
still has to be verified from UAG documentation or an appliance export.

The generated PowerShell certificate probe uses the documented
[.NET `SslStream`](https://learn.microsoft.com/dotnet/api/system.net.security.sslstream)
and
[`X509Certificate2`](https://learn.microsoft.com/dotnet/api/system.security.cryptography.x509certificates.x509certificate2)
APIs. Review the resulting thumbprint against the intended appliance. The
PowerShell probe intentionally opens the TLS connection without normal trust
validation, so a discovered thumbprint is not itself proof of appliance
identity.

## Build and documentation dependencies

- `package.json` declares the direct development tools. `package-lock.json` is
  the resolved dependency record for reproducible installs; upstream package
  documentation explains those tools, not UAG behavior.
- [`Svelte`](https://svelte.dev/docs), [Vite](https://vite.dev/guide/), and
  [Vitest](https://vitest.dev/guide/) are development/build dependencies, not
  authorities for generated UAG configuration.
- The changelog follows the [Keep a Changelog](https://keepachangelog.com/)
  structure. This is a repository convention rather than an Omnissa standard.

## Project behavior that needs review

The following implementation areas must be kept separate from product facts in
code review and user-facing copy:

| Area | Project authority today |
| --- | --- |
| Required fields and `showIf` rules | Gateway Forge behavior, unless each condition cites the same release's UAG documentation or script |
| Defaults and `omitDefault` | Must be copied from official docs or an appliance/export; otherwise label as project behavior |
| Validation and lint messages | A mix of format checks and recommendations; not a statement of what UAG accepts |
| Double-DMZ proxy regex, forward rules, and templates | Derived from UAG/Horizon guidance and implemented by Gateway Forge; verify changes against the cited topology documentation |
| Security-baseline recommendations | Project policy informed by lifecycle and OMSA data, not a substitute for a deployment-specific risk assessment |
| UAG version auto-detection | Gateway Forge filename parsing, not an authoritative identification of an appliance image |
| Unsupported-key warning on import | Evidence that the schema does not map a key, not evidence that UAG rejects it |

## Source review and maintenance

For every source-backed schema, deployment, lifecycle, or security change:

1. Record the exact UAG release and the source page, release artifact, Swagger
   document, or appliance export used. Include the source and date in the pull
   request description for non-obvious claims.
2. Prefer version-specific documentation over a page that now describes only
   the latest release. Do not use a newer release to prove when an older key
   first appeared.
3. Keep verified facts separate from inference. Set the schema's `inferred`
   flag when a key is extrapolated, and retain a visible warning until an
   official or runtime source confirms it.
4. Do not turn an unverified value into a default, required field, or blocking
   validation solely because the UI or a template currently expects it.
5. On a lifecycle-matrix change, update `VERSIONS`, `LIFECYCLE_SNAPSHOT`,
   `README.md`, and this file's review notes. Review all `since`/`until` gates
   and newly published deployment keys for the added release.
6. On an OMSA or UAG release alert, review the recommended release and
   security-copy assumptions; do not infer that a lifecycle-supported release
   is patched against every advisory.
7. Re-check public links when product or dependency major versions change.
   If a vendor blocks automated access, note the HTTP result and verify the
   official URL in a browser before removing or replacing it.

Public Omnissa links were last reviewed on **2026-11-08**. Automated access to
`docs.omnissa.com` can return HTTP 403, as it also can in the lifecycle
workflow. An access failure is not evidence that a previously documented key or
page no longer exists.
