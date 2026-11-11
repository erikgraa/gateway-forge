<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/uag-foundry-readme-icon-dark.png">
  <img src="assets/uag-foundry-readme-icon.png" alt="UAG Foundry Cast gateway icon" width="140" height="140">
</picture>

# UAG Foundry

> **Previously Gateway Forge.** UAG Foundry 0.9.0 introduces the new name and scenario workspace. Browser drafts and preferences do not transfer between domains: export configurations from the old site before switching. See the [migration notes](docs/technical-guide.md#moving-from-gateway-forge).

Build, check and export configurations for **Omnissa Unified Access Gateway (UAG)**—right in your browser.

[![Latest release](https://img.shields.io/github/v/release/erikgraa/uag-foundry?label=release&color=7c3aed)](https://github.com/erikgraa/uag-foundry/releases/latest)
[![Site build on main](https://github.com/erikgraa/uag-foundry/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/erikgraa/uag-foundry/actions/workflows/pages.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-14b8a6)](LICENSE)
[![Self-host with Docker or Podman](https://img.shields.io/badge/self--host-Docker%20%7C%20Podman-2563eb)](docs/technical-guide.md#containers)

## 🚀 Try it

**[Open UAG Foundry](https://uagfoundry.graa.dev)** — no installation needed.
Your configuration is processed in your browser, not uploaded to a server.

![UAG Foundry scenario chooser in dark theme](docs/screenshots/chooser-dark.png)

*UAG Foundry 0.9.0. Screenshots use a disposable browser profile and blank or synthetic configurations, not operator drafts.*

![UAG Foundry configuration workspace in dark theme](docs/screenshots/builder-dark.png)

*Configuration fields come first. Compact readiness and advisory counts stay above them; select a count to open the full **Validation & lint** panel below the section.*

## 🏠 Self-hosting

Prefer your own instance? Run UAG Foundry with Docker or Podman, or host it on your own web server. See the [container instructions](docs/technical-guide.md#containers) and [hosting notes](docs/technical-guide.md#hosting).

## 🧭 How it works

1. **Start a configuration.** Begin blank, use a template, or import an existing INI or settings JSON file.
2. **Make it yours.** Choose your deployment platform and UAG version, then fill in the settings you need. Use the compact counts to review validation below the section, then click a finding to jump to its field.
3. **Review and export.** Download deployment files, settings JSON or PowerShell commands. Run the appropriate deployment tools yourself—the app does not deploy anything.

Browser-local drafts let you return to your work. Deployment image and certificate paths refer to files on your deployment host, not browser uploads.

### ✨ Configuration workspaces

Choose **Single UAG**, **Horizon UAG topology** or **Web proxy**. Named browser-local drafts keep configurations separate; Horizon fleets have a group overview and grouped downloads. Choose among three palettes and System, Light or Dark themes. **Save & return** resumes the chooser. Remove one draft or use confirmed **Clear all drafts** without resetting appearance or the previous legacy configuration. Read the [workspace details](docs/technical-guide.md#scenario-workspaces) or see the [roadmap](ROADMAP.md) for future work.

## ⚠️ Before you deploy

- **Deployment scripts can delete and recreate an existing VM.** Confirm the target and VM name, back up your configuration and plan downtime.
- **Keep drafts and exports private.** Check the export's secret-handling choice; imported values and advanced locators can still contain credentials. Browser drafts are not a secure secrets store.
- **Test in a lab first.** Generated files and automated checks do not certify every platform, service or HA/failover setup. See the [support and test status](docs/technical-guide.md#deployment-support-and-test-status).

## 💡 Ideas and feedback

Feature suggestions are welcome! [Open an issue](https://github.com/erikgraa/uag-foundry/issues) with what you'd like to do and how it would help. Feedback and contributions are welcome too.

## 📚 More information

- [Technical guide](docs/technical-guide.md) — platform notes, deployment steps, file formats, security, Docker and local development.
- [Source references](SOURCES.md) — where supported settings and evidence come from.
- [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## 📄 License and disclaimer

[MIT](LICENSE). UAG Foundry is an independent community tool, not affiliated with or endorsed by Omnissa. Always review generated configuration before deploying to production.
