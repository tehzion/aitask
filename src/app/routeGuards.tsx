import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useI18n } from '../components/I18nProvider';
import { canAccessPath } from '../lib/access';
import { hasPasswordResetBypass } from '../lib/auth';
import { msg } from '../lib/messages';
import { useStore } from '../store';

const AccessDenied = React.lazy(() => import('../components/AccessDenied'));

export const RouteLoading = () => {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm font-medium text-slate-500" role="status">
      {t('common.loading')}
    </div>
  );
};

export const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

export const RoleRoute: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => {
  const currentUser = useStore((state) => state.currentUser);
  const rolePermissions = useStore((state) => state.rolePermissions);
  const isRequiredAccountSetup = path === '/settings'
    && Boolean(currentUser?.mustResetPassword);

  if (canAccessPath(currentUser, path, rolePermissions) || isRequiredAccountSetup) return <>{children}</>;
  return (
    <AccessDenied
      message={path === '/approvals'
        ? msg('shell.approvalsRestricted')
        : undefined}
    />
  );
};
