import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  message?: string;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ message = 'You do not have permission to view this page.' }) => (
  <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
      <ShieldAlert className="h-7 w-7" />
    </div>
    <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{message}</p>
  </div>
);

export default AccessDenied;
