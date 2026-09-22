import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkRecovery';

describe('chunk load error detection', () => {
  it('recognizes dynamic import failures from a replaced build', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: https://aitask-virid.vercel.app/assets/index-CjWPKQsB.js')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
    expect(isChunkLoadError('Error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError('Loading chunk 12 failed.')).toBe(true);
    expect(isChunkLoadError('ChunkLoadError: Loading chunk 3 failed.')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError('Cannot read properties of undefined')).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
