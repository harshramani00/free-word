/** Page geometry shared by the renderer (CSS px at 100% zoom) and the docx builder (twips). */

export type PaperSize = 'letter' | 'a4'
export type MarginPreset = 'normal' | 'narrow' | 'wide'

export interface PageSetup {
  paper: PaperSize
  margins: MarginPreset
}

export const DEFAULT_PAGE_SETUP: PageSetup = { paper: 'letter', margins: 'normal' }

/** 96 CSS px per inch; 1440 twips per inch; 72 pt per inch. */
export const PX_PER_IN = 96
export const TWIPS_PER_IN = 1440
export const PT_PER_IN = 72

export interface PaperDims {
  label: string
  hint: string
  widthIn: number
  heightIn: number
}

export const PAPER: Record<PaperSize, PaperDims> = {
  letter: { label: 'US Letter', hint: '8.5 × 11 in', widthIn: 8.5, heightIn: 11 },
  a4: { label: 'A4', hint: '210 × 297 mm', widthIn: 210 / 25.4, heightIn: 297 / 25.4 }
}

export interface MarginDims {
  label: string
  hint: string
  topIn: number
  bottomIn: number
  leftIn: number
  rightIn: number
}

export const MARGINS: Record<MarginPreset, MarginDims> = {
  normal: { label: 'Normal', hint: '1 in on all sides', topIn: 1, bottomIn: 1, leftIn: 1, rightIn: 1 },
  narrow: { label: 'Narrow', hint: '0.5 in on all sides', topIn: 0.5, bottomIn: 0.5, leftIn: 0.5, rightIn: 0.5 },
  wide: { label: 'Wide', hint: '1 in top/bottom, 2 in sides', topIn: 1, bottomIn: 1, leftIn: 2, rightIn: 2 }
}

export const inToPx = (inches: number): number => Math.round(inches * PX_PER_IN)
export const inToTwips = (inches: number): number => Math.round(inches * TWIPS_PER_IN)
export const twipsToIn = (twips: number): number => twips / TWIPS_PER_IN
export const ptToPx = (pt: number): number => (pt * PX_PER_IN) / PT_PER_IN
export const pxToPt = (px: number): number => (px * PT_PER_IN) / PX_PER_IN

/** Page metrics in CSS px at 100% zoom. */
export interface PageMetricsPx {
  width: number
  height: number
  top: number
  bottom: number
  left: number
  right: number
  /** Width of the text column (page width minus side margins). */
  textWidth: number
  /** Height of the text column. */
  textHeight: number
}

export function pageMetricsPx(setup: PageSetup): PageMetricsPx {
  const p = PAPER[setup.paper]
  const m = MARGINS[setup.margins]
  const width = inToPx(p.widthIn)
  const height = inToPx(p.heightIn)
  const top = inToPx(m.topIn)
  const bottom = inToPx(m.bottomIn)
  const left = inToPx(m.leftIn)
  const right = inToPx(m.rightIn)
  return { width, height, top, bottom, left, right, textWidth: width - left - right, textHeight: height - top - bottom }
}

/** Pick the closest preset for a page read from a .docx (twips). */
export function pageSetupFromTwips(w: number, h: number, mt: number, mb: number, ml: number, mr: number): PageSetup {
  const paper: PaperSize = Math.abs(w - inToTwips(PAPER.a4.widthIn)) < Math.abs(w - inToTwips(PAPER.letter.widthIn)) ? 'a4' : 'letter'
  void h
  let best: MarginPreset = 'normal'
  let bestScore = Number.POSITIVE_INFINITY
  for (const key of Object.keys(MARGINS) as MarginPreset[]) {
    const m = MARGINS[key]
    const score =
      Math.abs(mt - inToTwips(m.topIn)) +
      Math.abs(mb - inToTwips(m.bottomIn)) +
      Math.abs(ml - inToTwips(m.leftIn)) +
      Math.abs(mr - inToTwips(m.rightIn))
    if (score < bestScore) {
      bestScore = score
      best = key
    }
  }
  return { paper, margins: best }
}
