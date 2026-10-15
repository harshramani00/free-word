# Running Quill Cloud on a Windows machine

Quill Cloud is one JavaScript file (`server.mjs`) that needs only Node.js. It keeps every
synced document, every version of it, the sign-in records and the keys in one data folder.
Nothing else is installed system-wide. This guide sets it up as a Windows service that
starts with the machine and is reachable from anywhere through Tailscale Funnel.

Total cost: none. Tailscale's personal plan, Google sign-in and WinSW are free.

## 1. What you need

- A Windows 10/11 machine that stays on (a spare laptop on mains power is fine).
- A Google account for sign-in, and a Tailscale account (sign up with Google or GitHub).
- About 20 minutes.

## 2. Install Node and Tailscale

Open PowerShell **as Administrator** and run:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Tailscale.Tailscale
```

Sign in to Tailscale from its tray icon. Then, in the Tailscale admin console
(https://login.tailscale.com/admin/dns), enable **HTTPS Certificates** and note your
tailnet name; your machine will be reachable as `https://<machine-name>.<tailnet>.ts.net`.
Rename the machine to `quill` in the admin console if you want a tidy address.

Under **Access controls**, make sure Funnel is allowed (the default policy includes a
`nodeAttrs` entry granting `funnel`; keep it or add your machine).

## 3. Create the Google sign-in client

1. Go to https://console.cloud.google.com, create a project (any name).
2. **APIs & Services → OAuth consent screen**: External, give it the name "Quill Cloud",
   your email as the contact, and save. Under **Audience → Test users** add your own Google
   address and every friend you want to let in. (While the app is "in testing" only test
   users can sign in; that is exactly what you want for a private server.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**: type
   **Web application**. Under *Authorised redirect URIs* add
   `https://<machine-name>.<tailnet>.ts.net/auth/google/callback`.
4. Copy the **Client ID** and **Client secret**.

Quill asks Google only for your name and email. It never sees your Google password and
never touches your Google Drive.

## 4. Install the server

Still in the elevated PowerShell:

```powershell
git clone https://github.com/harshramani00/quill.git
cd quill\server\deploy
.\deploy.ps1
```

This downloads the latest `quill-cloud-server.mjs` from GitHub releases into
`C:\quill-cloud`, creates `C:\quill-cloud\.env` from the template, downloads WinSW and
installs the **Quill Cloud** service. (Use `.\deploy.ps1 -FromSource` to build from the
checkout instead of downloading.)

Edit `C:\quill-cloud\.env`:

```
ISSUER=https://<machine-name>.<tailnet>.ts.net
PORT=8787
DATA_DIR=C:\quill-data
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
ALLOWED_EMAILS=you@gmail.com,friend@gmail.com
```

`ALLOWED_EMAILS` is the guest list. Leave it empty only if anyone with a Google account
should be able to create an account on your server.

Start the service:

```powershell
C:\quill-cloud\quill-cloud.exe start
```

Check `C:\quill-cloud\quill-cloud.out.log`; it should end with
`Quill Cloud listening on http://127.0.0.1:8787 (issuer https://…)`.

## 5. Expose it with Tailscale Funnel

```powershell
tailscale funnel --bg --https=443 http://127.0.0.1:8787
tailscale funnel status
```

Funnel terminates TLS with a real certificate and forwards to the local port, so nothing
is opened on your router and the server itself never faces the internet directly. Open
`https://<machine-name>.<tailnet>.ts.net/healthz` in a browser on your phone (off Wi-Fi) to
confirm; it should answer `{"ok":true,"name":"quill-cloud"}`.

## 6. Keep the machine awake

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

For a laptop, also set **Settings → System → Power → Lid close → Do nothing** (on power)
so it keeps running with the lid shut. Windows Update restarts are fine: the service and
Tailscale both start automatically.

## 7. Nightly backup

`backup.ps1` makes a consistent copy of the database and mirrors the document files to a
second drive (an external disk is ideal). Schedule it:

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\quill\server\deploy\backup.ps1 -Destination E:\quill-backup'
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName 'Quill Cloud backup' -Action $action -Trigger $trigger -RunLevel Highest
```

Everything the server owns is under `C:\quill-data`: `quill.sqlite` (accounts, document
list, versions, sign-ins), `users\<id>\<doc>\v<N>.docx` (the documents, immutable once
written) and `keys\jwt.jwk` (the token signing key; back it up, or every device has to
sign in again after a restore). To restore, stop the service, copy the folder back, start.

Optional off-site copy: point `restic` or `rclone` at the same backup folder and a free
10 GB tier such as Backblaze B2.

## 8. Connect Quill and Claude

- In Quill on your Mac: start screen → **Turn on Cloud…** → enter the server address →
  **Continue with Google**. Done.
- In Claude (phone, web or desktop): **Settings → Connectors → Add custom connector**,
  paste `https://<machine-name>.<tailnet>.ts.net/mcp`, and sign in with the same Google
  account when asked. The consent page shows exactly what Claude gets.

## Updating

```powershell
cd C:\quill\server\deploy
git pull
.\deploy.ps1
```

The database upgrades itself on start. Versions, keys and sign-ins are kept.

## Troubleshooting

- **"Not on the list"** on sign-in: the email is not in `ALLOWED_EMAILS`, or it was added to
  `.env` without restarting the service (`quill-cloud.exe restart`).
- **Google shows "Access blocked"**: the Google account is not in the consent screen's test
  users, or the redirect URI in the Google client does not match `ISSUER` exactly.
- **Quill says Offline**: `tailscale funnel status` should list the port. Funnel needs the
  HTTPS feature enabled for the tailnet and the machine's ACL attribute.
- **Logs**: `C:\quill-cloud\quill-cloud.out.log` and `.err.log`.
