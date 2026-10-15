import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/400-italic.css'
import '@fontsource/source-serif-4/600.css'
import '@fontsource/source-serif-4/700.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/cloud.css'
import './styles/editor.css'
import './styles/print.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installDevShim } from './devShim'

installDevShim()
if (import.meta.env.DEV) {
  const errors: string[] = ((window as unknown as { __quillErrors?: string[] }).__quillErrors = [])
  window.addEventListener('error', (e) => errors.push(String(e.error?.stack ?? e.message)))
  window.addEventListener('unhandledrejection', (e) => errors.push(String((e.reason as Error)?.stack ?? e.reason)))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
