/** IPC channel names. Renderer → main are invoke/handle; main → renderer are send/on. */
export const IPC = {
  // renderer → main
  themeGet: 'theme:get',
  fileOpenDialog: 'file:open-dialog',
  fileOpenPath: 'file:open-path',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileExportPdf: 'file:export-pdf',
  filePickImage: 'file:pick-image',
  fileReveal: 'file:reveal',
  recentList: 'recent:list',
  recentRemove: 'recent:remove',
  windowDocumentState: 'window:document-state',
  windowCloseConfirmed: 'window:close-confirmed',
  windowCloseCanceled: 'window:close-canceled',
  // main → renderer
  themeChanged: 'theme:changed',
  menuAction: 'menu:action',
  openDocument: 'app:open-document',
  confirmClose: 'app:confirm-close'
} as const
