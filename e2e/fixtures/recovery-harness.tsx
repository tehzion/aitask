import { onboardingRequestKey, retainOnboardingCommand } from '../../src/lib/onboardingCommand';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useStore, stopBackendAutoSync } from '../../src/store';
import { supabase } from '../../src/lib/supabaseClient';
import { invalidateWorkspaceSession } from '../../src/lib/workspaceSession';
import { I18nProvider } from '../../src/components/I18nProvider';
import PendingInvitations from '../../src/components/PendingInvitations';

export const installRecoveryHarness = async (mode: 'resume' | 'cancel' | 'switch') => {
    stopBackendAutoSync();
    const boss={...useStore.getState().users.find(user=>user.isSuperAdmin)!,authUserId:'recovery-boss-auth'};
    useStore.setState({currentUser:boss});
    const operation={commandId:'00000000-0000-4000-8000-000000007991',state:'pending',createdAt:'2026-10-08T00:00:00.000Z',prepared:true,
      payload:{name:'Saved invitation',email:'saved-invitation@example.test',role:'Staff',departments:['Designer'],companyName:null,customRoleId:null,customRoleName:null,memberId:null,registrationId:null,workerType:'freelancer',sendInvitation:false}};
    const journalKey=await onboardingRequestKey(boss.authUserId,operation.payload);
    sessionStorage.setItem(journalKey,operation.commandId);
    Object.assign(window,{nextRecoveryCommand:()=>retainOnboardingCommand(journalKey)});
    let operations=[operation]; let cancellations=0;
    const inputs: Array<{commandId?:string;name:string}>=[];
    Object.assign(window,{recoveryInputs:inputs,switchRecoveryAccount:()=>{
      invalidateWorkspaceSession(); useStore.setState({currentUser:{...boss,id:'another-boss',authUserId:'another-boss-auth'}});
    }});
    supabase.auth.getUser=async()=>({data:{user:{id:useStore.getState().currentUser!.authUserId}},error:null});
    Object.defineProperty(supabase,'functions',{value:supabase.functions,configurable:true});
    supabase.functions.invoke=async(_name,options)=>{
      if(options.body.action==='list_onboarding') {
        if(mode==='switch' && useStore.getState().currentUser?.authUserId===boss.authUserId) await new Promise(resolve=>Object.assign(window,{resolveRecoveryList:resolve}));
        return {data:{ok:true,operations:useStore.getState().currentUser?.authUserId===boss.authUserId?operations:[]},error:null};
      }
      cancellations++;
      if(cancellations===1) {
        operations=[{...operation,state:'cancelling'}];
        return {data:null,error:{context:new Response(JSON.stringify({error:'Cancellation cleanup is pending. Retry cancellation before creating a replacement.'}),{status:409})}};
      }
      operations=[]; return {data:{ok:true,state:'cancelled'},error:null};
    };
    useStore.setState({addUserBySuperAdmin:async data=>{
      inputs.push({commandId:data.commandId,name:data.name});
      if(data.password!=='Original-credential-123!') return {ok:false,error:'Enter the original temporary password for this request, or cancel it and start again. The new password has not been applied.'};
      operations=[]; return {ok:true};
    }});
    const root=document.createElement('div'); root.style.padding='16px'; document.body.replaceChildren(root);
    const Wrapper=()=>{
      const account=useStore(state=>state.currentUser?.authUserId);
      return React.createElement(PendingInvitations,{authUserId:account||'',refreshKey:false});
    };
    createRoot(root).render(React.createElement(I18nProvider,null,React.createElement(Wrapper)));

};
