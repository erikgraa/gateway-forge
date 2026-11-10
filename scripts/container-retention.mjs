import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86_400_000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const INDEX_TYPES = new Set([
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);
const IMAGE_TYPES = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const ACCEPT = [...INDEX_TYPES, ...IMAGE_TYPES].join(', ');

function timestamp(value) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new Error('Invalid package version timestamp');
  return time;
}

export function validateVersions(versions) {
  const ids = new Set();
  const digests = new Set();
  for (const version of versions) {
    if (!Number.isSafeInteger(version.id) || version.id <= 0 || ids.has(version.id)
      || !DIGEST.test(version.name) || digests.has(version.name)
      || version.metadata?.package_type !== 'container'
      || !Array.isArray(version.metadata.container?.tags)
      || version.metadata.container.tags.some(tag => typeof tag !== 'string' || !tag)) {
      throw new Error('Invalid or duplicate container version metadata');
    }
    timestamp(version.created_at);
    timestamp(version.updated_at);
    ids.add(version.id);
    digests.add(version.name);
  }
  for (const tag of ['latest', 'nightly']) {
    if (!versions.some(version => version.metadata.container.tags.includes(tag))) {
      throw new Error(`Missing protected ${tag} tag; refusing cleanup`);
    }
  }
}

function expiredPolicyTag(tag, cutoff) {
  if (/^sha-[a-f0-9]{7}$/.test(tag)) return true;
  const match = /^nightly-(\d{4})(\d{2})(\d{2})$/.exec(tag);
  if (!match) return false;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date && time < cutoff;
}

export function manifestReferences(manifest) {
  if (manifest.schemaVersion !== 2 || (!INDEX_TYPES.has(manifest.mediaType) && !IMAGE_TYPES.has(manifest.mediaType))) {
    throw new Error('Unknown manifest format; refusing cleanup');
  }
  const descriptors = INDEX_TYPES.has(manifest.mediaType)
    ? (Array.isArray(manifest.manifests) ? [...manifest.manifests] : null)
    : [manifest.config, ...(Array.isArray(manifest.layers) ? manifest.layers : [])];
  if (!Array.isArray(descriptors) || (INDEX_TYPES.has(manifest.mediaType) && descriptors.length === 0)
    || (IMAGE_TYPES.has(manifest.mediaType) && !Array.isArray(manifest.layers))) {
    throw new Error('Malformed manifest descriptors');
  }
  if (manifest.subject) descriptors.push(manifest.subject);
  if (descriptors.some(item => !item || !DIGEST.test(item.digest))) {
    throw new Error('Invalid manifest reference');
  }
  return descriptors.map(item => item.digest);
}

export function planRetention(versions, manifests, now = Date.now()) {
  validateVersions(versions);
  if (!Number.isFinite(now)) throw new Error('Invalid retention clock');
  const cutoff = now - 30 * DAY;
  const referenced = new Set();
  for (const version of versions) {
    const manifest = manifests.get(version.name);
    if (!manifest) throw new Error('Incomplete manifest inventory');
    for (const digest of manifestReferences(manifest)) referenced.add(digest);
  }
  return versions.filter(version => {
    const tags = version.metadata.container.tags;
    // Keep every untagged version and every referenced manifest, including nested indexes and attestations.
    return tags.length > 0 && tags.every(tag => expiredPolicyTag(tag, cutoff))
      && timestamp(version.created_at) < cutoff && timestamp(version.updated_at) < cutoff
      && !referenced.has(version.name);
  });
}

function snapshot(versions) {
  return JSON.stringify(versions.map(version => [version.id, version.name, version.created_at,
    version.updated_at, [...version.metadata.container.tags].sort()]).sort((a, b) => a[0] - b[0]));
}

export function createClients({ repository, ownerType, token, actor, fetchImpl = fetch }) {
  if (!/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(repository) || !['User', 'Organization'].includes(ownerType) || !token || !actor) {
    throw new Error('Expected lowercase repository, owner type, actor and GH_TOKEN');
  }
  const [owner, name] = repository.split('/');
  const base = `https://api.github.com/${ownerType === 'Organization' ? 'orgs' : 'users'}/${owner}/packages/container/${encodeURIComponent(name)}/versions`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
    return response;
  }
  let registryToken;
  return {
    async listVersions() {
      const versions = [];
      for (let page = 1; page <= 100; page++) {
        const response = await request(`${base}?per_page=100&page=${page}&state=active`, { headers });
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error('Invalid package inventory response');
        versions.push(...batch);
        if (batch.length < 100) {
          validateVersions(versions);
          return versions;
        }
      }
      throw new Error('Package inventory pagination limit exceeded; refusing cleanup');
    },
    async getManifest(digest) {
      if (!DIGEST.test(digest)) throw new Error('Invalid manifest digest');
      if (!registryToken) {
        const response = await request(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`, {
          headers: { Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}` },
        });
        registryToken = (await response.json()).token;
        if (typeof registryToken !== 'string' || !registryToken) throw new Error('Missing registry token');
      }
      const response = await request(`https://ghcr.io/v2/${repository}/manifests/${digest}`, {
        headers: { Authorization: `Bearer ${registryToken}`, Accept: ACCEPT },
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (`sha256:${createHash('sha256').update(body).digest('hex')}` !== digest) {
        throw new Error('Registry manifest digest mismatch');
      }
      return JSON.parse(body.toString('utf8'));
    },
    async deleteVersion(id) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid deletion ID');
      const response = await request(`${base}/${id}`, { method: 'DELETE', headers });
      if (response.status !== 204) throw new Error('Unexpected package deletion response');
    },
  };
}

export async function runRetention(clients, { apply = false, now = Date.now(), log = console.log } = {}) {
  let versions = await clients.listVersions();
  validateVersions(versions);
  const manifests = new Map();
  // Complete all read/validation work before issuing any destructive request.
  for (const version of versions) manifests.set(version.name, await clients.getManifest(version.name));
  const candidates = planRetention(versions, manifests, now);
  log(`${apply ? 'Apply' : 'Dry run'}: ${candidates.length} expired versions; keeping ${versions.length - candidates.length} versions`);
  for (const version of candidates) log(`${apply ? 'Delete' : 'Would delete'} ${version.id}: ${version.metadata.container.tags.join(', ')}`);
  if (!apply) return candidates;
  for (const version of candidates) {
    const current = await clients.listVersions();
    validateVersions(current);
    if (snapshot(current) !== snapshot(versions)) throw new Error('Package inventory changed; refusing further deletions');
    await clients.deleteVersion(version.id);
    log(`Deleted ${version.id}`);
    versions = versions.filter(item => item.id !== version.id);
  }
  return candidates;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !['--apply', '--dry-run'].includes(arg))) throw new Error('Usage: node scripts/container-retention.mjs [--dry-run|--apply]');
    await runRetention(createClients({
      repository: (process.env.GITHUB_REPOSITORY ?? '').toLowerCase(),
      ownerType: process.env.PACKAGE_OWNER_TYPE,
      actor: process.env.GITHUB_ACTOR,
      token: process.env.GH_TOKEN,
    }), { apply: args.includes('--apply') });
  } catch (error) {
    console.error(`Container retention failed: ${error.message}`);
    process.exitCode = 1;
  }
}
