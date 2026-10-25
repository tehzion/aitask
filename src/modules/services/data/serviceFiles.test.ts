import { describe, expect, it } from 'vitest';
import { getServiceFileMimeType } from './serviceFiles';

const file = (name: string, type: string) => ({ name, type });

describe('client service file policy', () => {
  it('accepts the supported PDF and image MIME types', () => {
    expect(getServiceFileMimeType(file('brief.pdf', 'application/pdf'))).toBe('application/pdf');
    expect(getServiceFileMimeType(file('cover.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(getServiceFileMimeType(file('cover.png', 'image/png'))).toBe('image/png');
    expect(getServiceFileMimeType(file('cover.webp', 'image/webp'))).toBe('image/webp');
    expect(getServiceFileMimeType(file('cover.gif', 'image/gif'))).toBe('image/gif');
  });

  it('falls back to the supported extension for missing or generic browser MIME values', () => {
    expect(getServiceFileMimeType(file('brief.PDF', ''))).toBe('application/pdf');
    expect(getServiceFileMimeType(file('cover.jpeg', 'application/octet-stream'))).toBe('image/jpeg');
  });

  it('rejects unsupported MIME types and extensions', () => {
    expect(getServiceFileMimeType(file('script.js', 'text/javascript'))).toBeNull();
    expect(getServiceFileMimeType(file('archive.zip', ''))).toBeNull();
    expect(getServiceFileMimeType(file('fake.pdf', 'application/zip'))).toBeNull();
  });
});
