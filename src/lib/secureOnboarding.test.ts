import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateWorkspaceSession } from './workspaceSession';
const { getUser, invoke } = vi.hoisted(()=>({getUser:vi.fn(),invoke:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getUser},functions:{invoke}}}));
import { onboardingAction } from './secureOnboarding';
beforeEach(()=>{invalidateWorkspaceSession();vi.resetAllMocks();getUser.mockResolvedValue({data:{user:{id:'boss-auth'}},error:null});});
describe('onboarding recovery session boundaries',()=>{
  it('rejects a different Auth account before contacting the Edge action',async()=>{
    await expect(onboardingAction('another-auth','list_onboarding')).rejects.toThrow('session changed'); expect(invoke).not.toHaveBeenCalled();
  });
  it('fences an account switch during identity verification',async()=>{
    let release!:()=>void; getUser.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve;});return {data:{user:{id:'boss-auth'}},error:null};});
    const result=onboardingAction('boss-auth','list_onboarding'); invalidateWorkspaceSession(); release();
    await expect(result).rejects.toThrow('session changed'); expect(invoke).not.toHaveBeenCalled();
  });
  it('fences a late operation summary after the session changes',async()=>{
    let release!:()=>void; invoke.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve;});return {data:{ok:true,operations:[]},error:null};});
    const result=onboardingAction('boss-auth','list_onboarding'); await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    invalidateWorkspaceSession(); release(); await expect(result).rejects.toThrow('session changed');
  });
  it('passes only the original operation identity when requesting cancellation',async()=>{
    invoke.mockResolvedValueOnce({data:{ok:true,state:'cancelled'},error:null});
    expect(await onboardingAction('boss-auth','cancel_onboarding','original-command')).toMatchObject({state:'cancelled'});
    expect(invoke).toHaveBeenCalledWith('invite-aitask-member',{body:{action:'cancel_onboarding',commandId:'original-command'}});
  });
  it('keeps the backend cleanup-pending explanation actionable',async()=>{
    invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:'Cancellation cleanup is pending. Retry cancellation before creating a replacement.'}),{status:409})}});
    await expect(onboardingAction('boss-auth','cancel_onboarding','original-command')).rejects.toThrow('cleanup is pending');
  });
});
