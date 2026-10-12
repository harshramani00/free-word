import type { ReactNode } from 'react'
import { PX_PER_IN } from '../../../shared/pageSetup'
import type { PageMetricsPx } from '../../../shared/pageSetup'

/** Horizontal ruler above the canvas, aligned to the page and scaled with the zoom. */
export function Ruler({ metrics, zoom }: { metrics: PageMetricsPx; zoom: number }): ReactNode {
  const inches = Math.floor(metrics.width / PX_PER_IN)
  const nums: ReactNode[] = []
  for (let i = 1; i < inches; i++) {
    const x = metrics.left + i * PX_PER_IN
    if (x >= metrics.width - metrics.right) break
    nums.push(
      <span key={i} className="q-ruler-num" style={{ left: x }}>
        {i}
      </span>
    )
  }
  return (
    <div className="q-ruler" aria-hidden="true">
      <div className="q-ruler-page" style={{ width: metrics.width, zoom: zoom / 100 }}>
        <span className="q-ruler-margin" style={{ left: 0, width: metrics.left }} />
        <span className="q-ruler-margin" style={{ right: 0, width: metrics.right }} />
        <span className="q-ruler-ticks" style={{ left: metrics.left, right: metrics.right }} />
        {nums}
        <span className="q-ruler-marker" style={{ left: metrics.left, top: 0 }} />
        <span className="q-ruler-marker up" style={{ left: metrics.left, bottom: 0 }} />
        <span className="q-ruler-marker up" style={{ left: metrics.width - metrics.right, bottom: 0 }} />
      </div>
    </div>
  )
}
