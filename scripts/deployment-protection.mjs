let cached;
export const deploymentProtectionHeaders = async (url, fetcher = fetch) => {
  const configured = process.env.STAGING_PROTECTION_ORIGIN;
  if (!configured) return {};
  const origin = new URL(configured);
  if (origin.protocol !== 'https:') throw new Error('Staging protection requires an HTTPS origin.');
  if (new URL(url).origin !== origin.origin) return {};
  if (!cached || cached.expires < Date.now() + 60_000) {
    const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestUrl || !requestToken) throw new Error('GitHub OIDC access is unavailable for protected staging.');
    const endpoint = new URL(requestUrl);
    if (endpoint.protocol !== 'https:') throw new Error('GitHub OIDC endpoint must use HTTPS.');
    endpoint.searchParams.set('audience', 'https://github.com/tehzion');
    const response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${requestToken}` }, redirect: 'error' });
    if (!response.ok) throw new Error('GitHub OIDC token request failed.');
    const { value } = await response.json();
    let claims;
    try { claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); } catch { throw new Error('GitHub OIDC returned an invalid token.'); }
    if (claims.aud !== 'https://github.com/tehzion' || claims.repository !== 'tehzion/aitask'
      || !['Authenticated Staging QA', 'Tagged Release Verification'].includes(claims.workflow)
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('GitHub OIDC claims do not match staging QA.');
    cached = { token: value, expires: claims.exp * 1000 };
  }
  return { 'x-vercel-trusted-oidc-idp-token': cached.token };
};
