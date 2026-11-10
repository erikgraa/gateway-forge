# UAG deployment on Azure Local: investigation

**Reviewed:** 2026-11-10
**Scope:** Compatibility of the documented UAG Azure and Hyper-V deployment paths with Azure Local/Arc-managed VMs. This is documentation research, not a deployment test or support certification.

## Conclusion

**The existing Azure workflow is not established to work unchanged on Azure Local.** Omnissa documents separate Azure and Hyper-V deployment paths; the reviewed UAG 2609 material does not identify Azure Local as a supported target. This is an absence of documented support, not proof that Omnissa explicitly prohibits it.

Azure Local VM management uses Azure Resource Manager and Azure Arc but exposes Azure Local resources through the `Microsoft.AzureStackHCI` provider, including VM instances, logical networks, network interfaces, disks, and gallery images. That is not the public-Azure resource model targeted by `uagdeployaz.ps1`. Direct Hyper-V deployment is also distinct from Arc-managed VM provisioning: a `.vhdx` format overlap does not establish that the Hyper-V script can create or manage an Azure Local VM, or that Omnissa supports that combination.

Therefore:

- Do not select or describe the existing **Azure** option as Azure Local support.
- Do not treat **Hyper-V** as an Azure Local/Arc deployment path. It may be a technical experiment only after vendor confirmation and lab validation.
- If Azure Local is pursued, plan for a **separate Azure Local/Arc adapter or deployment workflow**, not an unverified pass-through to either existing script.
- Compatibility remains **unresolved pending written Omnissa guidance and operator-run lab evidence**. No Azure Local deployment has been tested by this investigation.

## Evidence and differences

