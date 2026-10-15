import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useCloud } from '../../state/cloudStore'
import { Btn } from '../controls'
import { Icon } from '../icons'

type Step = 1 | 2 | 3

const DEFAULT_SERVER = (import.meta.env.VITE_QUILL_CLOUD_URL as string | undefined) ?? ''

/**
 * Turning Cloud on: three screens, one decision each. Sign in, pick the folder,
 * connect Claude. Nothing is uploaded or downloaded by finishing this flow.
 */
export function CloudSetupSheet({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }): ReactNode {
  const cloud = useCloud((u) => u.state)
  const [step, setStep] = useState<Step>(cloud.account ? 2 : 1)
  const [server, setServer] = useState(cloud.account?.serverUrl ?? DEFAULT_SERVER)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const signIn = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.quill.cloudSignIn(server)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    if (!cloud.connectorUrl) return
    await navigator.clipboard.writeText(cloud.connectorUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const dots = (on: Step): ReactNode => (
    <div className="q-dots" aria-label={`Step ${on} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n === on ? 'is-on' : undefined} />
      ))}
    </div>
  )

  return (
    <div className="q-setup-wrap">
      <div className="q-scrim" />
      <div className="q-setup" role="dialog" aria-labelledby="q-setup-title" style={{ position: 'relative' }}>
        {step === 1 ? (
          <>
            <div className="q-setup-body">
              <span className="q-setup-hero">
                <Icon name="cloud" />
              </span>
              <h1 id="q-setup-title">Your documents, everywhere</h1>
              <p className="lead">Keep a copy of the documents you choose on your own cloud. Open them on any Mac, and let Claude work on them while this one is asleep.</p>
              <div className="q-setup-points">
                <div className="q-point">
                  <Icon name="laptop" />
                  <div>
                    <b>This Mac comes first</b>
                    <span>Every file is saved here before it goes anywhere. Cloud is off for a document until you upload it.</span>
                  </div>
                </div>
                <div className="q-point">
                  <Icon name="lock" />
                  <div>
                    <b>Only you can see your documents</b>
                    <span>Each account is sealed off from every other. Nothing is shared unless you share it.</span>
                  </div>
                </div>
                <div className="q-point">
                  <Icon name="versions" />
                  <div>
                    <b>Every save is kept</b>
                    <span>The cloud remembers earlier versions, so nothing you or Claude writes can be lost.</span>
                  </div>
                </div>
              </div>
              <label style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', font: 'var(--q-type-caption-strong)', color: 'var(--q-text-secondary)' }}>
                Server address
                <input className="q-field" type="url" placeholder="https://quill.example.ts.net" value={server} onChange={(e) => setServer(e.target.value)} disabled={busy} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
              </label>
              {error ? <p style={{ margin: 0, font: 'var(--q-type-callout)', color: 'var(--q-destructive)' }}>{error}</p> : null}
              <Btn className="lg wide" disabled={busy || !server.trim()} onClick={() => void signIn()} style={{ marginTop: 4 }}>
                <span className="q-google" aria-hidden="true">
                  G
                </span>
                {busy ? 'Waiting for your browser…' : 'Continue with Google'}
              </Btn>
            </div>
            <div className="q-setup-foot">
              {dots(1)}
              <Btn className="plain" disabled={busy} onClick={onCancel}>
                Not now
              </Btn>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="q-setup-body">
              <span className="q-setup-hero">
                <Icon name="open" />
              </span>
              <h1 id="q-setup-title">Where should synced files live?</h1>
              <p className="lead">Documents you download from the cloud are saved in this folder, and documents you upload come from it. Everything outside it stays on this Mac only.</p>
              <div className="q-setgroup" style={{ width: '100%', margin: '12px 0 4px', textAlign: 'left' }}>
                <div className="q-setrow">
                  <Icon name="open" style={{ width: 22, height: 22, color: 'var(--q-accent-text)' }} />
                  <div className="q-setrow-main">
                    <span className="lbl">{cloud.account?.folder.split('/').pop() ?? 'Quill'}</span>
                    <span className="sub">{cloud.account?.folder.replace(/^\/Users\/[^/]+/, '~') ?? '~/Documents/Quill'}</span>
                  </div>
                  <Btn onClick={() => void window.quill.cloudChooseFolder()}>Change…</Btn>
                </div>
              </div>
              <p className="lead" style={{ fontSize: 12, lineHeight: '17px' }}>
                You can move this folder later from Cloud settings. Documents already on the cloud appear under Cloud on the start screen and are downloaded only when you open them.
              </p>
              <Btn primary className="lg wide" onClick={() => setStep(3)} style={{ marginTop: 4 }}>
                Continue
              </Btn>
            </div>
            <div className="q-setup-foot">
              {dots(2)}
              <Btn className="plain" onClick={() => setStep(1)}>
                Back
              </Btn>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="q-setup-body">
              <span className="q-setup-hero">
                <Icon name="sparkle" />
              </span>
              <h1 id="q-setup-title">Let Claude work on your documents</h1>
              <p className="lead">Add Quill as a connector in Claude. Claude can then read, create and edit your cloud documents from your phone or the web, even when this Mac is off.</p>
              <div className="q-setgroup" style={{ width: '100%', margin: '12px 0 4px', textAlign: 'left' }}>
                <div className="q-setrow">
                  <span className="q-avatar" style={{ background: 'var(--q-fill-on)', color: 'var(--q-text-primary)', fontSize: 12 }}>
                    1
                  </span>
                  <div className="q-setrow-main">
                    <span className="lbl">Copy your connector address</span>
                    <span className="sub">Paste it into Claude › Settings › Connectors › Add custom connector.</span>
                  </div>
                </div>
                <div className="q-setrow" style={{ paddingTop: 0, minHeight: 0, borderTop: 0 }}>
                  <span style={{ width: 28, flex: 'none' }} />
                  <span className="q-pathbox" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cloud.connectorUrl ?? '—'}
                  </span>
                  <Btn onClick={() => void copy()}>
                    <Icon name="copy" />
                    {copied ? 'Copied' : 'Copy'}
                  </Btn>
                </div>
                <div className="q-setrow">
                  <span className="q-avatar" style={{ background: 'var(--q-fill-on)', color: 'var(--q-text-primary)', fontSize: 12 }}>
                    2
                  </span>
                  <div className="q-setrow-main">
                    <span className="lbl">Sign in when Claude asks</span>
                    <span className="sub">Same Google account. You approve exactly what Claude may do.</span>
                  </div>
                </div>
                <div className="q-setrow">
                  <span className="q-avatar" style={{ background: 'var(--q-fill-on)', color: 'var(--q-text-primary)', fontSize: 12 }}>
                    3
                  </span>
                  <div className="q-setrow-main">
                    <span className="lbl">Ask Claude anything about your documents</span>
                    <span className="sub">“Summarise my lease letter”, “Draft meeting notes and save them to Quill”.</span>
                  </div>
                </div>
              </div>
              <p className="lead" style={{ fontSize: 12, lineHeight: '17px' }}>
                Disconnect Claude at any time from Cloud settings. It never sees documents that are only on this Mac.
              </p>
              <Btn primary className="lg wide" onClick={onDone} style={{ marginTop: 4 }}>
                Done
              </Btn>
            </div>
            <div className="q-setup-foot">
              {dots(3)}
              <Btn className="plain" onClick={onDone}>
                Set up Claude later
              </Btn>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
