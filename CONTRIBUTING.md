# Contributing

Thanks for helping improve Gateway Forge.

```bash
npm install
npm run dev      # local dev server
npm run check    # svelte-check / TypeScript
npm test         # Vitest
```

## Source and evidence rules

Read [SOURCES.md](SOURCES.md) before changing UAG keys, deployment commands,
version gates, JSON shape, lifecycle data, or security guidance.

- Cite the official source or appliance/release artifact for the exact UAG
  version. Put the release, evidence URL or artifact, and observation date in
  the pull request description when a claim is not obvious from the diff.
- Treat a newer release's docs as evidence for that release only. A page
  appearing in one release does not prove that a key was introduced in that
  release; retain uncertain `since`/`until` values as inferred behavior.
- Keep an inferred key visibly marked with `inferred` and describe what must be
  checked. Do not make an unverified assumption a required field, default, or
  blocking validation.
- Treat the schema, current templates, and lint messages as project behavior,
  not as Omnissa authority. A warning can be a Gateway Forge recommendation
  without being a supported-product requirement.
- For lifecycle changes, update `VERSIONS`, `LIFECYCLE_SNAPSHOT`, the README
  list, and the source-review notes together. Re-check the official security
  advisory index and release docs before changing a recommended security
  baseline.
- Re-check public source links when they are changed. If a vendor blocks
  automated requests, record that limitation and verify the official URL in a
  browser rather than replacing it with an unofficial mirror.

## Adding or changing a setting

All form fields, INI/JSON output, import mapping, validation and the command palette are driven by `src/lib/schema.ts`.

1. Add a `Field` to the right group (or add a new `GroupDef`). Use the INI key exactly as documented by Omnissa and follow the evidence rules in [SOURCES.md](SOURCES.md#uag-ini-keys-and-deployment).
2. Set `since`/`until` (UAG release id, e.g. `'2412'`) when the key only exists in some versions. Check the *Deploying and Configuring UAG* docs for each release and document the evidence in the pull request.
3. Use `json: false` for anything that is not part of the admin-UI settings JSON (deploy-time values, file paths, and settings whose JSON shape is not documented).
4. Mark secrets with `secret(...)`; they are masked and excluded from exports unless the user opts in.
5. Add a unit test in `src/lib/*.test.ts` and run `npm run check && npm test`.

## Updating supported UAG versions

Edit `VERSIONS` and `LIFECYCLE_SNAPSHOT` in `src/lib/versions.ts` when the [Omnissa Lifecycle Matrix](https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html) changes (a weekly workflow opens an issue when it does), and update the README list.

## Verifying against a real appliance

Export an INI from your own UAG (Admin UI → Monitoring → Export) and use **Import** in Gateway Forge. Unrecognised entries are listed in the preview - those are good candidates for new schema fields.
