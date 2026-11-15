# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-15

### Added

- Your self-hosted Vaultwarden server in Gladys, watched from outside: no
  account login, no vault, no password ever read.
- One "Vaultwarden" device: reachable, response time, version, update
  available and latest version (from the GitHub releases, read every 6 hours,
  can be turned off).
- With the optional admin token: users, organizations, pending invitations,
  disabled accounts and last activity, read every 5 minutes at most on one
  admin session; a refused token is not tried again until the configuration
  changes.
- Scene triggers: Vaultwarden becomes unreachable, is reachable again (with
  the downtime), a new release is available (once per release, with the link
  to its notes).
- A "Vaultwarden" dashboard widget (Gladys 5.1.0 or later): server, version
  and update, accounts (can be hidden).
- A "Test the connection" action, and the documentation in English, French,
  German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-vaultwarden/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-vaultwarden/releases/tag/v1.0.0
