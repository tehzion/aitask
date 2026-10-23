import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { useI18n } from './components/I18nProvider';

// Keep the authenticated runtime (store, Supabase client, and workspace
// components) out of the entry graph. The runtime is still loaded immediately
// for the application shell, but public entry points can paint the loading
// state without parsing the full workspace store first.
const AppContent = React.lazy(() => import('./app/AppContent'));

const AppLoading = () => {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm font-medium text-slate-500" role="status">
      {t('common.loading')}
    </div>
  );
};

const router = createBrowserRouter([{ path: '*', element: <AppContent /> }]);

function App() {
  return (
    <React.Suspense fallback={<AppLoading />}>
      <RouterProvider router={router} />
    </React.Suspense>
  );
}

export default App;
