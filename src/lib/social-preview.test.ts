import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const domain = readFileSync(new URL('../../public/CNAME', import.meta.url), 'utf8').trim();
const publicUrl = `https://${domain}/`;

function meta(attribute: 'name' | 'property', key: string) {
  const matches = [...html.matchAll(/<meta\s+([^>]+)>/g)]
    .map((match) => Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]])))
    .filter((attributes) => attributes[attribute] === key);
  expect(matches, key).toHaveLength(1);
  return matches[0].content;
}

describe('static sharing metadata', () => {
  it('aligns the production domain across deployment checks and documentation', () => {
    expect(domain).toBe('uagstudio.graa.dev');
    const pages = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
    expect(pages).toContain(`test "$(cat dist/CNAME)" = "${domain}"`);
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain(`**[Open UAG Studio](https://${domain})**`);
    const container = readFileSync(new URL('../../.github/workflows/container.yml', import.meta.url), 'utf8');
    expect(container).toContain('grep -q "UAG Studio"');
  });

  it('provides consistent crawler-readable titles, descriptions and canonical URLs', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    expect(title).toBeTruthy();
    expect(meta('property', 'og:title')).toBe(title);
    expect(meta('name', 'twitter:title')).toBe(title);
    const description = meta('name', 'description');
    expect(description).toContain('Omnissa Unified Access Gateway');
    expect(meta('property', 'og:description')).toBe(description);
    expect(meta('name', 'twitter:description')).toBe(description);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:site_name')).toBe('UAG Studio');
    expect(meta('property', 'og:url')).toBe(publicUrl);
    expect(html).toContain(`<link rel="canonical" href="${publicUrl}" />`);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('references a real, correctly sized PNG with image metadata and accessible descriptions', () => {
    const imageUrl = meta('property', 'og:image');
    expect(imageUrl).toBe(`${publicUrl}social-preview.png?v=0.9.1-social-2`);
    expect(meta('name', 'twitter:image')).toBe(imageUrl);
    expect(meta('property', 'og:image:type')).toBe('image/png');
    const image = readFileSync(new URL('../../public/social-preview.png', import.meta.url));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(image.readUInt32BE(16)).toBe(Number(meta('property', 'og:image:width')));
    expect(image.readUInt32BE(20)).toBe(Number(meta('property', 'og:image:height')));
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    expect(image.length).toBeLessThan(1_000_000);
    const alt = meta('property', 'og:image:alt');
    expect(alt).toContain('UAG Studio');
    expect(meta('name', 'twitter:image:alt')).toBe(alt);
  });
});
