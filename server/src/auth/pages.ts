/**
 * The few HTML pages the server renders: the consent page an OAuth client (Claude)
 * sends the user to, the "return to Quill" page after a desktop sign-in, the dev
 * login form, and errors. Styled with the Quill design tokens so they match the app.
 */

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const STYLE = `
  :root { color-scheme: light dark; --bg: #E6E6E9; --card: #FFFFFF; --chrome: #F3F3F4; --text: #1D1D1F; --text2: #5F5F64; --text3: #9A9A9F; --sep: rgba(0,0,0,0.10); --accent: #1F5FD6; --accent-tint: rgba(31,95,214,0.12); --ok: #2DAA5A; --radius: 16px; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151517; --card: #2E2E32; --chrome: #29292C; --text: #F2F2F4; --text2: #A3A3A8; --text3: #6B6B70; --sep: rgba(255,255,255,0.09); --accent: #2B6BE6; --accent-tint: rgba(70,130,255,0.20); } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg); color: var(--text); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; }
  .card { width: 100%; max-width: 460px; background: var(--card); border-radius: var(--radius); box-shadow: 0 0 0 0.5px var(--sep), 0 12px 40px rgba(0,0,0,0.18); overflow: hidden; }
  .body { padding: 36px 36px 28px; display: flex; flex-direction: column; gap: 18px; }
  .foot { padding: 14px 36px; border-top: 1px solid var(--sep); background: var(--chrome); font-size: 11px; line-height: 16px; color: var(--text2); }
  h1 { margin: 0; font-size: 22px; line-height: 28px; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--text2); }
  .who { display: flex; align-items: center; gap: 14px; }
  .mark { width: 48px; height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-tint); color: var(--accent); font-weight: 700; font-size: 18px; }
  .mark.app { background: var(--accent); color: #fff; }
  .arrow { color: var(--text3); }
  .list { border-radius: 10px; box-shadow: inset 0 0 0 0.5px var(--sep); overflow: hidden; }
  .row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 14px; min-height: 44px; }
  .row + .row { border-top: 1px solid var(--sep); }
  .row .ico { width: 18px; flex: none; text-align: center; margin-top: 1px; }
  .row .ico.ok { color: var(--ok); } .row .ico.no { color: var(--text3); }
  .row .lbl { font-weight: 500; } .row .sub { display: block; font-size: 12px; color: var(--text2); }
  .row.muted .lbl { color: var(--text3); }
  .actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 4px; }
  button, .btn { appearance: none; border: 0; height: 40px; padding: 0 22px; border-radius: 10px; font: 600 14px/1 inherit; color: var(--text); background: var(--card); box-shadow: inset 0 0 0 0.5px var(--sep), 0 0.5px 1px rgba(0,0,0,0.1); cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; box-shadow: none; }
  input { height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--sep); background: var(--card); color: var(--text); font: inherit; width: 100%; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text2); }
  .ok-big { width: 56px; height: 56px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; background: var(--accent-tint); color: var(--ok); font-size: 28px; }
`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main class="card">${body}</main></body></html>`
}

export function consentPage(input: { clientName: string; userName: string; userEmail: string; scopes: string[]; state: string; decisionPath: string; switchAccountUrl: string }): string {
  const canWrite = input.scopes.includes('documents:write')
  const rows = [
    { ok: true, lbl: 'See the names of your cloud documents' },
    { ok: true, lbl: 'Read their contents' },
    canWrite ? { ok: true, lbl: 'Create documents and edit existing ones', sub: 'Every edit is saved as a new version. Nothing is overwritten.' } : { ok: false, lbl: 'Create or edit documents', sub: 'Not requested' },
    { ok: false, lbl: 'Delete documents', sub: 'Not requested' },
    { ok: false, lbl: 'Documents that are only on your Mac', sub: 'Never reachable from here' }
  ]
  return page(
    `${input.clientName} wants access to Quill`,
    `<div class="body">
      <div class="who"><span class="mark">Q</span><span class="arrow">→</span><span class="mark app">${escapeHtml(input.clientName.slice(0, 1).toUpperCase())}</span></div>
      <div><h1>${escapeHtml(input.clientName)} wants to use your Quill documents</h1>
      <p style="margin-top:8px">Signed in as <b style="color:var(--text)">${escapeHtml(input.userName)}</b> · ${escapeHtml(input.userEmail)} · <a href="${escapeHtml(input.switchAccountUrl)}" style="color:var(--accent);text-decoration:none">Not you?</a></p></div>
      <div class="list">${rows
        .map(
          (r) => `<div class="row${r.ok ? '' : ' muted'}"><span class="ico ${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✕'}</span><div><span class="lbl">${escapeHtml(r.lbl)}</span>${r.sub ? `<span class="sub">${escapeHtml(r.sub)}</span>` : ''}</div></div>`
        )
        .join('')}</div>
      <form method="post" action="${escapeHtml(input.decisionPath)}" class="actions">
        <input type="hidden" name="state" value="${escapeHtml(input.state)}">
        <button type="submit" name="decision" value="deny">Cancel</button>
        <button type="submit" name="decision" value="allow" class="primary" autofocus>Allow</button>
      </form>
    </div>
    <div class="foot">You can disconnect ${escapeHtml(input.clientName)} at any time from Quill › Cloud settings. This server is run by its owner; your documents never go anywhere else.</div>`
  )
}

export function desktopDonePage(): string {
  return page(
    'Signed in to Quill',
    `<div class="body" style="align-items:center;text-align:center">
      <span class="ok-big">✓</span>
      <h1>You're signed in</h1>
      <p>You can close this tab and return to Quill.</p>
    </div>`
  )
}

export function devLoginPage(input: { state: string; nonce: string; action: string }): string {
  return page(
    'Quill Cloud — local sign-in',
    `<div class="body">
      <div><h1>Local sign-in</h1><p style="margin-top:8px">This server runs with QUILL_DEV_LOGIN. Enter any name and email to act as that account. Google replaces this form in production.</p></div>
      <form method="post" action="${escapeHtml(input.action)}" style="display:flex;flex-direction:column;gap:14px">
        <input type="hidden" name="state" value="${escapeHtml(input.state)}">
        <input type="hidden" name="nonce" value="${escapeHtml(input.nonce)}">
        <label>Name<input name="name" required autocomplete="name" value="Local User"></label>
        <label>Email<input name="email" type="email" required autocomplete="email" value="local@example.com"></label>
        <div class="actions"><button type="submit" class="primary">Continue</button></div>
      </form>
    </div>`
  )
}

export function errorPage(title: string, detail: string): string {
  return page(title, `<div class="body"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></div>`)
}
