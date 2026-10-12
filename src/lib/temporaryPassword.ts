const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 16;
const UNBIASED_BYTE_LIMIT = 256 - (256 % PASSWORD_ALPHABET.length);

export const generateTemporaryPassword = (): string => {
  let password = '';
  while (password.length < PASSWORD_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH));
    for (const byte of bytes) {
      // Reject the incomplete alphabet range rather than biasing modulo picks.
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (password.length === PASSWORD_LENGTH) break;
    }
  }
  return password;
};
