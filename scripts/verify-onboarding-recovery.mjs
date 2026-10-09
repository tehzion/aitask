import { readFileSync } from 'node:fs';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = new URL(process.env.AITASK_LOCAL_TEST_URL);
const secret = process.env.AITASK_LOCAL_TEST_SECRET;
const database = process.env.AITASK_LOCAL_TEST_DB;
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !secret || !database?.startsWith('supabase_db_aitask-supabase-validation-')) throw new Error('Onboarding verifier requires the disposable local stack.');
const request = async (path, body, expected = 200) => {
  const response = await fetch(new URL(path, base), { method: body === undefined ? 'GET' : 'POST', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.status, expected, `Unexpected status for ${path}`);
  return response.json();
};
const rpc = (name, body, expected = 200) => request(`/rest/v1/rpc/${name}`, body, expected);
const id = crypto.randomUUID();
const workspace = `onboarding-${id}`;
const actorId = `boss-${id}`;
const bossPassword = crypto.randomUUID() + 'Aa1!';
const actor = await request('/auth/v1/admin/users', { email: `boss-${id}@example.test`, password: bossPassword, email_confirm: true });
const sql = `insert into public.aitask_workspaces(id,name) values ('${workspace}','Disposable onboarding'); insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values ('${actorId}','${workspace}','${actor.id}','Onboarding Boss','boss-${id}@example.test','Project Manager','Management',array['Management'],true);`;
execFileSync('docker', ['exec', database, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
const payloadFor = email => ({ name: 'Onboarding '+email.split('@')[0], email, role: 'Staff', departments: ['Designer'], companyName: null, customRoleId: null, customRoleName: null, memberId: null, registrationId: null, workerType: 'freelancer', sendInvitation: false });
const command = crypto.randomUUID();
const payload = payloadFor(`temp-${id}@example.test`);
const envelope = { p_actor_member_id: actorId, p_command_id: command, p_payload: payload };
await rpc('aitask_reserve_member_onboarding', envelope);
const prepared = await request('/auth/v1/admin/users', { email: payload.email, password: crypto.randomUUID()+'Aa1!', email_confirm: true, app_metadata: { aitask_onboarding_command: command, aitask_onboarding_actor: actorId, aitask_onboarding_workspace: workspace } });
const body = { ...envelope, p_auth_user_id: prepared.id };
const first = await rpc('aitask_finalize_member_invitation_v3', body);
assert.equal(first.member.worker_type, 'freelancer');
assert.deepEqual(await rpc('aitask_finalize_member_invitation_v3', body), first);
assert.deepEqual((await rpc('aitask_reserve_member_onboarding', envelope)).result, first);
await rpc('aitask_reserve_member_onboarding', { ...envelope, p_payload: { ...payload, workerType: 'supplier' } }, 400);
const inviteCommand = crypto.randomUUID();
const invitePayload = { ...payloadFor(`invite-${id}@example.test`), name: 'Invited supplier '+id, workerType: 'supplier', sendInvitation: true };
const inviteEnvelope = { p_actor_member_id: actorId, p_command_id: inviteCommand, p_payload: invitePayload };
await rpc('aitask_reserve_member_onboarding', inviteEnvelope);
const invited = await request('/auth/v1/invite', { email: invitePayload.email, data: { name: invitePayload.name, aitask_onboarding_command: inviteCommand } });
const storedInvite = await request(`/auth/v1/admin/users/${invited.id}`);
assert.equal(storedInvite.app_metadata.aitask_onboarding_command, inviteCommand);
const inviteResult = await rpc('aitask_finalize_member_invitation_v3', { ...inviteEnvelope, p_auth_user_id: invited.id });
assert.equal(inviteResult.member.worker_type, 'supplier');
const unrelatedCommand = crypto.randomUUID();
const unrelatedPayload = payloadFor(`unrelated-${id}@example.test`);
const unrelatedEnvelope = { p_actor_member_id: actorId, p_command_id: unrelatedCommand, p_payload: unrelatedPayload };
await rpc('aitask_reserve_member_onboarding', unrelatedEnvelope);
const unrelated = await request('/auth/v1/admin/users', { email: unrelatedPayload.email, password: crypto.randomUUID()+'Aa1!', email_confirm: true, user_metadata: { aitask_onboarding_command: unrelatedCommand } });
await rpc('aitask_finalize_member_invitation_v3', { ...unrelatedEnvelope, p_auth_user_id: unrelated.id }, 400);
// Exercise the actual Edge handler with real SDK/Auth/REST; only its Deno host
// registration is supplied by this local Node harness.
const actorLogin = await request('/auth/v1/token?grant_type=password', { email: `boss-${id}@example.test`, password: bossPassword });
let handler;
let loseFinalizationResponse = true;
let failFinalization = false;
let loseEmailResponse = false;
let failDeletion = false;
let loseDeletionResponse = false;
const source = readFileSync(new URL('../supabase/functions/invite-aitask-member/index.ts', import.meta.url), 'utf8').split('\n').slice(2).join('\n');
const executable = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;
const deno = { env: { get: key => ({ SUPABASE_URL: base.toString().replace(/\/$/, ''), SUPABASE_SERVICE_ROLE_KEY: secret, SUPABASE_ANON_KEY: process.env.AITASK_LOCAL_TEST_PUBLIC, AITASK_PUBLIC_URL: 'https://app.test' }[key]) }, serve: next => { handler = next; } };
const clientFactory = (url, key, options) => createClient(url, key, { ...options, global: { ...options?.global, fetch: async (...args) => {
  const target = String(args[0]);
  const method = args[1]?.method;
  if (target.includes('/rpc/aitask_finalize_member_invitation_v3') && failFinalization) throw new TypeError('Simulated unconfirmed finalization');
  if (target.includes('/auth/v1/admin/users/') && method === 'DELETE' && failDeletion) throw new TypeError('Simulated unconfirmed deletion');
  const response = await fetch(...args);
  if (target.includes('/auth/v1/admin/users/') && method === 'PUT' && response.ok && loseEmailResponse) {
    loseEmailResponse=false; await response.text(); throw new TypeError('Simulated lost email acknowledgement');
  }
  if (target.includes('/auth/v1/admin/users/') && method === 'DELETE' && response.ok && loseDeletionResponse) {
    loseDeletionResponse=false; await response.text(); throw new TypeError('Simulated lost cleanup acknowledgement');
  }
  if (String(args[0]).includes('/rpc/aitask_finalize_member_invitation_v3') && response.ok && loseFinalizationResponse) {
    loseFinalizationResponse = false;
    await response.text();
    throw new TypeError('Simulated lost finalization acknowledgement');
  }
  return response;
} } });
new Function('createClient','Deno',executable)(clientFactory,deno);
const handlerCommand = crypto.randomUUID();
const handlerPassword = crypto.randomUUID()+'Aa1!';
const handlerBody = { commandId: handlerCommand, name:'Handler recovery '+id,email:`handler-${id}@example.test`,role:'Staff',departments:['Designer'],workerType:'freelancer',sendInvitation:false,password:handlerPassword };
const invoke = () => handler(new Request('https://app.test/invite', { method:'POST',headers:{ Authorization:`Bearer ${actorLogin.access_token}`,'Content-Type':'application/json' },body:JSON.stringify(handlerBody) }));
const handlerResponse = await invoke();
assert.equal(handlerResponse.status,200);
const confirmed = await handlerResponse.json();
assert.equal(confirmed.member.worker_type,'freelancer');
assert.equal((await invoke()).status,200);
const login = await request('/auth/v1/token?grant_type=password', {email:handlerBody.email,password:handlerPassword});
assert.equal(login.user.id,confirmed.member.auth_user_id);
console.log('[onboarding] Actual Edge handler preserved the real login after lost finalization response and replayed its confirmed member.');
console.log('[onboarding] Real local Auth/REST verified atomic worker types, receipt replay, lost-confirmation reconciliation, email-invite stamping and unrelated-account denial.');

const invokeBody = async (body, token = actorLogin.access_token) => handler(new Request('https://app.test/invite', {
  method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),
}));
// Auth email and member email must survive a lost Auth response together.
const changedEmail=`changed-boss-${id}@example.test`;
loseEmailResponse=true;
const emailResponse=await invokeBody({action:'update_self_email',email:changedEmail,currentPassword:bossPassword});
assert.equal(emailResponse.status,200);
assert.equal((await request(`/auth/v1/admin/users/${actor.id}`)).email,changedEmail);
const emailRows=await request(`/rest/v1/aitask_members?id=eq.${actorId}&select=email`);
assert.equal(emailRows[0].email,changedEmail);
// A duplicate workspace member rejects the Auth update transaction atomically.
const blockedEmail=`blocked-${id}@example.test`;
execFileSync('docker',['exec',database,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',
 `insert into public.aitask_members(id,workspace_id,name,email,role,department,departments) values ('blocked-${id}','${workspace}','Blocked','${blockedEmail}','Staff','Designer',array['Designer']);`],{stdio:'pipe'});
assert.equal((await invokeBody({action:'update_self_email',email:blockedEmail,currentPassword:bossPassword})).status,409);
assert.equal((await request(`/auth/v1/admin/users/${actor.id}`)).email,changedEmail);

// Lose the browser journal, then resume the server-owned original payload.
const recoveryBody={...handlerBody,commandId:crypto.randomUUID(),email:`recovery-${id}@example.test`,name:'Browser recovery '+id};
failFinalization=true;
assert.equal((await invokeBody(recoveryBody)).status,409);
failFinalization=false;
const pending=await (await invokeBody({action:'list_onboarding'})).json();
const saved=pending.operations.find(item=>item.commandId===recoveryBody.commandId);
assert.ok(saved); assert.equal(saved.prepared,true);
assert.ok(!JSON.stringify(saved).includes(handlerPassword));
const wrong=await invokeBody({...saved.payload,commandId:saved.commandId,password:crypto.randomUUID()+'Aa1!'});
assert.equal(wrong.status,409); assert.equal((await wrong.json()).code,'ONBOARDING_PASSWORD_MISMATCH');
const resumed=await invokeBody({...saved.payload,commandId:saved.commandId,password:handlerPassword});
assert.equal(resumed.status,200);
const replay=await (await invokeBody({...recoveryBody,password:crypto.randomUUID()+'Aa1!'})).json();
assert.equal(replay.passwordApplied,false); assert.equal(replay.replayed,true);
const completedCancellation=await (await invokeBody({action:'cancel_onboarding',commandId:recoveryBody.commandId})).json();
assert.equal(completedCancellation.state,'completed');
await request('/auth/v1/token?grant_type=password',{email:recoveryBody.email,password:handlerPassword});

// Cancellation uncertainty keeps the reservation fenced. Lost deletion ACK
// reconciles through real PostgreSQL; a replacement is allowed only afterwards.
const cancelBody={...handlerBody,commandId:crypto.randomUUID(),email:`cancel-${id}@example.test`,name:'Cancel recovery '+id};
failFinalization=true;
assert.equal((await invokeBody(cancelBody)).status,409);
failFinalization=false; failDeletion=true;
assert.equal((await invokeBody({action:'cancel_onboarding',commandId:cancelBody.commandId})).status,409);
await rpc('aitask_reserve_member_onboarding',{p_actor_member_id:actorId,p_command_id:crypto.randomUUID(),p_payload:{...payloadFor(cancelBody.email),name:cancelBody.name}},400);
failDeletion=false; loseDeletionResponse=true;
assert.equal((await invokeBody({action:'cancel_onboarding',commandId:cancelBody.commandId})).status,200);
assert.equal((await invokeBody(cancelBody)).status,409);
const lateCreate=await fetch(new URL('/auth/v1/admin/users',base),{method:'POST',headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({email:cancelBody.email,password:handlerPassword,email_confirm:true,
 app_metadata:{aitask_onboarding_command:cancelBody.commandId,aitask_onboarding_actor:actorId,aitask_onboarding_workspace:workspace}})});
assert.equal(lateCreate.ok,false);
const replacement=await invokeBody({...cancelBody,commandId:crypto.randomUUID()});
assert.equal(replacement.status,201);
// Cancelling a journal must not delete a matching, unrelated signup account.
assert.equal((await invokeBody({action:'cancel_onboarding',commandId:unrelatedCommand})).status,200);
assert.equal((await request(`/auth/v1/admin/users/${unrelated.id}`)).id,unrelated.id);
const staffLogin=await request('/auth/v1/token?grant_type=password',{email:handlerBody.email,password:handlerPassword});
assert.equal((await invokeBody({action:'list_onboarding'},staffLogin.access_token)).status,403);
assert.equal((await invokeBody({action:'cancel_onboarding',commandId:handlerCommand},staffLogin.access_token)).status,403);
console.log('[account recovery] Real Auth/REST verified atomic email ACK loss, duplicate rejection, cross-browser recovery, original password enforcement, completed replay, cancellation cleanup uncertainty, late-creation fencing and Staff isolation.');

// Competing finalization and cancellation must produce one coherent outcome.
const raceBody={...handlerBody,commandId:crypto.randomUUID(),email:`race-${id}@example.test`,name:'Race recovery '+id};
failFinalization=true; assert.equal((await invokeBody(raceBody)).status,409); failFinalization=false;
const [raceFinalize,raceCancel]=await Promise.all([invokeBody(raceBody),invokeBody({action:'cancel_onboarding',commandId:raceBody.commandId})]);
const raceReceipt=await raceCancel.json();
assert.equal(raceCancel.status,200);
assert.ok(['completed','cancelled'].includes(raceReceipt.state));
if(raceReceipt.state==='completed') {
  assert.equal(raceFinalize.status,200);
  await request('/auth/v1/token?grant_type=password',{email:raceBody.email,password:handlerPassword});
} else {
  assert.equal(raceFinalize.status,409);
  const absent=await fetch(new URL('/auth/v1/token?grant_type=password',base),{method:'POST',headers:{apikey:secret,'Content-Type':'application/json'},body:JSON.stringify({email:raceBody.email,password:handlerPassword})});
  assert.equal(absent.ok,false);
}
// Retain a saved object owned by the removed member, including its reference.
const storage=createClient(base.toString(),secret,{auth:{persistSession:false,autoRefreshToken:false}});
const retainedPath=`${workspace}/client/cycle/member-removal.pdf`;
const upload=await storage.storage.from('client-service-files').upload(retainedPath,new Blob(['%PDF-1.4 retained'],{type:'application/pdf'}),{contentType:'application/pdf'});
assert.ifError(upload.error);
execFileSync('docker',['exec',database,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',
 `update storage.objects set owner_id='${confirmed.member.auth_user_id}',owner='${confirmed.member.auth_user_id}' where bucket_id='client-service-files' and name='${retainedPath}';
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('${workspace}','client','client','{"id":"client","clientName":"Retention QA","createdBy":"${actorId}"}'),
 ('${workspace}','service_cycle','cycle','{"id":"cycle","clientId":"client","clientName":"Retention QA"}'),
 ('${workspace}','cycle_comment','retained-comment','{"id":"retained-comment","clientId":"client","clientName":"Retention QA","cycleId":"cycle","authorId":"${confirmed.member.id}","attachments":[{"bucket":"client-service-files","path":"${retainedPath}"}]}');`],{stdio:'pipe'});
assert.equal((await invokeBody({action:'delete_member',memberId:confirmed.member.id})).status,200);
assert.ifError((await storage.storage.from('client-service-files').download(retainedPath)).error);
assert.equal((await request(`/rest/v1/aitask_members?id=eq.${confirmed.member.id}&select=id`)).length,0);
const retainedComment=await request(`/rest/v1/aitask_entities?workspace_id=eq.${workspace}&entity_id=eq.retained-comment&select=data`);
assert.equal(retainedComment[0].data.attachments[0].path,retainedPath);
const removedLogin=await fetch(new URL('/auth/v1/token?grant_type=password',base),{method:'POST',headers:{apikey:secret,'Content-Type':'application/json'},body:JSON.stringify({email:handlerBody.email,password:handlerPassword})});
assert.equal(removedLogin.ok,false);
console.log('[account recovery] Racing finalization/cancellation stayed coherent; actual member removal disabled login and retained an owned saved Storage object and attachment reference.');
