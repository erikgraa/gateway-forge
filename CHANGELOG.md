# Changelog

All notable user-facing changes to Gateway Forge are documented here. This format follows the [Keep a Changelog](https://keepachangelog.com/) structure.

## Unreleased

### Added

- Added a prominent security-baseline warning when an older UAG version is selected, with UAG 2609 identified as the recommended release and a one-click upgrade action.
- Added UAG 2609 General/deployment coverage for per-NIC static routes, IPv6, IP mode, custom NIC configuration, SSH interface selection, OS/admin policy controls, and exact documented key spellings.

### Changed

- Redesigned the UAG configuration workspace into a responsive layout with section navigation, live readiness and validation context, and persistent INI, JSON, PowerShell, and Docs previews.
- Added a source-backed UAG 2609 deployment gap matrix covering implemented settings, NIC applicability, exclusions, and uncertain keys.

## Changelog conventions

- Add user-visible improvements and fixes under `Unreleased` using the appropriate Keep a Changelog section, such as `Added`, `Changed`, `Fixed`, or `Security`.
- Describe the outcome for users rather than implementation details, and keep each entry concise.
- Use past tense, link related references when useful, and move entries into a dated release heading when a release is published.
