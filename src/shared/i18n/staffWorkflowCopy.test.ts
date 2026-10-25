import { expect, it } from 'vitest';
import { translateUiText } from './i18n';
import './staffWorkflowCopy';
it('loads Chinese staff workflow copy with its routes', () => {
  for (const key of ['Work ownership', 'Help requested', 'Awaiting acceptance', 'Open work only', 'Sent for review', 'Awaiting save confirmation', 'Deadline changed']) expect(translateUiText(key, 'zh')).not.toBe(key);
});
