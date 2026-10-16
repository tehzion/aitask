import { describe, expect, it } from 'vitest';
import { formatMessage, msg } from './messages';
import { translateUiText } from './i18n';
import { userFacingMessage } from './userFacingMessage';

const render = (value: string, locale: 'en' | 'zh') => {
  const result = userFacingMessage(value);
  return typeof result === 'string' ? translateUiText(result, locale) : formatMessage(result, locale);
};

describe('application feedback', () => {
  it.each([
    ['TypeError: Failed to fetch', 'Check your connection', '检查网络连接'],
    ['NetworkError when attempting to fetch resource.', 'Check your connection', '检查网络连接'],
    ['Invalid Refresh Token: Refresh Token Not Found', 'Sign in again', '重新登录'],
    ['new row violates row-level security policy for table "aitask_entities"', 'check your access', '访问权限'],
    ['permission denied for function aitask_execute_command', 'check your access', '访问权限'],
    ['duplicate key value violates unique constraint "aitask_entities_pkey"', 'already exists', '已有相同的记录'],
    ['update or delete on table "aitask_members" violates foreign key constraint "private_fk"', 'linked to other work', '其他工作有关联'],
    ['invalid input syntax for type uuid: "bad-value"', 'Review the fields', '检查填写的内容'],
    ['Object not found', 'no longer available', '已不存在'],
    ['The resource was not found', 'no longer available', '已不存在'],
    ['Cannot read properties of undefined (reading "data")', 'contact your workspace administrator', '联系工作区管理员'],
    ['Could not find the function public.aitask_execute_command in the schema cache', 'contact your workspace administrator', '联系工作区管理员'],
    ['[object Object]', 'contact your workspace administrator', '联系工作区管理员'],
  ])('explains %s without exposing internal details', (raw, en, zh) => {
    expect(render(raw, 'en')).toContain(en);
    expect(render(raw, 'zh')).toContain(zh);
    expect(render(raw, 'en')).not.toContain(raw);
  });

  it('preserves useful application validation and typed messages', () => {
    const evidence = 'Add an output link or upload a deliverable file before sending this linked task for review or completing it.';
    expect(userFacingMessage(evidence)).toBe(evidence);
    expect(render('You do not have permission to make this change.', 'zh')).toBe('您没有进行此更改的权限。');
    const message = msg('task.statusUpdated', { status: 'In Progress' });
    expect(userFacingMessage(message)).toBe(message);
    expect(userFacingMessage(null)).toBe('');
    expect(userFacingMessage('')).toBe('');
    expect(userFacingMessage({ code: '42501', message: 'permission denied for table private_records' })).toEqual(msg('errors.permissionDenied'));
    expect(userFacingMessage({ unexpected: true })).toEqual(msg('errors.requestFailed'));
  });

  it('distinguishes saved-data recovery from software updates in both languages', () => {
    expect(render('Restore saved data', 'zh')).toBe('恢复已保存数据');
    expect(render('Reload saved data', 'zh')).toBe('重新加载已保存数据');
    expect(render('New saved data available', 'zh')).toBe('有新的已保存数据');
    expect(render('This revision changed elsewhere. Review the saved revision before saving.', 'zh')).not.toContain('最新版本');
  });
});
