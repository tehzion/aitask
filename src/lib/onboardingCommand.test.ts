import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const values=new Map<string,string>();
beforeEach(()=>{
  values.clear(); vi.resetModules();
  vi.stubGlobal('window',{sessionStorage:{get length(){return values.size;},getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key),key:(index:number)=>[...values.keys()][index]||null}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('onboarding operation recovery identities',()=>{
  it('keeps credentials out of the browser journal and reuses the same non-secret intent',async()=>{
    const journal=await import('./onboardingCommand');
    const first=await journal.onboardingRequestKey('auth-a',{name:'Saved',email:'saved@example.test',password:'first-secret-password'});
    const changed=await journal.onboardingRequestKey('auth-a',{name:'Saved',email:'saved@example.test',password:'changed-secret-password'});
    expect(changed).toBe(first); const id=journal.retainOnboardingCommand(first);expect(journal.retainOnboardingCommand(changed)).toBe(id);
    expect([...values].join('')).not.toContain('secret-password');
  });
  it('releases a confirmed cancelled ID so the same draft receives a new command',async()=>{
    const journal=await import('./onboardingCommand');const key=await journal.onboardingRequestKey('auth-a',{name:'Saved'});
    const cancelled=journal.retainOnboardingCommand(key);journal.clearOnboardingCommandId('auth-a',cancelled);
    expect(journal.pendingOnboardingCommand(key)).toBeUndefined();expect(journal.retainOnboardingCommand(key)).not.toBe(cancelled);
  });
  it('clears every same-account fingerprint by identity while fencing other accounts',async()=>{
    const journal=await import('./onboardingCommand');
    const key=await journal.onboardingRequestKey('auth-a',{email:'Saved@example.test'});
    const alias=await journal.onboardingRequestKey('auth-a',{email:'saved@example.test'});
    const foreign=await journal.onboardingRequestKey('auth-b',{email:'saved@example.test'});
    const id=journal.retainOnboardingCommand(key);values.set(alias,id);values.set(foreign,id);
    journal.clearOnboardingCommandId('auth-a',id);
    expect(journal.pendingOnboardingCommand(key)).toBeUndefined();expect(journal.pendingOnboardingCommand(alias)).toBeUndefined();expect(journal.pendingOnboardingCommand(foreign)).toBe(id);
  });
  it('releases a persisted ID after browser memory is lost',async()=>{
    const original=await import('./onboardingCommand');const key=await original.onboardingRequestKey('auth-a',{name:'Saved'});const id=original.retainOnboardingCommand(key);
    vi.resetModules();const restored=await import('./onboardingCommand');expect(restored.pendingOnboardingCommand(key)).toBe(id);
    restored.clearOnboardingCommandId('auth-a',id);expect(restored.retainOnboardingCommand(key)).not.toBe(id);
  });
});
