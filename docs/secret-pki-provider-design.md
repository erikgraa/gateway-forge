# Secret-management and PKI provider integration design

## Status and scope

This document is the implementation roadmap for [issue #58](https://github.com/erikgraa/uag-foundry/issues/58). It defines a security boundary before UAG Foundry enables any external secret-management or PKI-management vendor.

The current implementation remains browser-only, offline-capable, and provider-free. In particular, this design must not be implemented as a vendor SDK in the static application, an always-on synchronization feature, or a browser-managed credential store.

## Existing guarantees to preserve

UAG Foundry currently keeps configuration data in an in-memory Svelte model. A draft is saved to `localStorage` only after fields marked `secret` are replaced with empty strings. Output generation defaults to `<REDACTED>` for secret fields, supports omission, and exposes plain-text inclusion only as an explicit output choice. UAG root and administrator passwords are not collected. Certificate fields contain deployment-time file paths; certificate and private-key content is not collected or persisted.

These guarantees are the baseline:

- No telemetry or provider network request occurs by default.
- Configuration remains usable without a provider or network connection.
- Provider configuration is disabled until the user performs an explicit setup and enables one provider for a workspace.
- Provider credentials and resolved secrets, certificates, and private keys never enter the configuration model or browser `localStorage`.
- The default and offline output policies never include protected material.
- A provider failure never silently produces a complete-looking deployment artifact.

## Provider abstraction

Future adapters must implement the dormant contracts in `src/lib/provider.ts`; no implementation is registered or invoked by the current application. The contracts deliberately describe provider-neutral capabilities rather than vendor resources:

- **Secret store:** resolve an opaque shared secret or password by reference.
- **Certificate store:** resolve a public certificate or CA chain by reference.
- **Certificate issuer:** request issuance and return a short-lived handle and public material; issuance is a separate, user-confirmed operation.
- **Private-key source:** resolve private material only through a narrowly scoped, short-lived operation. Preference is for provider/deployment-host signing or export without bringing key bytes into UAG Foundry.

A persisted provider reference contains only a provider ID, opaque resource ID, material kind, and optional provider version. It must not contain a token, username/password, certificate bytes, private-key bytes, or provider response. Provider-specific path, mount, namespace, tenant, and policy identifiers belong behind the adapter boundary and must be reviewable before they are saved.

The static registry is not a discovery or autoload mechanism. A provider is registered by explicit application build/configuration, reported in the UI, and remains inactive until the user enables it. Providers must advertise capabilities and must reject requests outside them.

## Material classes and boundaries

| Material | Default draft/export behavior | Preferred future provider flow |
| --- | --- | --- |
| RADIUS/SNMP/shared secrets | Empty in `localStorage`; redacted or omitted in generated output | Store an opaque reference. Resolve only at the final user-confirmed deployment step. |
| Root/admin deployment passwords | Never collected or exported as values by UAG Foundry | Interactive mode lets the official script prompt when parameters are omitted; environment-password mode reads the process environment. Other vendor-script prompts, including the vCenter password, may remain; this is not guaranteed unattended execution. |
| Other credentials | Classified as secret before use; empty in drafts and never inferred from provider metadata | Resolve through the same opaque-reference and short-lived-material policy. |
| Public certificates and CA chains | Current fields may contain file paths; content is not stored | Store a non-secret reference or a deployment-host path. Public bytes may be included in an artifact only after the user selects that export policy. |
| Private keys | Current fields contain file paths only; key content is forbidden in drafts | Prefer non-exportable provider keys and deployment-host retrieval. If export is unavoidable, require per-operation confirmation and immediate cleanup. |
| PFX/PKCS#12 bundles | File path only; content and passphrase are secret | Resolve on the deployment host. A local browser export requires the same explicit policy as private keys and must be separately confirmed. |

Schema evolution must add a sensitivity classification independent of display type. The provider layer must not decide sensitivity by field name or output format.

## Explicit opt-in lifecycle

1. The user opens an **External providers** configuration view; no background discovery occurs.
2. The user selects one build-installed adapter and reviews its origin, capabilities, requested scopes, target hosts, and network endpoints.
3. The user confirms that drafts may contain opaque references but no provider credentials or resolved material.
4. Authentication is initiated by a user gesture and is scoped to the adapter/session.
5. The user binds individual fields to provider references. A global “use provider for everything” mode is not planned.
6. Every resolve/issue operation displays provider, resource label, material class, destination, and scope. Destructive issuance/renewal requires a second confirmation.
7. The user can disable or disconnect a provider. Disconnection disposes sessions, aborts active requests, clears resolved material, and retains only references that can be understood offline.
8. `Reset` clears local provider binding configuration in addition to the draft.

Provider enablement is not persisted as a one-time consent across origins, upgraded adapters, or changed requested scopes. Any such change requires renewed consent.

## Browser storage and memory policy

`localStorage` is the approved storage boundary for a sanitized draft and currently contains the theme and draft configuration. A future provider integration may store only:

- Provider identifier and adapter version.
- Whether the user opted in for the provider.
- Opaque reference metadata and user-provided labels.
- Non-sensitive policy choices needed to reproduce an export decision.

It must never store:

- Provider access tokens, refresh tokens, client secrets, cookies, device credentials, or key store passwords.
- RADIUS/SNMP/shared secret values or UAG deployment passwords.
- Certificate requests containing private keys.
- Private keys, PFX contents, or provider responses containing resolved material.
- Generated artifacts containing protected material.

Authentication state belongs in an adapter-owned session or browser identity mechanism. It must be memory-only by default and expire or be explicitly cleared. `sessionStorage` is not a safe workaround: it is still script-readable browser storage and is excluded for all protected material.

Resolved material must have a bounded lifetime, be consumed at the final output/deployment boundary, and then be discarded. JavaScript strings cannot be reliably zeroed; implementations must avoid copies, URLs, logs, exceptions, DOM attributes, clipboard copies, and framework state. `Uint8Array` is preferred where native wiping is possible. A web worker or local deployment helper may be required to enforce this boundary.

## Export and deployment policy

The export API must accept an explicit policy rather than a provider boolean:

| Policy | Allowed output |
| --- | --- |
| `reference` (default) | Opaque provider reference or a documented deployment-host lookup expression; no protected value. |
| `omit` | No value and no provider reference. |
| `public` | Public certificate/CA-chain bytes only when explicitly selected for this artifact. |
| `resolve-secret` | Secret values only in an ephemeral, confirmed export/deployment operation. Rejected for persisted previews and runbook exports. |
| `resolve-private-key` | Private-key bytes only with a dedicated confirmation and provider capability. Disabled by default and may be unsupported by an adapter. |

The preview tab must never trigger resolution. Copy, download, Docs, and any generated URL are also non-resolving operations unless a future UI introduces a clearly separate “Resolve and deploy” flow. If provider-resolved output is ever supported, mark it with the provider, timestamp, reference version, and protected-artifact warning; prevent implicit clipboard use and do not persist it in app state.

Providers must be able to return deploy instructions or a one-time deployment-host handle instead of browser-visible material. That is the preferred path for private keys and reusable secrets.

## Provider authentication

Provider adapters authenticate through one approved mode: delegated OAuth/OIDC, workload identity mediated by a user-started local helper, hardware-backed/browser credential APIs, or short-lived token exchange performed outside the static page. Static client secrets, long-lived bearer tokens pasted into a form, basic-auth passwords, and cookies written by application code are prohibited.

The UI must disclose requested scopes, tenant/account, audience, token lifetime, and allowed hosts before consent. The adapter must use least privilege, pin allowed origins, reject redirects not in its allowlist, support cancellation, and clear credentials on disable/disconnect. CORS is not an authorization boundary. Provider URLs and optional local helper origins must be schema-validated and cannot be controlled by untrusted imported configuration.

UAG Foundry does not receive credentials through generated INI/JSON or store them in a provider reference. A local provider helper, if later used, must bind to loopback, authenticate browser requests (for example with a one-time random channel token), enforce Origin/Host checks, and relay only the minimum provider operation. It must be introduced as a separately reviewed feature with explicit trust and privileges.

## Auditability

Every provider operation emits a sanitized audit event containing provider/resource identifiers, action, material class, outcome, timestamp, selected policy, and a correlation ID. It must not include resolved values, tokens, request/response bodies, stack traces, or secrets embedded in provider errors.

The user sees a local operation history for the session and can download a sanitized audit record. If the provider exposes authoritative audit logs, the application stores the provider event/correlation identifier rather than duplicating a full secret event log. Errors shown in the UI must separate a safe summary from optional diagnostics reviewed locally. Audit export is non-secret and uses the `reference` policy.

Issuance, renewal, revocation, private-key export, and plaintext secret resolution are distinct audited actions. An adapter should support structured outcome and authorization information but cannot rely on an audit sink to decide whether an operation succeeded.

## Threat model

### Protected assets

Provider credentials, secret values, private keys, PFX bundles, certificate issuance authority, opaque reference metadata, configuration topology, and audit identities are protected. Public certificates and CA chains are integrity-sensitive even though their contents are not generally confidential.

### Trust boundaries

The browser page, static hosting origin, provider identity endpoint/API, optional loopback helper, deployment host/tooling, browser storage, clipboard, downloaded artifacts, and provider audit system are distinct trust boundaries. A value crossing one must be explicitly classified and policy-gated.

### Threats and controls

- **Browser or same-origin compromise:** minimize retained material; exclude protected values from component state/storage; use short-lived access; never trust UI text as a security boundary.
- **Malicious provider adapter or dependency:** build-time allowlisting, capability manifests, package review, pinned versions, scope/endpoint review, and independent adapter code review. No runtime installation from URLs.
- **XSS/imported configuration injection:** imported files cannot enable providers, choose endpoints, store tokens, or select sensitive export policies. Render only escaped data and use strict object mapping.
- **Credential theft/phishing:** explicit origin/account display, delegated auth, no token-paste UI, state/PKCE/nonce validation, redirect allowlists, and cancellation.
- **Replay, confused deputy, and stale consent:** short lifetimes, user-gesture confirmation, reference binding to provider/field/scope, operation correlation IDs, and consent invalidation on policy changes.
- **Accidental leakage:** centralized export-policy enforcement, regression tests with canary secrets, sanitized exceptions/logs/audits, and artifact warnings; no secret-bearing browser preview.
- **Provider/network compromise or outage:** certificate/host validation, pinned allowlisted endpoints where appropriate, timeout/abort support, and an offline fallback that uses blank/redacted/omitted values.
- **Supply-chain compromise:** provider code is out of the default production bundle until reviewed and explicitly enabled, with lockfile verification and CI checks that assert the static bundle makes no provider requests by default.

The browser cannot promise memory non-retention after process compromise, nor durable key deletion from JavaScript garbage collection. Private-key custody should therefore remain with the PKI provider or deployment host whenever possible.

## Offline fallback and failure behavior

Provider bindings use opaque references and remain editable while offline. The application must not replace a failed lookup with an empty value that looks intentional. It marks the field unresolved, displays the provider and safe error, and offers:

- Continue with `<REDACTED>` placeholders.
- Omit provider-backed fields.
- Use a manually entered value in the existing transient, non-persisted secret input.
- Use a deployment-host file path for certificate material.
- Retry or disconnect the provider.

Generation with unresolved references defaults to placeholders or references, never to live values. Offline mode disables resolve/issue actions but preserves all ordinary editing, validation, import, and redacted export behavior. A cached secret or certificate is not created merely to provide fallback.

## Implementation roadmap

### Milestone 0: design and invariant coverage (issue #58)

- Record this design and link it from project roadmap/security documentation.
- Add only the dormant provider-neutral contracts and registry.
- Add tests that prove registration and disposal are isolated from configuration behavior.
- Verify that existing draft stripping and default output redaction still pass.

### Milestone 1: references and classification

- Add sensitivity metadata and opaque provider-reference storage to the schema model without storing protected material.
- Add a sanitization allowlist for drafts and imports rather than relying only on `stripSecrets`.
- Extend import/export tests with canary tokens, private-key material, and unknown metadata.
- Define reference serialization and migration/versioning.

### Milestone 2: opt-in provider lifecycle

- Build the provider setup, consent, authentication, disconnect, capability, and session-expiry state machine.
- Add no provider to the default bundle; select adapters explicitly behind a reviewed build boundary.
- Add abort, timeout, no-telemetry, and network-allowlist tests.
- Add sanitized local audit events and a provider-free offline mode test.

### Milestone 3: one secret-store adapter

- Implement one standards- or deployment-host-mediated secret adapter, chosen only after a separate security review and product decision.
- Support opaque references, delegated authentication, and short-lived resolve-to-deployment only.
- Prove no resolved bytes enter `localStorage`, previews, logs, docs output, or component state.
- Conduct threat-model review and a fixture-based failure/revocation test.

### Milestone 4: public PKI material

- Add certificate/CA-chain lookup and integrity checks (chain, usage, expiry, expected identifier).
- Keep issuance separate from lookup and require user confirmation.
- Support references and deployment-host file material first; do not support private-key browser export.

### Milestone 5: private-key custody

- Require a separate design and security review.
- Prefer provider-side signing/non-exportable keys or local deployment-host retrieval.
- Browser-visible private-key export remains disabled unless a concrete, reviewed requirement exists.

### Release gates

No milestone beyond 0 ships until all of these hold:

- Static/offline behavior is unchanged when providers are absent or disabled.
- A canary audit demonstrates that protected material cannot enter draft storage, preview state, logs, exceptions, Docs, JSON/INI defaults, or clipboard paths.
- Provider auth changes invalidate prior consent and clear active sessions.
- Network, audit, timeout, cancellation, disconnect, and offline fallback tests pass.
- The adapter passes security and dependency review and has a documented revocation/incident procedure.
- Product documentation states exactly which material may leave the provider and in which environment.
