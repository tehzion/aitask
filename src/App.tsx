import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { startBackendAutoSync, useStore } from './store';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Approvals from './pages/Approvals';
import Settings from './pages/Settings';
import AccessDenied from './components/AccessDenied';
import { canAccessPath } from './lib/access';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useStore((state) => state.currentUser);
  const location = useLocation();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.mustResetPassword && location.pathname !== '/settings') {
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
  const initializeBackend = useStore(state => state.initializeBackend);
  const syncBackendNow = useStore(state => state.syncBackendNow);
  const forceSyncMockData = useStore(state => state._forceSyncMockData);
  const sendDueDateReminders = useStore(state => state.sendDueDateReminders);

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      await initializeBackend();
      if (!isMounted) return;
      forceSyncMockData();
      sendDueDateReminders();
      startBackendAutoSync();
      await syncBackendNow();
    };

    void boot();

    return () => {
      isMounted = false;
    };
  }, [forceSyncMockData, initializeBackend, sendDueDateReminders, syncBackendNow]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<RoleRoute path="/tasks"><Tasks /></RoleRoute>} />
          <Route path="calendar" element={<RoleRoute path="/calendar"><Calendar /></RoleRoute>} />
          <Route path="projects" element={<RoleRoute path="/projects"><Projects /></RoleRoute>} />
          <Route path="reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
          <Route path="approvals" element={<RoleRoute path="/approvals"><Approvals /></RoleRoute>} />
          <Route path="settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
