import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { I18nProvider } from './components/I18nProvider'
import { registerPwaUpdates } from './lib/pwaUpdates'
import { initializeTheme } from './lib/theme'
import './index.css'

initializeTheme()
registerPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
