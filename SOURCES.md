# Gateway Forge sources

Gateway Forge distinguishes official product contracts from UI guidance and project inference. This file records the authoritative deployment references used for source-backed behavior.

## Omnissa Unified Access Gateway 26.09

### Nutanix AHV

- [PowerShell deployment to Nutanix AHV](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymenttoNutanix)

Verified implementation facts:

- UAG is deployed with `uagdeployntnx.ps1` and a platform INI.
- UAG 2606 and later use the native QCOW2 image format for Nutanix; the image must be uploaded to Prism Central first.
- `[Nutanix]` uses `prismCentralUserName`, `prismCentralAddress`, `cluster`, `image`, and `subnet0`/`subnet1`/`subnet2`.
- `subnetN` follows the numeric NIC mapping: NIC0/eth0, NIC1/eth1, NIC2/eth2.
- Prism Central, the cluster and subnets must already exist. The script prompts for root, admin and Prism Central passwords.
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

This reference supplies the common `[General]` deployment options, including `deploymentOption`, per-NIC `ipModeN`, `ipN`, `netmaskN`, and the 0/1/2 numeric NIC convention. Gateway Forge currently exposes the documented IPv4 `DHCPV4` and `STATICV4` modes for Nutanix and OpenShift output.

IPv6 mode combinations, per-interface `routesN`, and raw `CustomConfig`/`ethNCustomConfig` inputs are documented platform capabilities but are intentionally not generated yet; they require additional validation so Gateway Forge cannot emit a partially supported networking configuration by accident.

## Maintenance

When a source-backed rule or documented limitation changes, update the schema, validation, generators, regression tests and this file together. Treat undocumented script behavior and accepted platform object names as external constraints rather than inferred values. Sources were reviewed for this implementation on 2026-11-08.
