# Contributing

Thanks for helping improve Gateway Forge.

```bash
npm install
npm run dev      # local dev server
npm run check    # svelte-check / TypeScript
npm test         # Vitest
```

## Adding or changing a setting

All form fields, INI/JSON output, import mapping, validation and the command palette are driven by `src/lib/schema.ts`.
Start with [SOURCES.md](SOURCES.md) to distinguish versioned Omnissa documentation and deployment tooling from project conventions and community inference.

1. Add a `Field` to the right group (or add a new `GroupDef`). Use the INI key exactly as documented by Omnissa.
2. Set `since`/`until` (UAG release id, e.g. `'2412'`) when the key only exists in some versions. Check the *Deploying and Configuring UAG* docs for each release.
3. Use `json: false` for anything that is not part of the admin-UI settings JSON (deploy-time values, file paths, and settings whose JSON shape is not documented).
4. Mark secrets with `secret(...)`; they are masked and excluded from exports unless the user opts in.
5. Add a unit test in `src/lib/*.test.ts` and run `npm run check && npm test`.
6. When behavior or a source link changes, update `SOURCES.md` and its version snapshot.

## Updating supported UAG versions

Edit `VERSIONS` and `LIFECYCLE_SNAPSHOT` in `src/lib/versions.ts` when the [Omnissa Lifecycle Matrix](https://docs.omnissa.com/bundle/Product-Lifecycle-Matrix/page/lifecyclematrix.html) changes (a weekly workflow opens an issue when it does), and update the README list.

## Verifying against a real appliance

Export an INI from your own UAG (Admin UI → Monitoring → Export) and use **Import** in Gateway Forge. Unrecognised entries are listed in the preview - those are good candidates for new schema fields.
