# Workspace ONE UEM edge-service source mapping

Gateway Forge models the complete `[Airwatch]` sample in the UAG 2609 PowerShell deployment reference:

- [Run PowerShell script to deploy — UAG 2609](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy)
- [Configure Workspace ONE Tunnel Settings for Workspace ONE UEM](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ConfigureTunnelSettingsforWorkspaceONEUEM)
- [Omnissa Workspace ONE Tunnel: Deploying with Unified Access Gateway](https://docs.omnissa.com/bundle/Workspace_ONE_TunnelVSaaS/page/TunnelGateway-DeployUAG.html)
- [PowerShell deployment to Nutanix AHV](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymenttoNutanix)
- [Limited Availability: PowerShell deployment to OpenShift](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/OpenShiftDeployment)

The Tunnel edge-service settings are platform-independent after the UAG appliance is deployed, and Gateway Forge exposes the `[Airwatch]` group for vSphere, Hyper-V, Azure, Nutanix AHV, and Red Hat OpenShift Virtualization. The platform-specific scripts are `uagdeploy.ps1`, `uagdeployhv.ps1`, `uagdeployaz.ps1`, `uagdeployntnx.ps1`, and `uagdeployopenshift.ps1`, respectively. Historical PowerShell samples are present in all supported UAG releases checked (2212 through 2609); `tunnelConfigurationId` first appears in 2306, and `disableAutoConfigUpdate` first appears in 2303.

## Official semantics

| INI key | Mapping and validation |
| --- | --- |
| `tunnelGatewayEnabled` | Enables the Tunnel gateway. Must be `true` when the group is enabled. |
| `disableAutoConfigUpdate` | Locks custom configuration, authentication, certificates, and networking against UEM auto-updates. Introduced in the 2303 sample. |
| `apiServerUrl` | Required HTTPS Workspace ONE UEM REST API origin from Site URLs. Paths, query strings, fragments, and embedded credentials are rejected; a trailing slash or explicit port is allowed. |
| `apiServerUsername` | Required initial UEM console administrator account; minimum Console Administrator privilege. |
| `apiServerPassword` | Required UEM administrator password for initial bootstrap. Stored as a secret and stripped from drafts. |
| `organizationGroupCode` | Optional organization group ID; not required when the UEM console supports multi-tunnel configuration. |
| `tunnelConfigurationId` | Optional UEM multi-tunnel configuration ID. First present in the 2306 sample; blank selects the organization group's default. |
| `airwatchServerHostname` | Required external Tunnel hostname, exactly matching the Workspace ONE UEM Tunnel configuration. |
| `outboundProxyHost` | Optional outbound proxy hostname used for API/AWCM connections. |
| `outboundProxyPort` | Outbound proxy port; required in the form when a proxy host is configured. |
| `outboundProxyUsername` | Optional outbound proxy login user. |
| `outboundProxyPassword` | Optional outbound proxy login password. Stored as a secret. |
| `ntlmAuthentication` | Uses NTLM authentication for outbound proxy requests. |
| `hostEntry1` | `/etc/hosts` entry in `IP hostname [alias]` form. Gateway Forge accepts comma-separated entries. |
| `trustedCert1` | PEM certificate path added to the appliance trust store. |

## Sample-only keys and uncertainty

The 2609 PowerShell page includes the following keys in its sample but does not explain their semantics:

| Key | Gateway Forge behavior |
| --- | --- |
| `pacFilePath` | Exposed as a file path, emitted only when non-empty. |
| `pacFileURL` | Exposed as a URL, emitted only when non-empty; validation warns if both PAC forms are set. |
| `credentialFilePath` | Exposed as a file path, emitted only when non-empty. |
| `proxyDestinationUrl` | Exposed as an optional URL, emitted only when non-empty. |
| `healthCheckUrl` | Exposed as an optional path; the sample default is `/favicon.ico`. |
| `reinitializeGatewayProcess` | Exposed as an opt-in boolean; defaults to false and is omitted unless enabled. |

These names are copied exactly from the official sample and marked **verify** in the UI. Gateway Forge does not infer how the PAC, credential, destination URL, or reinitialization inputs are consumed.

The 2212 sample additionally contains `airwatchOutboundProxy` and `tunnelProxyEnabled`. Gateway Forge preserves them only for 2212 import/export and marks them as legacy. Their replacement behavior is not stated in the source material.

## JSON export

Omnissa's downloaded `uagdeploy.psm1` module was used as the strongest available runtime reference for Content Gateway. `GetEdgeServiceSettingsAWCG` emits:

- identifier `CONTENT_GATEWAY` and `airwatchComponentsInstalled=CG`;
- the common UEM API URL/user, organization group, external hostname, auto-update and outbound-proxy settings;
- `cgConfigId` as JSON property `cgConfigurationId`;
- contiguous `trustedCertN` and `hostEntryN` inputs as trust and host-entry arrays.

Gateway Forge supports both vendor selection modes: `[Airwatch]` with `contentGatewayEnabled=true`, or standalone `[AirwatchContentGateway]` selected by a populated `apiServerUsername`. Standalone headless deployment uses the exact `-awCGAPIServerPwd` parameter; shared mode uses `-awAPIServerPwd`. Interactive deployment leaves the parameter absent so the vendor module prompts. UEM API and outbound-proxy passwords are never written to Content Gateway INI or settings JSON.

Tunnel's existing `[Airwatch]` behavior remains INI-only because the audited references do not establish a complete Tunnel settings-JSON contract for Gateway Forge. Content Gateway JSON is generated from the explicit vendor mapping above; certificate paths remain INI-only because settings JSON requires certificate contents rather than local paths.

The same downloaded module reads contiguous `hostEntryN` values for Web Reverse Proxy. Gateway Forge exposes the established six-row shared editor per WRP instance and preserves each instance's values independently.
