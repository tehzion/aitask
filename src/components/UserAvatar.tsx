import React from 'react';
import { cn } from '../lib/utils';

const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

/** A member photo that falls back to initials when missing or when it fails to load. */
const UserAvatar: React.FC<{ name?: string; src?: string; className?: string; decorative?: boolean }> = ({ name, src, className, decorative = true }) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  const label = decorative ? undefined : name;
  if (!src || failed) {
    return <span data-i18n-skip role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 select-none items-center justify-center bg-inset text-[11px] font-semibold text-muted', className)}>
      {initials(name)}
    </span>;
  }
  return <img src={src} alt={label || ''} data-i18n-skip onError={() => setFailed(true)} className={cn('shrink-0 object-cover', className)} />;
};

export default UserAvatar;
