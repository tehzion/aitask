import React from 'react';
import { BookmarkPlus, X } from 'lucide-react';
import '../lib/pageCopy';
import { addSavedReply, BUILT_IN_REPLIES, insertReply, parseSavedReplies, removeSavedReply, savedRepliesKey } from '../lib/savedReplies';
import { useI18n } from './I18nProvider';

interface ReviewReplyChipsProps {
  userId: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
}

const readStored = (userId: string) => {
  try { return parseSavedReplies(localStorage.getItem(savedRepliesKey(userId))); } catch { return []; }
};

/**
 * Quick replies for a reviewer's revision note. Built-ins are translated;
 * replies a reviewer saves stay as written and live only in their own browser.
 */
const ReviewReplyChips: React.FC<ReviewReplyChipsProps> = ({ userId, value, onChange, maxLength = 2000 }) => {
  const { t } = useI18n();
  const [saved, setSaved] = React.useState<string[]>(() => readStored(userId));
  React.useEffect(() => { setSaved(readStored(userId)); }, [userId]);

  const persist = (next: string[]) => {
    setSaved(next);
    try { localStorage.setItem(savedRepliesKey(userId), JSON.stringify(next)); } catch { /* Storage can be blocked; the list still works for this visit. */ }
  };
  const chip = 'min-h-9 rounded-full border border-line px-3 text-left text-sm text-muted transition-colors duration-160 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35';
  const canSave = Boolean(value.trim()) && !value.includes('\n') && value.trim().length <= 300;

  return (
    <div role="group" aria-label={t('Quick replies')} className="mt-2">
      <div className="flex flex-wrap gap-2">
        {BUILT_IN_REPLIES.map(reply => (
          <button key={reply} type="button" onClick={() => onChange(insertReply(value, t(reply), maxLength))} className={chip}>{t(reply)}</button>
        ))}
        {saved.map(reply => (
          <span key={reply} className="inline-flex items-center rounded-full border border-line">
            <button type="button" onClick={() => onChange(insertReply(value, reply, maxLength))} className="min-h-9 rounded-l-full pl-3 pr-2 text-left text-sm text-ink hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><span data-i18n-skip>{reply}</span></button>
            <button type="button" aria-label={`${t('Remove saved reply')}: ${reply}`} onClick={() => persist(removeSavedReply(saved, reply))} className="flex min-h-9 min-w-9 items-center justify-center rounded-r-full text-muted hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
          </span>
        ))}
      </div>
      {canSave && (
        <button type="button" onClick={() => persist(addSavedReply(saved, value))} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-control px-1 text-sm font-medium text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <BookmarkPlus aria-hidden="true" className="h-4 w-4" />{t('Save as quick reply')}
        </button>
      )}
    </div>
  );
};

export default ReviewReplyChips;
