import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createClients, manifestReferences, planRetention, runRetention } from './container-retention.mjs';

const now = Date.parse('2026-11-10T02:30:00Z');
const old = '2026-09-01T00:00:00Z';
const digest = (id: number) => `sha256:${id.toString(16).padStart(64, '0')}`;
const image = () => ({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
  config: { digest: digest(999) }, layers: [{ digest: digest(998) }] });
const index = (...ids: number[]) => ({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: ids.map(id => ({ digest: digest(id) })) });
const version = (id: number, tags: string[], created_at = old, updated_at = created_at) => ({
  id, name: digest(id), created_at, updated_at, metadata: { package_type: 'container', container: { tags } },
});
const protectedVersions = () => [version(1, ['latest', 'nightly'])];
function fixture(extra = [version(2, ['nightly-20260901', 'sha-abcdef0'])]) {
  const versions = [...protectedVersions(), ...extra];
  const manifests = new Map(versions.map(item => [item.name, image()]));
  const clients = {
    listVersions: vi.fn(async () => versions),
    getManifest: vi.fn(async (name: string) => manifests.get(name)),
    deleteVersion: vi.fn(async () => {}),
  };
  return { versions, manifests, clients };
}

const options = { now, log: vi.fn() };
describe('30-day container policy', () => {
  it('expires only old dated/SHA tags and keeps current, release, unknown and untagged versions', () => {
    const { versions, manifests } = fixture([
      version(2, ['nightly-20260901', 'sha-abcdef0']), version(3, ['sha-1234567']),
      version(4, ['v1.2.3', 'sha-abcdef0']), version(5, ['release-2026']),
      version(6, []), version(7, ['custom', 'nightly-20260901']),
      version(8, ['nightly-20261101']), version(9, ['sha-ABCDEF0']),
      version(10, ['sha-1234567890']), version(11, ['nightly-20260230']),
    ]);
    expect(planRetention(versions, manifests, now).map(item => item.id)).toEqual([2, 3]);
  });

  it('keeps the exact cutoff, recent creations and recently updated/retagged old versions', () => {
    const cutoff = new Date(now - 30 * 86_400_000).toISOString();
    const { versions, manifests } = fixture([
      version(2, ['sha-abcdef0'], cutoff), version(3, ['sha-abcdef0'], old, cutoff),
      version(4, ['sha-abcdef0'], '2026-11-09T00:00:00Z'),
      version(5, ['nightly-20261012']),
    ]);
    expect(planRetention(versions, manifests, now)).toEqual([]);
  });

  it('keeps all referenced tagged/untagged children, nested indexes and attestation subjects', () => {
    const { versions, manifests } = fixture([
      version(2, ['sha-abcdef0']), version(3, []), version(4, ['sha-1234567']),
      version(5, ['nightly-20260901']), version(6, []),
    ]);
    manifests.set(digest(1), index(2, 3));
    manifests.set(digest(2), index(4));
    manifests.set(digest(6), { ...image(), subject: { digest: digest(5) } });
    expect(planRetention(versions, manifests, now)).toEqual([]);
    expect(planRetention(versions, manifests, now)).toEqual([]);
  });

  it.each(['latest', 'nightly'])('fails closed without %s', tag => {
    const { versions, manifests } = fixture();
    versions[0].metadata.container.tags = versions[0].metadata.container.tags.filter(item => item !== tag);
    expect(() => planRetention(versions, manifests, now)).toThrow('Missing protected');
  });

  it('rejects incomplete, duplicate and malformed inventory and unknown manifests', () => {
    const { versions, manifests } = fixture();
    expect(() => planRetention([...versions, versions[1]], manifests, now)).toThrow('duplicate');
    expect(() => planRetention([versions[0], { ...versions[1], updated_at: 'invalid' }], manifests, now)).toThrow('timestamp');
    manifests.delete(digest(2));
    expect(() => planRetention(versions, manifests, now)).toThrow('Incomplete');
    expect(() => manifestReferences({ schemaVersion: 2, mediaType: 'unknown' })).toThrow('Unknown');
    expect(() => manifestReferences({ ...index(2), manifests: [] })).toThrow('Malformed');
    expect(() => manifestReferences({ ...image(), layers: {} })).toThrow('Malformed');
    expect(() => manifestReferences({ ...image(), config: { digest: 'invalid' } })).toThrow('Invalid');
  });
});

