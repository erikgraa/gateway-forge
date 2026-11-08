# Authoritative sources

Gateway Forge targets Omnissa Unified Access Gateway (UAG) behavior. When a source conflict exists, the current versioned Omnissa product documentation and the appliance/deployment tooling win over implementation conventions or community examples.

## Authoritative product documentation

- [Deploying and Configuring Omnissa Unified Access Gateway](https://docs.omnissa.com/category/UnifiedAccessGateway): versioned product guide and the primary source for supported behavior and settings.
- [PowerShell deployment parameters](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/PowerShelldeploymentparameters): deploy-time INI parameters, deployment size variants, NIC counts, and address/mask semantics.
- [Run PowerShell script to deploy](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/RunPowerShellscripttodeploy): canonical sample INI, deployment keys, and `uagdeploy` invocation.
- [Secure DMZ design with multiple network interfaces](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/SecureDMZdesignwithmultiplenetworkinterfaces): authoritative one-, two-, and three-NIC traffic separation model. A two-NIC deployment places Internet traffic on the first interface and combines authenticated back-end and management traffic on the second; a three-NIC deployment further separates management traffic.
- [Deploying UAG without Network Protocol Profile](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/DeployingUnifiedAccessGatewayWithoutNetworkProtocolProfileNPP): static address, subnet mask, and gateway deployment context.
- [System and network requirements](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/Systemandnetworkrequirements) and [Network settings](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/Networksettings): network requirements and supported address-management behavior.
- [Importing UAG settings](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ImportingUnifiedAccessGatewaySettings) and [Exporting UAG settings](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/ExportingUnifiedAccessGatewaySettings): settings JSON as an appliance export/import format. Omnissa does not publish a complete JSON schema for all Gateway Forge settings.
- [Omnissa Product Lifecycle Matrix](https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html): supported product/version lifecycle.
- [TLS security settings](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/TLSSecuritySettings), [Frequently asked questions about security](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/FrequentlyAskedQuestionsFAQsaboutSecurity), and [Troubleshooting security best practices](https://docs.omnissa.com/UnifiedAccessGatewayDeployandConfigure-V2609/TroubleshootingSecurityBestPractices): security guidance used for validation and lint findings.

The appliance's authenticated Swagger UI at `https://<uag>:9443/swagger` is the authoritative runtime/API schema for the deployed appliance and should be used to verify JSON imports.

## Authoritative tooling references

- [Omnissa `euc-samples` UAG deployment tooling](https://github.com/euc-oss/euc-samples/tree/main/UAG-Samples): maintained Omnissa sample automation. Its [network interface notes](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/UAG%20Automation%20and%20Day%202%20Operations/README.md) explicitly map `netInternet` to eth0, `netManagementNetwork` to eth1, and `netBackendNetwork` to eth2.
- [`uagdeploytr.ps1`](https://github.com/euc-oss/euc-samples/blob/main/UAG-Samples/uag-terraform/uagdeploytr.ps1): shows that `twonic*` consumes NIC0 and NIC1 while `threenic*` additionally consumes NIC2. Therefore the two-NIC selection uses `netManagementNetwork`/NIC1, whose product-level role is combined back-end and management; it is not a dedicated back-end-only interface.
- The `uagdeploy.ps1`/`uagdeployhv.ps1` scripts and modules distributed with the selected UAG image are the execution-time authority for a release.

## Project conventions and unverified assumptions

Gateway Forge's validation, UI wording, generated runbooks, and PowerShell wrappers are project implementation conventions, not additional UAG features. A setting marked **verify** in the UI is inferred from an Omnissa-documented naming pattern and remains unverified until checked against the target release's deployment tooling or appliance.

Community INI files and blogs are examples only. They may document an older release, omit DHCP/IPv6 behavior, or contain stale keys; they are not used to override Omnissa documentation or scripts.

## Maintenance

Review this file when a supported UAG version is added or removed, when `src/lib/versions.ts` changes, and before changing deploy-time keys or topology behavior. Recheck the corresponding versioned guide, sample INI, and distributed deployment scripts; update the source links and snapshot date in the same change. Record the release and reason when behavior is inferred rather than directly documented.

Source snapshot: **2026-11-08** (UAG 2609 guide; supported-version list remains tracked in `src/lib/versions.ts`).
