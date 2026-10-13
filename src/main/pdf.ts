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
  // Chromium paints the window's base background under the page margins, which would print
  // dark in dark mode. Print on white and restore the window colour afterwards.
  const previousBackground = win.getBackgroundColor()
  win.setBackgroundColor('#FFFFFF')
  try {
    const data = await win.webContents.printToPDF({
      pageSize: req.pageSetup.paper === 'a4' ? 'A4' : 'Letter',
      margins: { top: m.topIn, bottom: m.bottomIn, left: m.leftIn, right: m.rightIn },
      printBackground: true,
      // The renderer writes an @page rule with the same size and margins; prefer it.
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      landscape: false,
      scale: 1
    })
    await fs.writeFile(filePath, data)
    return { ok: true, path: filePath, name: basename(filePath, '.pdf') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.setBackgroundColor(previousBackground)
  }
}
