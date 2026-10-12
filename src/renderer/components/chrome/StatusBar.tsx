import type { ReactNode } from 'react'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom } from '../../state/documentStore'
import { TBtn, VSep } from '../controls'

export function StatusBar({ page, pages, words, characters, zoom, notice, onZoom }: { page: number; pages: number; words: number; characters: number; zoom: number; notice: string | null; onZoom: (z: number) => void }): ReactNode {
  const fill = ((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100
  return (
    <div className="q-status">
      <span>
        Page {page} of {pages}
      </span>
      <span>{words.toLocaleString()} words</span>
      <span>{characters.toLocaleString()} characters</span>
      <span>English (US)</span>
      {notice ? <span className="q-notice">{notice}</span> : null}
      <span className="q-fill" />
      <TBtn label="Focus" text="Focus" small disabled style={{ padding: '0 6px', font: 'var(--q-type-caption)' }} />
      <div style={{ display: 'flex', gap: 2 }}>
        <TBtn label="Print layout" icon="print-layout" small on />
        <TBtn label="Web layout" icon="web-layout" small disabled />
        <TBtn label="Read mode" icon="read-mode" small disabled />
      </div>
      <VSep style={{ margin: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <TBtn label="Zoom out" icon="zoom-out" small disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))} />
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <span className="q-sr">Zoom</span>
          <input className="q-zoom" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={1} value={zoom} style={{ ['--fill' as string]: `${fill}%` }} onChange={(e) => onZoom(clampZoom(Number(e.target.value)))} onDoubleClick={() => onZoom(100)} />
        </label>
        <TBtn label="Zoom in" icon="zoom-in" small disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))} />
        <span style={{ width: 36, textAlign: 'right' }}>{zoom}%</span>
      </div>
    </div>
  )
}
