import type { QuillApi } from '../shared/types'

declare global {
  interface Window {
    quill: QuillApi
  }
}

export {}
