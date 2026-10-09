import { expect, test } from '@playwright/test';
import { deploymentProtectionHeaders } from '../scripts/deployment-protection.mjs';
import { RECOVERY_COMMAND_ID, RECOVERY_FILE_PATH, recoveryFixture } from '../scripts/account-recovery-fixture.mjs';

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
const api = () => ({ url: required('STAGING_SUPABASE_URL').replace(/\/$/,''), key: required('STAGING_SUPABASE_PUBLISHABLE_KEY') });
test.describe('hosted account recovery', () => {
  // A failed account mutation is reviewed before resetting this fixture. A
  // retry cannot silently turn partially completed hosted evidence green.
  test.describe.configure({ retries: 0, timeout: 120_000 });
  test('recovers an original invitation, preserves credentials and email, and retains an upload on removal', async ({ page, context, baseURL }) => {
    const { url, key } = api();
    const bossEmail=required('STAGING_QA_SUPER_ADMIN_EMAIL');
    const fixture=recoveryFixture(bossEmail);
    const originalPassword=required('STAGING_QA_OPERATION_PASSWORD');
    if (!baseURL || new URL(baseURL).origin !== new URL(required('STAGING_PROTECTION_ORIGIN')).origin) throw new Error('Staging origin mismatch.');
    await context.route('**/*', async route => {
      const headers=route.request().headers(); delete headers['x-vercel-trusted-oidc-idp-token'];
      await route.continue({headers:{...headers,...await deploymentProtectionHeaders(route.request().url())}});
    });
    await page.goto('/login');
    await page.getByLabel('Email').fill(bossEmail);
    await page.getByLabel('Password').fill(required('STAGING_QA_SUPER_ADMIN_PASSWORD'));
    await page.getByRole('button',{name:'Access Dashboard'}).click();
    await page.waitForURL(value => !value.pathname.endsWith('/login'));
    const notice=page.getByRole('button',{name:'Happy working'});
    await notice.waitFor({state:'visible',timeout:3_000}).catch(()=>undefined);
    if(await notice.isVisible().catch(()=>false)) await notice.click();
    const bossToken=await page.evaluate(() => {
      for(let index=0;index<sessionStorage.length;index++) {
        const name=sessionStorage.key(index); if(!name?.startsWith('sb-') || !name.endsWith('-auth-token')) continue;
        const session=JSON.parse(sessionStorage.getItem(name)||'null');
        if(session?.access_token) return session.access_token as string;
      } throw new Error('Staging session not available.');
    });
    const post = async (path: string, token: string, body: unknown) => {
      const response=await page.request.post(`${url}${path}`,{headers:{apikey:key,...(token ? {authorization:`Bearer ${token}`} : {})},data:body});
      return { status:response.status(),body:await response.json() };
    };
    await test.step('prepared account rejects a changed password',async()=>{
      const mismatch=await post('/functions/v1/invite-aitask-member',bossToken,{...fixture.payload,commandId:RECOVERY_COMMAND_ID,password:`Wrong-${crypto.randomUUID()}Aa1!`});
      expect(mismatch.status).toBe(409); expect(mismatch.body.code).toBe('ONBOARDING_PASSWORD_MISMATCH');
    });
    await test.step('a new browser session discovers and resumes the original saved request',async()=>{
      await page.goto('/approvals');
      const pending=page.getByRole('region',{name:'Pending invitations'});
      await expect(pending.getByText(fixture.payload.name,{exact:true})).toBeVisible();
      await pending.getByRole('button',{name:'Resume invitation',exact:true}).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByLabel('Original temporary password').fill(originalPassword);
      await dialog.getByRole('button',{name:'Resume invitation',exact:true}).click();
      await expect(dialog).toBeHidden(); await expect(pending.getByRole('status')).toHaveText('Invitation completed.');
    });
    const replay=await post('/functions/v1/invite-aitask-member',bossToken,{...fixture.payload,commandId:RECOVERY_COMMAND_ID,password:`Ignored-${crypto.randomUUID()}Aa1!`});
    expect(replay.status).toBe(200); expect(replay.body.passwordApplied).toBe(false);
    const memberId=replay.body.member.id as string;
    const login=await post('/auth/v1/token?grant_type=password','',{email:fixture.email,password:originalPassword});
    expect(login.status).toBe(200); const memberToken=login.body.access_token as string;
    await test.step('email update survives a lost browser acknowledgement and stays canonical',async()=>{
      let lost=false;
      await page.route(`${url}/functions/v1/invite-aitask-member`,async route=>{
        if(route.request().postDataJSON()?.action==='update_self_email' && !lost) {
          lost=true; const response=await route.fetch(); expect(response.status()).toBe(200); await response.body(); await route.abort('failed');
        } else await route.continue();
      });
      const result=await page.evaluate(async values=>{
        try { await fetch(`${values.url}/functions/v1/invite-aitask-member`,{method:'POST',headers:{apikey:values.key,authorization:`Bearer ${values.token}`,'content-type':'application/json'},body:JSON.stringify({action:'update_self_email',email:values.email,currentPassword:values.password})});return 'acknowledged'; }
        catch { return 'unconfirmed'; }
      },{url,key,token:memberToken,email:fixture.changedEmail,password:originalPassword});
      expect(result).toBe('unconfirmed');
      const retry=await post('/functions/v1/invite-aitask-member',memberToken,{action:'update_self_email',email:fixture.changedEmail,currentPassword:originalPassword});
      expect(retry.status).toBe(200);
      const record=await page.request.get(`${url}/rest/v1/aitask_members?id=eq.${encodeURIComponent(memberId)}&select=email`,{headers:{apikey:key,authorization:`Bearer ${bossToken}`}});
      expect(record.status()).toBe(200); expect((await record.json())[0].email).toBe(fixture.changedEmail);
    });
    await test.step('saved member-owned upload survives account removal',async()=>{
      const taskId='TASK-release-qa-recovery-upload';
      const assignment=await post('/rest/v1/rpc/aitask_execute_command',bossToken,{p_workspace_id:'aitask-main',p_command_id:crypto.randomUUID(),p_command_type:'task.create',p_operations:[{
        kind:'entity',action:'insert',entityType:'task',entityId:taskId,expectedVersion:0,data:{id:taskId,title:'Release QA recovery upload',clientId:'CL-release-qa',clientName:'Release QA Client',serviceCycleId:'SC-release-qa',department:'Designer',assignedTo:memberId,createdBy:'release-qa-super-admin',status:'Pending'},
      }]});
      expect(assignment.status).toBe(200); expect(assignment.body.ok).toBe(true);
      const upload=await page.request.post(`${url}/storage/v1/object/client-service-files/${RECOVERY_FILE_PATH}`,{headers:{apikey:key,authorization:`Bearer ${memberToken}`,'content-type':'application/pdf'},data:Buffer.from('%PDF-1.4 retained QA upload')});
      expect(upload.status()).toBe(200);
      const reference=await post('/rest/v1/rpc/aitask_execute_service_command',bossToken,{p_workspace_id:'aitask-main',p_command_id:crypto.randomUUID(),p_command_type:'cycle_comment.manage',p_expected_workspace_version:null,p_operations:[{
        kind:'entity',action:'insert',entityType:'cycle_comment',entityId:'COMMENT-release-qa-recovery-upload',expectedVersion:0,data:{id:'COMMENT-release-qa-recovery-upload',clientId:'CL-release-qa',clientName:'Release QA Client',cycleId:'SC-release-qa',authorId:'release-qa-super-admin',visibility:'internal',message:'Retained upload QA',attachments:[{bucket:'client-service-files',path:RECOVERY_FILE_PATH,name:'account-recovery.pdf',mimeType:'application/pdf'}]},
      }]});
      expect(reference.status).toBe(200); expect(reference.body.ok).toBe(true);
      const removal=await post('/functions/v1/invite-aitask-member',bossToken,{action:'delete_member',memberId});
      expect(removal.status).toBe(200);
      const retained=await page.request.get(`${url}/storage/v1/object/authenticated/client-service-files/${RECOVERY_FILE_PATH}`,{headers:{apikey:key,authorization:`Bearer ${bossToken}`}});
      expect(retained.status()).toBe(200);
      const removedLogin=await post('/auth/v1/token?grant_type=password','',{email:fixture.changedEmail,password:originalPassword});
      expect(removedLogin.status).toBe(400);
    });
  });
});
