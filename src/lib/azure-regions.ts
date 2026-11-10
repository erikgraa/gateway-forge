// Microsoft Learn regions-list revision bb9c1e3aeb9a305a8152162cf047248d13108d09.
// Recognition is advisory: this public-cloud catalog includes restricted/preview regions, not subscription availability.
export const KNOWN_AZURE_REGIONS = new Set([
  'australiacentral', 'australiacentral2', 'australiaeast', 'australiasoutheast',
  'austriaeast', 'belgiumcentral', 'brazilsouth', 'brazilsoutheast',
  'canadacentral', 'canadaeast', 'centralindia', 'centralus', 'chilecentral',
  'denmarkeast', 'eastasia', 'eastus', 'eastus2', 'francecentral', 'francesouth',
  'germanynorth', 'germanywestcentral', 'indiasouthcentral', 'indonesiacentral',
  'israelcentral', 'italynorth', 'japaneast', 'japanwest', 'koreacentral', 'koreasouth',
  'malaysiawest', 'mexicocentral', 'newzealandnorth', 'northcentralus', 'northeurope',
  'norwayeast', 'norwaywest', 'polandcentral', 'qatarcentral', 'southafricanorth',
  'southafricawest', 'southcentralus', 'southindia', 'southeastasia', 'southeastasia3',
  'spaincentral', 'swedencentral', 'swedensouth', 'switzerlandnorth', 'switzerlandwest',
  'taiwannorth', 'uaecentral', 'uaenorth', 'uksouth', 'ukwest', 'westcentralus',
  'westeurope', 'westindia', 'westus', 'westus2', 'westus3'
]);

export function knownAzureRegion(value: string): boolean {
  return KNOWN_AZURE_REGIONS.has(value.trim().toLowerCase().replace(/\s+/g, ''));
}
