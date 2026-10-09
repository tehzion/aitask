import type { Department, Role, User } from '../types';
import { supabase } from './supabaseClient';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from './workspaceSession';

export type OnboardingPayload = {
  name: string; email: string; role: Role; departments: Department[];
  companyName: string | null; customRoleId: string | null; customRoleName: string | null;
  memberId: string | null; registrationId: string | null;
  workerType: NonNullable<User['workerType']>; sendInvitation: boolean;
};
export type OnboardingOperation = {
  commandId: string; state: 'pending' | 'cancelling'; payload: OnboardingPayload;
  createdAt: string; prepared: boolean;
};

export const onboardingAction = async (authUserId: string, action: 'list_onboarding' | 'cancel_onboarding', commandId?: string) => {
  const fence = captureWorkspaceSession();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== authUserId || !isWorkspaceSessionCurrent(fence)) throw new Error('Your session changed. Sign in again.');
  const { data, error } = await supabase.functions.invoke('invite-aitask-member', { body: { action, commandId } });
  if (!isWorkspaceSessionCurrent(fence)) throw new Error('Your session changed. Sign in again.');
  if (error) {
    const payload = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(payload?.error || 'Unable to confirm invitation recovery. Retry when the backend is available.');
  }
  if (!data?.ok) throw new Error('Unable to confirm invitation recovery. Retry when the backend is available.');
  return data as { ok: true; operations?: OnboardingOperation[]; state?: 'cancelled' | 'completed'; result?: unknown };
};
