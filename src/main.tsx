import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { registerChunkRecovery } from './app/lifecycle/chunkRecovery'
import { registerPwaUpdates } from './app/lifecycle/pwaUpdates'
import { initializeTheme } from './app/lifecycle/theme'
import './index.css'
import { registerPerformanceDiagnostics } from './infrastructure/observability/diagnostics'
import ErrorBoundary from './app/shell/ErrorBoundary'
import { I18nProvider } from './shared/components/I18nProvider'

registerPerformanceDiagnostics()
initializeTheme()
registerChunkRecovery()
registerPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
