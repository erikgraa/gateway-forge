# Workspace ONE Tunnel `[Airwatch]` source mapping

Gateway Forge models the complete `[Airwatch]` sample in the UAG 2609 PowerShell deployment reference:

- [Run PowerShell script to deploy — UAG 2609](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy)
- [Configure Workspace ONE Tunnel Settings for Workspace ONE UEM](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ConfigureTunnelSettingsforWorkspaceONEUEM)
- [Omnissa Workspace ONE Tunnel: Deploying with Unified Access Gateway](https://docs.omnissa.com/bundle/Workspace_ONE_TunnelVSaaS/page/TunnelGateway-DeployUAG.html)

The Tunnel deployment guide supports UAG-hosted Tunnel on vSphere and Hyper-V. Gateway Forge therefore hides the group on Azure. Historical PowerShell samples are present in all supported UAG releases checked (2212 through 2609); `tunnelConfigurationId` first appears in 2306, and `disableAutoConfigUpdate` first appears in 2303.

## Official semantics

| INI key | Mapping and validation |
| --- | --- |
| `tunnelGatewayEnabled` | Enables the Tunnel gateway. Must be `true` when the group is enabled. |
| `disableAutoConfigUpdate` | Locks custom configuration, authentication, certificates, and networking against UEM auto-updates. Introduced in the 2303 sample. |
| `apiServerUrl` | Required HTTPS Workspace ONE UEM REST API URL from Site URLs. |
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

Omnissa does not document the `[Airwatch]` settings-JSON property/edge-service mapping in the audited references. Gateway Forge therefore imports and generates the documented keys only through INI and excludes them from settings JSON. This avoids inventing an unverified JSON identifier or schema.
