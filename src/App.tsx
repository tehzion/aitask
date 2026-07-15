import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { startBackendAutoSync, useStore } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
import AccessDenied from './components/AccessDenied';
import { canAccessPath } from './lib/access';
import { hasPasswordResetBypass } from './lib/auth';
import { WifiOff } from 'lucide-react';
import { shouldUseSecureSupabase, supabase } from './lib/supabaseClient';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Calendar = React.lazy(() => import('./pages/Calendar'));
const Clients = React.lazy(() => import('./pages/Clients'));
const Projects = React.lazy(() => import('./pages/Projects'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Approvals = React.lazy(() => import('./pages/Approvals'));
const Settings = React.lazy(() => import('./pages/Settings'));

const RouteLoading = () => (
  <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm font-medium text-slate-500" role="status">
    Loading AiTask...
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useStore((state) => state.currentUser);
  const backend = useStore((state) => state.backend);
  const location = useLocation();
  if (backend.isLoading) return <RouteLoading />;
  if (!currentUser) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }
  if (currentUser.mustResetPassword && !hasPasswordResetBypass(currentUser.id) && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }
  return <>{children}</>;
};

const RoleRoute: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => {
  const currentUser = useStore((state) => state.currentUser);
  const rolePermissions = useStore((state) => state.rolePermissions);
  return canAccessPath(currentUser, path, rolePermissions) ? <>{children}</> : <AccessDenied />;
};

function App() {
  const [isOnline, setIsOnline] = React.useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const initializeBackend = useStore(state => state.initializeBackend);
  const forceSyncMockData = useStore(state => state._forceSyncMockData);
  const sendDueDateReminders = useStore(state => state.sendDueDateReminders);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!shouldUseSecureSupabase()) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useStore.setState({ currentUser: null });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      await initializeBackend();
      if (!isMounted) return;
      startBackendAutoSync();
      forceSyncMockData();
      let store = useStore.getState();
      if (!shouldUseSecureSupabase() || (store.currentUser && store.currentUser.role !== 'Client')) {
        sendDueDateReminders();
        store = useStore.getState();
      }
      if (store.backend.hasLocalChanges && !store.backend.hasRemoteUpdate) {
        await store.commitPendingMutation();
      }
    };

    void boot();

    return () => {
      isMounted = false;
    };
  }, [forceSyncMockData, initializeBackend, sendDueDateReminders]);

  return (
    <>
      <BrowserRouter>
        <React.Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />

            <Route path="/" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="tasks" element={<RoleRoute path="/tasks"><Tasks /></RoleRoute>} />
              <Route path="calendar" element={<RoleRoute path="/calendar"><Calendar /></RoleRoute>} />
              <Route path="clients" element={<RoleRoute path="/clients"><Clients /></RoleRoute>} />
              <Route path="projects" element={<RoleRoute path="/projects"><Projects /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
              <Route path="approvals" element={<RoleRoute path="/approvals"><Approvals /></RoleRoute>} />
              <Route path="settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>

      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-4 right-4 z-[70] mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-xl shadow-slate-950/20 md:bottom-auto md:left-auto md:right-5 md:top-20"
        >
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div>
            <p className="text-sm font-semibold">You are offline</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-300">
              The cached app shell is available. Live workspace sync will resume when you are back online.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
