import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { MARGINS, PAPER } from '../../../shared/pageSetup'
import type { MarginPreset, PageSetup, PaperSize } from '../../../shared/pageSetup'
import type { ExportFormat } from '../../../shared/types'
import { Btn, Seg } from '../controls'

export interface ExportChoice {
  format: ExportFormat
  pageSetup: PageSetup
  fileName: string
}

export function ExportSheet({ name, pageSetup, onCancel, onExport }: { name: string; pageSetup: PageSetup; onCancel: () => void; onExport: (choice: ExportChoice) => void }): ReactNode {
  const [format, setFormat] = useState<ExportFormat>('docx')
  const [paper, setPaper] = useState<PaperSize>(pageSetup.paper)
  const [margins, setMargins] = useState<MarginPreset>(pageSetup.margins)
  const [fileName, setFileName] = useState(name)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  const submit = (): void => onExport({ format, pageSetup: { paper, margins }, fileName: fileName.trim() || 'Untitled' })
  return (
    <>
      <div className="q-scrim" style={{ top: 'var(--q-titlebar-h)' }} onClick={onCancel} />
      <section className="q-sheet" role="dialog" aria-label="Export" style={{ top: 'var(--q-titlebar-h)', width: 520, padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <h2 style={{ font: 'var(--q-type-title)', fontSize: 15 }}>Export “{name}”</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: 14, rowGap: 16, alignItems: 'center' }}>
          <span className="q-form-label">Format:</span>
          <Seg<ExportFormat>
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'docx', label: 'Word (.docx)' },
              { value: 'pdf', label: 'PDF' }
            ]}
          />
          <span className="q-form-label">Page size:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Seg<PaperSize> label="Page size" value={paper} onChange={setPaper} options={(Object.keys(PAPER) as PaperSize[]).map((p) => ({ value: p, label: PAPER[p].label }))} />
            <span className="q-hint">{PAPER[paper].hint}</span>
          </div>
          <span className="q-form-label">Margins:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Seg<MarginPreset> label="Margins" value={margins} onChange={setMargins} options={(Object.keys(MARGINS) as MarginPreset[]).map((m) => ({ value: m, label: MARGINS[m].label }))} />
            <span className="q-hint">{MARGINS[margins].hint}</span>
          </div>
          <label className="q-form-label" htmlFor="q-export-name">
            File name:
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="q-export-name"
              className="q-field"
              type="text"
              value={fileName}
              autoFocus
              style={{ width: 280 }}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
            <span className="q-hint">.{format}</span>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--q-separator)', margin: '0 -24px' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn primary onClick={submit}>
            Export
          </Btn>
        </div>
      </section>
    </>
  )
}
