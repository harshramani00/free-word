import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Document as XmlDocument, Element as XmlElement } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { DEFAULT_PAGE_SETUP, pageSetupFromTwips } from '../../shared/pageSetup'
import type { PageSetup } from '../../shared/types'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
/** English Metric Units per CSS pixel at 96 dpi. */
const EMU_PER_PX = 9525

export interface PrepassResult {
  /** The .docx with synthetic run styles injected for colour and shading. */
  buffer: Buffer
  pageSetup: PageSetup
  /** Synthetic run style ids that were injected (qr-c<HEX>, qr-h<HEX>, qr-c<HEX>-h<HEX>). */
  runStyleIds: string[]
}

function firstChild(el: XmlElement, local: string): XmlElement | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1 && (n as XmlElement).localName === local && (n as XmlElement).namespaceURI === W_NS) return n as XmlElement
  }
  return null
}

function wAttr(el: XmlElement | null, name: string): string | null {
  if (!el) return null
  return el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`)
}

function hex6(value: string | null): string | null {
  if (!value) return null
  const m = /^[0-9a-f]{6}$/i.exec(value.trim())
  return m ? value.trim().toUpperCase() : null
}

/** Build the synthetic run style id carrying a run's colour and/or shading. */
export function runStyleId(color: string | null, shading: string | null): string | null {
  if (!color && !shading) return null
  const parts = ['qr']
  if (color) parts.push(`c${color}`)
  if (shading) parts.push(`h${shading}`)
  return parts.join('-')
}

/** Parse a synthetic run style id back into its parts. */
export function parseRunStyleId(id: string): { color: string | null; shading: string | null } | null {
  if (!id.startsWith('qr-')) return null
  let color: string | null = null
  let shading: string | null = null
  for (const part of id.slice(3).split('-')) {
    if (part.startsWith('c')) color = part.slice(1)
    else if (part.startsWith('h')) shading = part.slice(1)
  }
  return { color, shading }
}

function readPageSetup(doc: XmlDocument): PageSetup {
  const sectPrs = doc.getElementsByTagNameNS(W_NS, 'sectPr')
  const sectPr = sectPrs.item(sectPrs.length - 1)
  if (!sectPr) return DEFAULT_PAGE_SETUP
  const pgSz = firstChild(sectPr, 'pgSz')
  const pgMar = firstChild(sectPr, 'pgMar')
  const num = (v: string | null, fallback: number): number => {
    const n = v ? parseInt(v, 10) : NaN
    return Number.isFinite(n) ? n : fallback
  }
  if (!pgSz && !pgMar) return DEFAULT_PAGE_SETUP
  return pageSetupFromTwips(
    num(wAttr(pgSz, 'w'), 12240),
    num(wAttr(pgSz, 'h'), 15840),
    num(wAttr(pgMar, 'top'), 1440),
    num(wAttr(pgMar, 'bottom'), 1440),
    num(wAttr(pgMar, 'left'), 1440),
    num(wAttr(pgMar, 'right'), 1440)
  )
}

/**
 * mammoth's document model has no notion of text colour or run shading, so before handing the
 * file to mammoth we tag every coloured/shaded run with a synthetic character style id that the
 * generated style map turns into a class. We also read the page size and margins while we are here.
 */
export async function prepassDocx(input: Buffer): Promise<PrepassResult> {
  const zip = await JSZip.loadAsync(input)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('Not a Word document: word/document.xml is missing')
  const xml = await file.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml') as XmlDocument

  const pageSetup = readPageSetup(doc)
  const ids = new Set<string>()

  const rPrs = doc.getElementsByTagNameNS(W_NS, 'rPr')
  for (let i = 0; i < rPrs.length; i++) {
    const rPr = rPrs.item(i)
    if (!rPr || !rPr.parentNode || (rPr.parentNode as XmlElement).localName !== 'r') continue
    const color = hex6(wAttr(firstChild(rPr, 'color'), 'val'))
    const shd = firstChild(rPr, 'shd')
    const shading = hex6(wAttr(shd, 'fill'))
    const id = runStyleId(color, shading)
    if (!id) continue
    let rStyle = firstChild(rPr, 'rStyle')
    if (!rStyle) {
      rStyle = doc.createElementNS(W_NS, 'w:rStyle')
      rPr.insertBefore(rStyle, rPr.firstChild)
    }
    rStyle.setAttributeNS(W_NS, 'w:val', id)
    ids.add(id)
  }

  // Pictures: mammoth exposes only alt text, so smuggle the rendered size through it ("qimg:WxH|alt").
  let imagesTagged = 0
  const extents = doc.getElementsByTagNameNS(WP_NS, 'extent')
  for (let i = 0; i < extents.length; i++) {
    const extent = extents.item(i)
    const holder = extent?.parentNode as XmlElement | null // wp:inline or wp:anchor
    if (!extent || !holder || holder.namespaceURI !== WP_NS) continue
    const cx = parseInt(extent.getAttribute('cx') ?? '0', 10)
    const cy = parseInt(extent.getAttribute('cy') ?? '0', 10)
    if (!(cx > 0 && cy > 0)) continue
    let docPr: XmlElement | null = null
    for (let j = 0; j < holder.childNodes.length; j++) {
      const n = holder.childNodes[j] as XmlElement
      if (n.nodeType === 1 && n.localName === 'docPr') {
        docPr = n
        break
      }
    }
    if (!docPr) continue
    const existing = docPr.getAttribute('descr') ?? ''
    if (existing.startsWith('qimg:')) continue
    docPr.setAttribute('descr', `qimg:${Math.round(cx / EMU_PER_PX)}x${Math.round(cy / EMU_PER_PX)}|${existing}`)
    imagesTagged++
  }

  if (ids.size === 0 && imagesTagged === 0) return { buffer: input, pageSetup, runStyleIds: [] }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc))
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { buffer, pageSetup, runStyleIds: [...ids] }
}
