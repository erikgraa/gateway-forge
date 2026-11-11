import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import packageInfo from '../../package.json';
import CommunityFooter from './CommunityFooter.svelte';

describe('Landing-page community footer', () => {
  it('shows the version from package metadata', () => {
    expect(render(CommunityFooter).body).toContain(`UAG Studio v${packageInfo.version}`);
  });

  it('links to the project and Omnissa without implying affiliation', () => {
    const { body } = render(CommunityFooter);
    expect(body).toContain('https://github.com/erikgraa/uag-foundry');
    expect(body).toContain('https://www.omnissa.com/');
    expect(body).toContain('Source on GitHub');
    expect(body).toContain('Not affiliated with or endorsed by Omnissa.');
    expect(body).toContain('aria-label="Project and vendor links"');
    expect(body.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });
});
