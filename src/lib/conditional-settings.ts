import { fieldAvailable, type Config } from './model';
import type { Field } from './schema';

const explanations = [
  { ids: ['sshPort', 'sshInterface', 'sshPasswordAccessEnabled', 'sshKeyAccessEnabled'], prerequisite: 'Enable SSH to configure its port, interface and access methods.' },
  { ids: ['sshPublicKeys'], prerequisite: 'Enable SSH and SSH key access to configure public keys.' },
  { ids: ['tunnelExternalUrl', 'additionalTunnelExternalUrls'], prerequisite: 'Enable tunnel (secure gateway) to configure tunnel URLs.' },
  { ids: ['blastExternalUrl', 'additionalBlastExternalUrls', 'blastAllowedHostHeaderValues'], prerequisite: 'Enable Blast to configure its URLs and allowed Host headers.' },
  { ids: ['pcoipExternalUrl', 'pcoipDisableLegacyCertificate'], prerequisite: 'Enable PCoIP to configure its external URL and certificate option.' },
  { ids: ['netManagementNetwork', 'ip1', 'netmask1', 'routes1', 'ipmode1', 'ipMode1', 'eth1CustomConfig'], prerequisite: 'Choose a two- or three-NIC deployment for NIC1 settings; IPv4 address and netmask also require static IPv4 addressing.' },
  { ids: ['netBackendNetwork', 'ip2', 'netmask2', 'routes2', 'ipmode2', 'ipMode2', 'eth2CustomConfig'], prerequisite: 'Choose a three-NIC deployment for NIC2 settings; IPv4 address and netmask also require static IPv4 addressing.' },
  { ids: ['ip0', 'netmask0', 'defaultGateway'], prerequisite: 'Select static IPv4 addressing to configure the NIC0 IPv4 address, netmask and gateway.' }
];

export function hiddenSettings(fields: Field[], config: Config): { prerequisite: string; fields: Field[] }[] {
  return explanations.map(({ ids, prerequisite }) => ({
    prerequisite,
    fields: fields.filter((field) => ids.includes(field.id)
      && !fieldAvailable(field, config.version, config.platform, config.values)
      && fieldAvailable({ ...field, showIf: undefined, ipMode: undefined }, config.version, config.platform, config.values))
  })).filter((entry) => entry.fields.length > 0);
}