| Area | Documented Azure / Hyper-V path | Azure Local / Arc implications |
| --- | --- | --- |
| **Vendor support and deployment entry point** | UAG 2609 has distinct [Hyper-V](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PSDeploymentforHyperV) and [Azure](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShellDeploymenttoAzure) deployment documentation and platform scripts. The source map records the package scripts and parameters; Azure uses `uagdeployaz.ps1`, Hyper-V uses `uagdeployhv.ps1`. | The reviewed Omnissa material names Azure and Hyper-V, not Azure Local. Ask Omnissa to confirm in writing whether Azure Local, its specific release, and the proposed Arc VM provisioning path are supported for the exact UAG build. An omission is not an explicit vendor prohibition. |
| **Resource provider / VM creation** | The Azure script is documented for Azure deployment and the inspected package uses Azure resource-group VM operations. The Hyper-V script creates a local Hyper-V VM. | Azure Local VM APIs are under `Microsoft.AzureStackHCI`; the published API specifications include VM-instance and related resources. Provisioning must follow the Azure Local/Arc VM management and custom-location model, including its enabled management components and required resource providers. Do not assume that `New-AzVM`, public Azure `Microsoft.Compute/virtualMachines`, or Azure resource-group replacement logic creates an Azure Local VM. Exact provider registration and API-version prerequisites depend on the selected Azure Local release and flow. |
| **Image and format** | The UAG Hyper-V path uses a local `.vhdx` image; the Azure path asks for an Azure managed image name. See the [Hyper-V guide](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PSDeploymentforHyperV) and the existing [deployment gap matrix](uag-2609-deployment-gap-matrix.md). | Azure Local publishes VHD/VHDX disk and gallery-image resources, but that does not make an arbitrary UAG VHDX an approved/importable Azure Local gallery image. Confirm image source, supported import/preparation workflow, disk format, VM generation, boot mode, licensing and appliance first-boot behavior. No Omnissa Azure Local image or conversion procedure was identified. |
| **Networking** | Forge’s Azure `[Azure]` fields describe subscription, resource group, Azure location, VM size, virtual network, subnets, network security groups and public-IP resource group. Hyper-V uses local VM networking and separate optional VLAN handling. | Azure Local exposes logical-network and network-interface resources, with Azure Local-specific network configuration. Public Azure VNet, subnet, NSG and public-IP names do not describe those resources. Map one-, two- and three-NIC UAG topologies, VLAN/IP allocation, routes, DNS, gateways and external reachability using supported Azure Local resources; no mapping or UAG bootstrap compatibility is established. |
| **Storage** | Hyper-V deployment uses a host filesystem storage path. Azure deployment selects an Azure managed image and creates Azure VM storage resources. | Azure Local VM disks are associated with Azure Local storage-container resources. Neither an Azure managed disk nor a host-local `ds` path should be presumed to identify an Azure Local storage container. Confirm image placement, VM disk placement, persistence, cleanup and backup behavior for the selected Azure Local workflow. |
| **Identity and permissions** | Azure script identity and permissions apply to its Azure resource operations; Hyper-V uses host-side permissions. | Azure Local operations are Azure RBAC/Arc resource operations and may also depend on local cluster and deployment prerequisites. Microsoft documents an **Azure Stack HCI VM Contributor** role and `Microsoft.AzureStackHCI` permissions, but this alone does not establish Omnissa’s required role, scope, or complete permission set. Determine least-privilege rights for VM, image, disk, logical-network, custom-location and lifecycle operations against the selected release and test them in the lab. |
| **Replacement and deletion** | The inspected `uagdeployaz.ps1` deletes a same-name VM and OS disk in the configured resource group and attempts to delete name-derived NICs, even when no VM matches. This destructive behavior is recorded in [SOURCES.md](../SOURCES.md#deployment-vm-replacement). Hyper-V has its own local same-name VM removal behavior. | These are behaviors of those scripts, not Azure Local guarantees or safe Azure Local semantics. Do not carry their deletion logic, resource-name assumptions, or gates into an Arc workflow without separately confirming exact targets, dependencies, and deletion behavior. Begin validation with unique disposable names and inspect resources before and after each operation. |

### Generated INI and PowerShell

The current Azure profile is intentionally Azure-specific: `[Azure]` values include subscription ID, resource group, Azure location, managed image, VM size, virtual network, subnet, NSG and public-IP resource group. The generated command selects `uagdeployaz.ps1`; Azure noninteractive credentials are positional. These are not a generic cloud-neutral contract and do not encode Azure Local custom locations, Arc VM resource IDs, logical networks, storage containers, gallery-image IDs or Azure Local identity scopes.

The Hyper-V profile instead selects `uagdeployhv.ps1`, accepts a local `.vhdx` and host storage path, and can emit guarded post-deployment VLAN commands. Those commands target direct Hyper-V VM adapters; they do not provision an Arc-managed VM or configure an Azure Local logical network. The Azure platform’s existing region, resource, VM-size and HA gates must not be copied to Azure Local without Azure Local-specific evidence. Likewise, do not infer Azure Local’s supported UAG versions, image format, network topology or HA support from either existing profile.

Do not run either generated command against Azure Local as a compatibility test: the Azure script can delete resources, and neither script has been established to target Azure Local.

## Prerequisites for a lab

Before any deployment experiment:

1. Obtain written Omnissa guidance for the exact UAG release/build, Azure Local release, image format/preparation, Arc VM workflow, supported NIC count, networking, storage and support boundary. Record the support case or authoritative response.
2. Select an isolated, non-production Azure Local cluster with Azure Local/Arc VM management already configured. Confirm Azure connectivity, management components, custom location, logical networks, storage containers, image staging, and the documented provider/API versions for that release.
3. Use a disposable UAG image and unique VM/resource names. Identify all resources the workflow may create, mutate or delete. Back up the lab and have an operator-approved cleanup procedure; do not use production names or shared resources.
4. Prepare least-privilege Azure RBAC and any required local host/cluster permissions. Validate resource scopes and audit logs before granting broader rights.
5. Record exact UAG artifact/build and checksum, Azure Local release, API versions, PowerShell/runtime and module versions, image preparation steps, network/storage configuration and all operator actions.
6. Keep the current Forge Azure/Hyper-V output as a comparison artifact only. Do not edit the existing platform profiles or claim support until the separate workflow and evidence have been reviewed.

## Proposed operator-run validation matrix

| Stage | Validation | Evidence to retain |
| --- | --- | --- |
| **Vendor gate** | Confirm support status and requirements for the exact platform, UAG build, image and provisioning path. | Dated Omnissa documentation or written support response. |
| **Image gate** | Stage the documented image using the Azure Local-supported procedure; verify image metadata, generation, boot and first-boot networking without reusing a production disk. | Artifact checksum, import steps, API/resource IDs and console observations. |
| **API / RBAC gate** | Create and inspect only disposable Azure Local VM, disk, NIC and image resources with the proposed least-privilege identity; verify expected failures outside assigned scope. | Role definitions, scopes, activity logs, API versions and observed resources. |
| **Topology gate** | Exercise one-, two- and three-NIC cases where vendor guidance permits; verify interface-to-logical-network mapping, IP assignment, routes, DNS and required inbound/outbound reachability. | Resource configuration and appliance-side interface/network checks. |
| **Appliance gate** | Confirm UAG boots, accepts the intended bootstrap settings, becomes reachable on its management interface and accepts a minimal configuration. Then validate any approved service workflows. | Redacted logs, appliance version, settings read-back and service-specific checks. |
| **Lifecycle gate** | In a disposable environment, test create, failed create, retry, replacement and cleanup separately. Verify whether disks/NICs survive or are removed and whether resources with the same name but different ownership are protected. | Before/after resource inventory and explicit deletion/cleanup results. |
| **Regression gate** | Repeat the validated path for each claimed Azure Local/UAG release combination and compare generated INI, script arguments, API resources and networking. | A versioned compatibility matrix and repeatable runbook. |

No stage above has been run for this investigation. Passing a lab matrix demonstrates only the tested combinations; it does not replace vendor support confirmation or certify other releases and topologies.

## Remaining gaps and separately scoped work

- No written Omnissa support decision for Azure Local was found.
- No Azure Local UAG image/import guide, supported UAG/Azure Local version matrix, or documented mapping from UAG bootstrap settings to Arc VM resources was found.
- No operator lab evidence exists for VM creation, first boot, management reachability, one-to-three NIC mapping, storage lifecycle, same-name replacement, cleanup or end-to-end UAG configuration.
- Azure Local's required resource providers, provider versions, role scopes and permissions must be pinned to the target release and operator-selected deployment flow before implementation.

If vendor guidance and the lab justify support, open a **separate implementation issue** for an Azure Local/Arc-specific adapter or runbook. It should define its own resource model, image preparation, networking/storage/identity contract, explicit destructive-operation safeguards, supported release matrix and operator acceptance evidence. Until that work is separately reviewed and tested, Azure Local remains unsupported and untested in Gateway Forge.

## Sources

### Omnissa

- [UAG 2609 PowerShell deployment to Hyper-V](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PSDeploymentforHyperV)
- [UAG 2609 PowerShell deployment to Azure](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShellDeploymenttoAzure)
- [UAG 2609 PowerShell deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters)
- [Repository audit of platform-specific same-name deletion behavior](../SOURCES.md#deployment-vm-replacement) and [UAG 2609 deployment gap matrix](uag-2609-deployment-gap-matrix.md)

The Omnissa pages could not be fetched in this research session because network name resolution was unavailable. The URLs and package observations above are recorded in the repository’s release-specific source audit; re-check the live official pages and exact package before implementation.

### Microsoft

- [Azure Local VM resource API specifications](https://github.com/Azure/azure-rest-api-specs/tree/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM)
- [Azure Local `VirtualMachineInstance` API specification](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM/VirtualMachineInstance.tsp)
- [Azure Local virtual hard disk API](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM/stable/2024-01-01/virtualHardDisks.json)
- [Azure Local marketplace gallery image API](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM/stable/2024-01-01/marketplaceGalleryImages.json)
- [Azure Local network interface API](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM/stable/2024-01-01/networkInterfaces.json)
- [Azure Local logical network API](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/azurestackhci/resource-manager/Microsoft.AzureStackHCI/StackHCIVM/stable/2024-01-01/logicalNetworks.json)
- [Azure Stack HCI VM Contributor role](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/hybrid-multicloud#azure-stack-hci-vm-contributor)
- [Microsoft.AzureStackHCI permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/hybrid-multicloud#microsoftazurestackhci)

The API specifications describe Azure Local resource contracts, not UAG certification or a validated end-to-end deployment procedure. Confirm the release-matched Microsoft operational guidance and permission requirements before a lab run.
