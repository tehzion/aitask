import { describe, expect, it } from 'vitest';
import { passwordSetupModeFromUrl } from './authRecovery';

describe('passwordSetupModeFromUrl', () => {
  it('accepts only invite and recovery callbacks', () => {
    expect(passwordSetupModeFromUrl('https://app.test/account/password#type=invite&access_token=secret')).toBe('invite');
    expect(passwordSetupModeFromUrl('https://app.test/account/password?type=recovery')).toBe('recovery');
    expect(passwordSetupModeFromUrl('https://app.test/account/password#type=signup')).toBeNull();
    expect(passwordSetupModeFromUrl('https://app.test/account/password?type=javascript%3Aalert(1)')).toBeNull();
  });

  it('fails closed for malformed values', () => {
    expect(passwordSetupModeFromUrl('')).toBeNull();
    expect(passwordSetupModeFromUrl('https://app.test/account/password#type=')).toBeNull();
  });
});
