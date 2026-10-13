import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import { MARGINS } from '../shared/pageSetup'
import type { ExportPdfRequest, SaveResult } from '../shared/types'

/**
 * Renders the editor window with print media CSS (which hides all app chrome)
 * to a PDF at the chosen paper size and margins.
 */
export async function exportPdf(win: BrowserWindow, req: ExportPdfRequest): Promise<SaveResult> {
  let filePath = req.path
  if (!filePath) {
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export as PDF',
      defaultPath: join(app.getPath('documents'), `${req.suggestedName || 'Untitled'}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true }
    filePath = picked.filePath
  }

  const m = MARGINS[req.pageSetup.margins]
  try {
    const data = await win.webContents.printToPDF({
      pageSize: req.pageSetup.paper === 'a4' ? 'A4' : 'Letter',
      margins: { top: m.topIn, bottom: m.bottomIn, left: m.leftIn, right: m.rightIn },
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      landscape: false,
      scale: 1
    })
    await fs.writeFile(filePath, data)
    return { ok: true, path: filePath, name: basename(filePath, '.pdf') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
