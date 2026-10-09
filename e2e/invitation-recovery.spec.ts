import { expect, test, type Page } from '@playwright/test';

test.use({ trace:'off',screenshot:'off',video:'off' });
const install = async (page: Page, mode: 'resume' | 'cancel' | 'switch' = 'resume') => {
  await page.goto('/login');
  await page.evaluate(async mode => {
    const { installRecoveryHarness } = await import('/e2e/fixtures/recovery-harness.tsx');
    await installRecoveryHarness(mode);
  },mode);
};

test('saved invitation survives a fresh tab and submits only the original request identity',async({page})=>{
  await install(page);
  const region=page.getByRole('region',{name:'Pending invitations'});
  await expect(region.getByText('Saved invitation',{exact:true})).toBeVisible();
  // Start a new page: the original browser journal is absent; the server summary
  // supplies the original identity and payload to the same production component.
  await page.reload(); await install(page);
  await region.getByRole('button',{name:'Resume invitation'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Original temporary password').fill('Different-credential-123!');
  await dialog.getByRole('button',{name:'Resume invitation'}).click();
  await expect(dialog.getByRole('alert')).toContainText('original temporary password');
  await dialog.getByLabel('Original temporary password').fill('Original-credential-123!');
  await dialog.getByRole('button',{name:'Resume invitation'}).click();
  await expect(dialog).toBeHidden(); await expect(region.getByRole('status')).toHaveText('Invitation completed.');
  const evidence=await page.evaluate(()=>({
    inputs:(window as unknown as {recoveryInputs:unknown[]}).recoveryInputs,
    retained:[...Array(localStorage.length)].map((_,index)=>localStorage.getItem(localStorage.key(index)!)).join('')+
      [...Array(sessionStorage.length)].map((_,index)=>sessionStorage.getItem(sessionStorage.key(index)!)).join(''),
  }));
  expect(evidence.inputs).toEqual([{commandId:'00000000-0000-4000-8000-000000007991',name:'Saved invitation'},{commandId:'00000000-0000-4000-8000-000000007991',name:'Saved invitation'}]);
  expect(evidence.retained.includes('Original-credential')).toBe(false); expect(evidence.retained.includes('Different-credential')).toBe(false);
});

test('uncertain invitation cleanup exposes cancellation retry on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await install(page,'cancel');
  const region=page.getByRole('region',{name:'Pending invitations'});
  await region.getByRole('button',{name:'Cancel request'}).click();
  let dialog=page.getByRole('dialog'); await dialog.getByRole('button',{name:'Cancel request',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('cleanup is pending');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await region.getByRole('button',{name:'Refresh invitations'}).click();
  await region.getByRole('button',{name:'Retry cancellation'}).click();
  dialog=page.getByRole('dialog'); await dialog.getByRole('button',{name:'Cancel request',exact:true}).click();
  await expect(dialog).toBeHidden(); await expect(region.getByRole('status')).toHaveText('Invitation cancelled. You can create a replacement.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {nextRecoveryCommand:()=>string}).nextRecoveryCommand())).not.toBe('00000000-0000-4000-8000-000000007991');
});

test('an account switch fences an outstanding invitation summary',async({page})=>{
  await install(page,'switch');
  await page.waitForFunction(()=>typeof (window as unknown as {resolveRecoveryList?:unknown}).resolveRecoveryList==='function');
  await page.evaluate(()=>{
    const api=window as unknown as {switchRecoveryAccount:()=>void;resolveRecoveryList:()=>void};
    api.switchRecoveryAccount(); api.resolveRecoveryList();
  });
  await expect(page.getByRole('region',{name:'Pending invitations'})).toBeVisible();
  await expect(page.getByText('Saved invitation',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Resume invitation'})).toHaveCount(0);
});
