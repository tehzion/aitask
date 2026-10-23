import NavigationGuard from '../components/NavigationGuard';
import NotFound from '../components/NotFound';
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useI18n } from '../components/I18nProvider';
import { useAppLifecycle } from './useAppLifecycle';
import { PrivateRoute, RoleRoute, RouteLoading } from './routeGuards';
import { hasUnsavedChanges } from '../lib/unsavedChanges';

const Layout = React.lazy(() => import('../components/Layout'));
const Dashboard = React.lazy(() => import('../pages/Dashboard'));
const Login = React.lazy(() => import('../pages/Login'));
const Calendar = React.lazy(() => import('../pages/Calendar'));
const DeliveryTracker = React.lazy(() => import('../pages/DeliveryTracker'));
const ClientWorkspace = React.lazy(() => import('../pages/ClientWorkspace'));
const Companies = React.lazy(() => import('../pages/Clients'));
const Reports = React.lazy(() => import('../pages/Reports'));
const Approvals = React.lazy(() => import('../pages/Approvals'));
const Settings = React.lazy(() => import('../pages/Settings'));
const AccountPassword = React.lazy(() => import('../pages/AccountPassword'));
const Feedback = React.lazy(() => import('../pages/Feedback'));
const FeedbackResults = React.lazy(() => import('../pages/FeedbackResults'));
const Notifications = React.lazy(() => import('../modules/notifications/pages/Notifications'));
const Tasks = React.lazy(() => import('../pages/Tasks'));
const Help = React.lazy(() => import('../pages/Help'));

function AppContent() {
  const { t } = useI18n();
  const { hasDrafts, isOnline, isUpdateReady } = useAppLifecycle();

  return (
    <>
      <NavigationGuard />
      <React.Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/account/password" element={<AccountPassword />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/feedback/results" element={<FeedbackResults />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />

          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<RoleRoute path="/"><Dashboard /></RoleRoute>} />
            <Route path="tasks" element={<RoleRoute path="/tasks"><Tasks /></RoleRoute>} />
            <Route path="calendar" element={<RoleRoute path="/calendar"><Calendar /></RoleRoute>} />
            <Route path="clients" element={<RoleRoute path="/clients"><DeliveryTracker /></RoleRoute>} />
            {/* ClientWorkspace performs client ownership and assigned-staff checks itself. */}
            <Route path="clients/:clientId" element={<ClientWorkspace />} />
            <Route path="projects" element={<RoleRoute path="/projects"><Companies /></RoleRoute>} />
            <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
            <Route path="approvals" element={<RoleRoute path="/approvals"><Approvals /></RoleRoute>} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
            <Route path="help" element={<Help />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </React.Suspense>

      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[70] mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-xl shadow-slate-950/20 md:bottom-auto md:left-auto md:right-5 md:top-20"
        >
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <p className="text-sm font-semibold">{t('shell.offlineTitle')}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-300">{t('shell.offlineDescription')}</p>
          </div>
        </div>
      )}

      {isUpdateReady && isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3 text-slate-900 shadow-xl shadow-slate-950/10 md:bottom-5 md:left-auto md:right-5"
        >
          <RefreshCw className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('App update available')}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{hasDrafts ? t('Save or discard your changes before updating.') : t('Refresh to use the latest AiTask fixes.')}</p>
          </div>
          <button
            type="button"
            disabled={hasDrafts}
            onClick={() => { if (!hasUnsavedChanges()) window.location.reload(); }}
            className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {t('Refresh now')}
          </button>
        </div>
      )}
    </>
  );
}

export default AppContent;
