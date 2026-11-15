# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration keeps nothing in `/data`. It never logs into a Vaultwarden
account and never requests a vault: without the admin token it only reads the
public `/alive` and `/api/version` endpoints. The optional admin token is
stored by Gladys in the integration configuration; it is sent only to the
Vaultwarden address of the configuration, as the form of the `/admin` login,
and never written to the logs, nor is the `VW_ADMIN` session cookie it gets
back (kept in memory only). The token gives full access to the admin page,
but the integration only reads `/admin/users` and keeps nothing but counts and
the latest activity date: no e-mail address, no name, no key. A refused token
is not tried again before the configuration changes. The update check sends
one anonymous request to the GitHub API every 6 hours. The "Accept a
self-signed certificate" option turns off the certificate check for the
Vaultwarden server only, never for GitHub; with it, or on a plain `http://`
address, the admin token travels to an unverified server or in clear: the
documentation recommends https.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Vaultwarden and the Bitwarden clients.
