import React from 'react';
import { createRoot } from 'react-dom/client';
import BackendFreshness from '../../src/app/shell/BackendFreshness';
import ErrorBoundary from '../../src/app/shell/ErrorBoundary';
import { I18nProvider } from '../../src/shared/components/I18nProvider';

export const mountMessageProbe = (kind: 'conflict' | 'crash') => {
  const host = document.createElement('div');
  host.id = 'message-probe';
  document.body.append(host);
  const Broken = () => { throw new Error('Cannot read properties of undefined (reading "privateToken")'); };
  createRoot(host).render(
    <I18nProvider>
      {kind === 'conflict' ? <BackendFreshness /> : <ErrorBoundary><Broken /></ErrorBoundary>}
    </I18nProvider>,
  );
};
