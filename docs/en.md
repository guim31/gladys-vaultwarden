# Vaultwarden

Watch your [Vaultwarden](https://github.com/dani-garcia/vaultwarden) server in
Gladys: one "Vaultwarden" device (reachable or not, response time, version,
update available and latest version, and with the admin token the users,
organizations, pending invitations, disabled accounts and last activity), a
dashboard widget, and scene triggers when the server becomes unreachable,
comes back, or when a new release is out.

Vaultwarden is the lightweight, self-hosted server compatible with the
Bitwarden apps. This integration **only watches the server from outside**: it
never logs into an account, never opens a vault and never reads a password.
It was tested against a real Vaultwarden 1.37.5 in Docker, with and without
an admin token, accounts created, invited and disabled, and the server
stopped. Feedback welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-vaultwarden/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A Vaultwarden server reachable from Gladys: the address you open the web
  vault with.
- Optional: the admin token of the server (the `ADMIN_TOKEN` variable, the
  one that opens the `/admin` page), for the account counts.
- Optional: Internet access from Gladys to GitHub, for the update check.

## Set up

1. In Gladys, install the integration, then open its **Configuration** screen.
2. Fill in **Vaultwarden address**: `https://vault.example.com`, or
   `192.168.1.20:8080` for a plain http address on your network. When
   Vaultwarden is served under a sub-path (`DOMAIN` ends with `/vault`), type
   it too.
3. Optional: fill in **Admin token (optional)** to get the account counts.
4. Press **Test the connection**: it shows the version, whether it is up to
   date, and the accounts.
5. In the **Discovery** tab, add the **Vaultwarden** device.

The other settings:

- **Accept a self-signed certificate**: only for an https address whose
  certificate is not signed by a known authority.
- **Check for updates** (on by default): compares the running version with
  the latest release on GitHub, read every 6 hours (GitHub allows 60 anonymous
  requests an hour).
- **Refresh interval**: how often the server is checked (30 s to 15 min, 1 min
  by default). One check is two small requests: `/alive` and `/api/version`.
- **Language of the names**: language of the feature names and of the dates,
  set when the device is added.

### The admin token

Type the token **in clear**, the one you type on the `/admin` page. When
`ADMIN_TOKEN` holds an Argon2 hash (`$argon2id$…`), it is the password you
hashed, not the hash.

With the token, Gladys logs into the admin page and reads the account list
(`/admin/users`) every 5 minutes at most, keeping the session until it
expires. It only counts: users, organizations, pending invitations, disabled
accounts, the latest activity. **No vault content can be read this way**: the
admin page itself never sees the passwords, which are encrypted on your
devices.

A refused token is not tried again until you change the configuration or
press **Test the connection**: a tool like fail2ban often watches these
logins. The token is kept by Gladys like every secret field and never written in the logs. On a plain `http://` address, and with **Accept a self-signed certificate**, it travels unprotected or to an unverified server: prefer https, or keep it to a network you trust.

## The devices

One **Vaultwarden** device, with:

| Feature             | Kind   | When                                        |
| ------------------- | ------ | ------------------------------------------- |
| Reachable           | 0 / 1  | always                                      |
| Response time       | ms     | while reachable                             |
| Version             | text   | once read                                   |
| Update available    | 0 / 1  | with **Check for updates**                  |
| Latest version      | text   | with **Check for updates**                  |
| Users               | number | with the admin token (invitations excluded) |
| Organizations       | number | with the admin token                        |
| Pending invitations | number | with the admin token                        |
| Disabled accounts   | number | with the admin token                        |
| Last activity       | text   | with the admin token (date and time)        |

The integration reads the server on its own timer: values are published when
they change, and every 12 hours anyway. Adding or removing the admin token, or
turning the update check on or off, changes the features: Gladys then offers
to **Update** the device in the Discovery tab.

## Dashboard

The **Vaultwarden** widget shows, in one list: the server (with the name you
gave the device in Gladys) and its response time, or **Unreachable** in red;
the version, marked up to date or with the release to install; and, with the
admin token, the accounts. Its setting **Show the accounts** hides the account
rows.

## Scenes

### Triggers

- **Vaultwarden becomes unreachable**: the server stops answering its health
  check, after answering before. Variables: the server name, the running
  version.
- **Vaultwarden is reachable again**: the server answers again, after **Vaultwarden becomes unreachable** (a server already down when the integration starts fires neither). Variables: the
  server name, the running version, the downtime in minutes.
- **A Vaultwarden update is available**: a release newer than the running
  version appears on GitHub, once per release. Variables: the server name, the
  running version, the new version, the link to its release notes. A release
  already out when the integration starts is shown by **Update available**,
  without the trigger.

### Scene ideas

- Send a message when the password server stops answering, and another one
  with the downtime when it comes back.
- Get the release notes link in a message when a new version is out.
- Use **Pending invitations** in a condition to remind you of an invitation
  nobody accepted.

## Troubleshooting

- **"Vaultwarden does not answer"**: check the address and the port, and that
  Gladys can reach them (firewall, `127.0.0.1` from a container).
- **"No Vaultwarden server at this address"**: the address points to another
  service (a reverse proxy page, another port) or misses the sub-path.
- **"Certificate refused"**: if the certificate is yours, turn on **Accept a
  self-signed certificate**.
- **"Admin token refused"**: type the token in clear, not its Argon2 hash. With `DISABLE_ADMIN_TOKEN`, the server has no token to check: leave the field empty.
- **"The admin page of Vaultwarden is disabled"**: the server has no
  `ADMIN_TOKEN`: leave the token empty.
- **"Too many admin logins"**: Vaultwarden limits the logins to the admin page
  (`ADMIN_RATELIMIT_*`); the integration tries again 5 minutes later.

## Limits

- One Vaultwarden server per installation of the integration.
- The admin page has no read-only token: the admin token you give Gladys could
  manage the server. Leave it empty if you only want the availability and the
  version.
- When `DISABLE_ADMIN_TOKEN` is set (the admin page protected by a proxy
  instead of a token), the account counts are not available.
- **Update available** compares version numbers: a `testing` image built after
  the last release reads as that release.
- The update trigger is not stored: a release that came out while the
  integration was stopped is shown by **Update available**, without the
  trigger.
- Not affiliated with the Vaultwarden project nor with Bitwarden Inc.
  Bitwarden is a trademark of Bitwarden Inc.
