# Vaultwarden for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration that watches your
self-hosted [Vaultwarden](https://github.com/dani-garcia/vaultwarden) server,
the lightweight server compatible with the Bitwarden apps. It only looks at
the server from outside: it never logs into an account, never opens a vault
and never reads a password.

## Features

- One **Vaultwarden** device: reachable, response time, version, update
  available and latest version (from the GitHub releases).
- With the optional **admin token**: users, organizations, pending
  invitations, disabled accounts and last activity, counted from the admin
  page.
- Scene triggers: the server becomes unreachable, is reachable again (with the
  downtime), a new release is available (once per release, with the link to
  its notes).
- A dashboard widget: the server, its version and update, the accounts (can be
  hidden).
- A **Test the connection** action, and the documentation in English, French,
  German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Vaultwarden server reachable from Gladys (http or https, sub-path
  supported).
- Optional: its admin token (`ADMIN_TOKEN`, in clear), and Internet access to
  the GitHub API for the update check.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-vaultwarden`.
2. In the **Configuration** screen, enter the server address (and the admin
   token if you want the account counts), then **Test the connection**.
3. In the **Discovery** tab, add the **Vaultwarden** device.

The full documentation, shown by Gladys, is in [`docs/`](docs/en.md)
([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)).

## How it works

- Every refresh (30 s to 15 min, 1 min by default): `GET /alive`, whose
  duration is the response time, and `GET /api/version`. The device is read on
  the container's own timer (`should_poll: false`), so the scene triggers fire
  even before the device is added.
- With the admin token, every 5 minutes at most: a login on `POST /admin`
  (the admin API takes no Bearer token, only its `VW_ADMIN` session cookie,
  kept until it expires), then `GET /admin/users`, reduced to counts. A refused
  token is not tried again before the configuration changes: Vaultwarden
  rate-limits these logins and fail2ban often watches them.
- Every 6 hours, if enabled: `GET` on the GitHub API for the latest release of
  `dani-garcia/vaultwarden` (anonymous, 60 requests an hour allowed).
- Nothing is stored in `/data`; the logs never contain the token nor the
  session cookie.

## Checked on a real server

The client and the whole integration were run against the real
`vaultwarden/server` 1.37.5 image in Docker: with and without `ADMIN_TOKEN`
(the admin page answers 404 then), a wrong token (401), accounts registered,
invited (`_status` 1), disabled (`userEnabled` false) and in an organization,
and the server stopped. The answers are kept, with invented ids, in
[`test/fixtures/vaultwarden`](test/fixtures/vaultwarden). The image was also
run under the constraints of the Gladys sandbox (read-only root, no
capability, 256 MB).

## Limitations

- One Vaultwarden server per installation.
- Vaultwarden has no read-only admin token: the token you give Gladys could
  manage the server. Leave it empty to watch the availability and the version
  only.
- No account counts when the admin page is protected by a proxy
  (`DISABLE_ADMIN_TOKEN`) instead of a token.
- The update trigger fires for a release that comes out while the integration
  runs; one already out at start is shown by **Update available** only.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) and an in-memory Vaultwarden and
GitHub (`test/helpers/fakeVaultwarden.js`) built from the fixtures. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Vaultwarden](https://github.com/dani-garcia/vaultwarden) (AGPL-3.0), by
  Daniel García and its contributors: this integration only talks to its HTTP
  endpoints, observed on a running server; no code was copied.
- The cover shows the official Vaultwarden logo, from
  [`resources/`](https://github.com/dani-garcia/vaultwarden/tree/main/resources)
  of the Vaultwarden repository.
- Home Assistant has no official Vaultwarden integration: there was no code to
  port.
- The architecture and the conformity tests follow
  [gladys-headscale](https://github.com/guim31/gladys-headscale) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Vaultwarden
project or Bitwarden Inc. "Bitwarden" is a trademark of Bitwarden Inc.

## License

Apache-2.0
