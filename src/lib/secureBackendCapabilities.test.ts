import { describe, expect, it } from 'vitest';
import { loadBackendCompatibility } from './secureBackendCapabilities';

const check = (error: { code?: string; message?: string }) => loadBackendCompatibility(
  async () => ({ data: null, error }), async () => false, () => false, 5, 'Needs update', 'Connection lost',
);

describe('backend capability check', () => {
  it('treats a dropped connection as retryable, not as a needed update', async () => {
    expect(await check({ code: '', message: 'TypeError: Failed to fetch' })).toEqual({ compatible: false, error: 'Connection lost', code: 'RETRY_REQUIRED', retryable: true });
    expect(await check({ message: 'Load failed' })).toMatchObject({ retryable: true });
  });

  it('requests sign-in rather than an upgrade when session refresh fails', async () => {
    const result = await loadBackendCompatibility(
      async () => ({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }),
      async () => false, () => true, 5, 'Needs update', 'Connection lost',
    );
    expect(result).toMatchObject({ compatible: false, code: 'AUTH_REQUIRED' });
    expect(result.error).toMatch(/sign in/i);
  });

  it('still reports a real server error as needing an update', async () => {
    expect(await check({ code: 'PGRST202', message: 'Could not find the function' })).toEqual({ compatible: false, code: 'PGRST202', error: 'Needs update' });
  });
});