describe('retention execution', () => {
  it('defaults to dry run with zero deletion calls', async () => {
    const { clients } = fixture();
    expect((await runRetention(clients, options)).map(item => item.id)).toEqual([2]);
    expect(clients.deleteVersion).not.toHaveBeenCalled();
  });

  it('applies only planned IDs and rechecks inventory before each deletion', async () => {
    const { clients, versions } = fixture([version(2, ['sha-abcdef0']), version(3, ['sha-1234567'])]);
    clients.listVersions.mockResolvedValueOnce(versions).mockResolvedValueOnce(versions)
      .mockResolvedValueOnce(versions.filter(item => item.id !== 2));
    await runRetention(clients, { ...options, apply: true });
    expect(clients.deleteVersion.mock.calls).toEqual([[2], [3]]);
    expect(clients.listVersions).toHaveBeenCalledTimes(3);
  });

  it('aborts before deletion on manifest/authentication failure', async () => {
    const { clients } = fixture();
    clients.getManifest.mockRejectedValueOnce(new Error('403'));
    await expect(runRetention(clients, { ...options, apply: true })).rejects.toThrow('403');
    expect(clients.deleteVersion).not.toHaveBeenCalled();
  });

  it('aborts if a candidate receives a release tag after preflight', async () => {
    const { clients, versions } = fixture();
    clients.listVersions.mockResolvedValueOnce(versions).mockResolvedValueOnce([
      versions[0], version(2, ['sha-abcdef0', 'v1.0.0']),
    ]);
    await expect(runRetention(clients, { ...options, apply: true })).rejects.toThrow('inventory changed');
    expect(clients.deleteVersion).not.toHaveBeenCalled();
  });

  it('stops after a failed deletion rather than proceeding with other candidates', async () => {
    const { clients } = fixture([version(2, ['sha-abcdef0']), version(3, ['sha-1234567'])]);
    clients.deleteVersion.mockRejectedValueOnce(new Error('403'));
    await expect(runRetention(clients, { ...options, apply: true })).rejects.toThrow('403');
    expect(clients.deleteVersion).toHaveBeenCalledTimes(1);
  });
});

describe('GitHub/GHCR API contracts (mocked; no network)', () => {
  const config = { repository: 'erikgraa/uag-studio', ownerType: 'User', token: 'fixture-token', actor: 'fixture-actor' };

  it.each(['User', 'Organization'])('paginates the %s package endpoint and uses version-ID DELETE', async ownerType => {
    const first = Array.from({ length: 100 }, (_, i) => version(i + 1, i === 0 ? ['latest', 'nightly'] : []));
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify([version(101, ['sha-abcdef0'])])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const clients = createClients({ ...config, ownerType, fetchImpl });
    expect(await clients.listVersions()).toHaveLength(101);
    await clients.deleteVersion(101);
    const base = `https://api.github.com/${ownerType === 'User' ? 'users' : 'orgs'}/erikgraa/packages/container/uag-studio/versions`;
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      `${base}?per_page=100&page=1&state=active`, `${base}?per_page=100&page=2&state=active`, `${base}/101`,
    ]);
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({ method: 'DELETE', redirect: 'error',
      headers: { Authorization: 'Bearer fixture-token', 'X-GitHub-Api-Version': '2022-11-28' } });
  });

  it('authenticates registry reads, validates digest bytes and caches the pull token', async () => {
    const body = JSON.stringify(image());
    const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`;
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: 'pull-token' })))
      .mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(new Response(body));
    const clients = createClients({ ...config, fetchImpl });
    expect(await clients.getManifest(hash)).toEqual(image());
    await clients.getManifest(hash);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://ghcr.io/token?service=ghcr.io&scope=repository:erikgraa/uag-studio:pull');
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer pull-token');
  });

  it('fails closed on HTTP errors, invalid inventory and digest mismatches', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(createClients({ ...config, fetchImpl }).listVersions()).rejects.toThrow('403');
    fetchImpl.mockResolvedValueOnce(new Response('{}'));
    await expect(createClients({ ...config, fetchImpl }).listVersions()).rejects.toThrow('inventory');
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'pull-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(image())));
    await expect(createClients({ ...config, fetchImpl }).getManifest(digest(1))).rejects.toThrow('digest mismatch');
  });
});
