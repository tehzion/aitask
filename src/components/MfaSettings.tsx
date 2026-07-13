import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button } from './ui';
import { cardBase, inputBase } from './uiTokens';
import { cn } from '../lib/utils';

type Enrollment = { id: string; qrCode: string };

const MfaSettings: React.FC = () => {
  const [factorId, setFactorId] = React.useState('');
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(null);
  const [code, setCode] = React.useState('');
  const [isAal2, setIsAal2] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [{ data: factors }, { data: assurance }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    setFactorId(factors?.totp.find(factor => factor.status === 'verified')?.id || '');
    setIsAal2(assurance?.currentLevel === 'aal2');
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginEnrollment = async () => {
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AiTask Admin' });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setEnrollment({ id: data.id, qrCode: data.totp.qr_code });
  };

  const verify = async () => {
    const activeFactorId = enrollment?.id || factorId;
    if (!activeFactorId || !/^\d{6}$/.test(code.trim())) {
      setMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: activeFactorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setEnrollment(null);
    setCode('');
    setMessage('MFA verified. Administrative changes are unlocked for this session.');
    await refresh();
  };

  const qrSource = enrollment
    ? enrollment.qrCode.startsWith('data:')
      ? enrollment.qrCode
      : `data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`
    : '';

  return (
    <section className={`${cardBase} overflow-hidden`}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Admin multi-factor authentication</h2>
          <p className="text-sm text-slate-500">Required before member, role, and workspace administration.</p>
        </div>
      </div>
      <div className="space-y-4 p-6">
        {isAal2 ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            MFA is verified for this session.
          </p>
        ) : (
          <>
            {!factorId && !enrollment && <Button onClick={beginEnrollment} disabled={busy}>Set up authenticator</Button>}
            {enrollment && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Scan this QR code with your authenticator app.</p>
                <img src={qrSource} alt="Authenticator enrollment QR code" className="h-48 w-48 border border-slate-200 bg-white p-2" />
              </div>
            )}
            {(factorId || enrollment) && (
              <div className="flex max-w-md flex-col gap-2 sm:flex-row">
                <input
                  className={cn(inputBase, 'px-3 py-2.5')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  aria-label="Authenticator code"
                />
                <Button onClick={verify} disabled={busy || code.length !== 6}>Verify MFA</Button>
              </div>
            )}
          </>
        )}
        {message && <p className="text-sm text-slate-600" role="status">{message}</p>}
      </div>
    </section>
  );
};

export default MfaSettings;
