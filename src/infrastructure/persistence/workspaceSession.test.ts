import { describe, expect, it } from 'vitest';
import { assertWorkspaceSession, captureWorkspaceSession, invalidateWorkspaceSession, isWorkspaceSessionCurrent } from './workspaceSession';

describe('workspace session lifetime', () => {
  it('invalidates old requests even when the same member signs back in', () => {
    const old = captureWorkspaceSession();
    expect(isWorkspaceSessionCurrent(old)).toBe(true);
    invalidateWorkspaceSession();
    expect(old.signal.aborted).toBe(true);
    expect(isWorkspaceSessionCurrent(old)).toBe(false);
    expect(() => assertWorkspaceSession(old)).toThrow('Workspace session changed.');
    expect(isWorkspaceSessionCurrent(captureWorkspaceSession())).toBe(true);
  });
});
