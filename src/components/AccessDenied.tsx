import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useStore } from '../store';
import { getDefaultAccessiblePath } from '../lib/access';

interface AccessDeniedProps {
  message?: string;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ message = 'You do not have permission to view this page.' }) => {
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const fallbackPath = getDefaultAccessiblePath(currentUser, rolePermissions);

  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
      <Link
        to={fallbackPath}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        Go to your workspace <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
};

export default AccessDenied;
