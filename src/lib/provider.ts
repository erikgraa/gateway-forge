export type ProviderCapability = 'secret' | 'certificate' | 'private-key' | 'ca-chain';

export interface ProviderDescriptor {
  id: string;
  label: string;
  capabilities: readonly ProviderCapability[];
}

/**
 * An opaque, persistable pointer. Provider implementations must not put
 * credentials or resolved material in any field of this reference.
 */
export interface ProviderReference {
  providerId: string;
  resourceId: string;
  kind: ProviderCapability;
  version?: string;
}

export interface ProviderResolveRequest {
  reference: ProviderReference;
  purpose: 'deployment' | 'validation' | 'public-artifact';
}

export interface ResolvedMaterial {
  value: string | Uint8Array;
  expiresAt?: Date;
  version?: string;
}

export interface ProviderAuditEvent {
  providerId: string;
  resourceId: string;
  kind: ProviderCapability;
  action: 'resolve' | 'issue' | 'renew' | 'revoke' | 'export';
  outcome: 'success' | 'failure' | 'cancelled';
  timestamp: Date;
  detail?: string;
}

export interface AuditSink {
  record(event: ProviderAuditEvent): void | Promise<void>;
}

export interface ExternalProvider {
  readonly descriptor: ProviderDescriptor;
  resolve(
    request: ProviderResolveRequest,
    signal?: AbortSignal
  ): Promise<ResolvedMaterial>;
  dispose?(): void | Promise<void>;
}

/** Dormant provider registry: registering a provider does not activate it. */
export class ProviderRegistry {
  private readonly providers = new Map<string, ExternalProvider>();

  register(provider: ExternalProvider): void {
    const id = provider.descriptor.id.trim();
    if (!id) throw new Error('Provider id is required.');
    if (id !== provider.descriptor.id) throw new Error('Provider id cannot have surrounding whitespace.');
    if (this.providers.has(id)) throw new Error(`Provider "${id}" is already registered.`);
    this.providers.set(id, provider);
  }

  get(id: string): ExternalProvider | undefined {
    return this.providers.get(id);
  }

  list(): ProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => provider.descriptor);
  }

  async clear(): Promise<void> {
    const providers = [...this.providers.values()];
    this.providers.clear();
    await Promise.all(providers.map((provider) => provider.dispose?.()));
  }
}
