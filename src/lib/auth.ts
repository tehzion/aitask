export const DEFAULT_USER_PASSWORD = 'password123';

export const hasDefaultPassword = (password?: string) => password === DEFAULT_USER_PASSWORD;

const env = (key: string) => (import.meta.env[key] as string | undefined)?.trim() || '';

const isEnabled = (value: string) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const isDisabled = (value: string) => ['0', 'false', 'no', 'off'].includes(value.toLowerCase());

export const shouldShowDemoLogin = () => {
  const configured = env('VITE_AITASK_SHOW_DEMO_LOGIN');
  if (configured) {
    if (isEnabled(configured)) return true;
    if (isDisabled(configured)) return false;
  }

  return true;
};
