import { describe, expect, it } from 'vitest';
import { getLearningTrack, getVisibleTutorials, searchTutorials, tutorials } from './tutorials';

describe('detailed tutorial catalogue', () => {
  it('covers the requested role priorities and all practical categories', () => {
    expect(getVisibleTutorials('projectManager').length).toBeGreaterThanOrEqual(10);
    expect(getVisibleTutorials('hod').length).toBeGreaterThanOrEqual(10);
    expect(getVisibleTutorials('staff').length).toBeGreaterThanOrEqual(10);
    expect(getVisibleTutorials('client').length).toBeGreaterThanOrEqual(8);
    expect(new Set(tutorials.map(tutorial => tutorial.category)).size).toBe(8);
  });

  it('filters by role and searches both English and Simplified Chinese copy', () => {
    const clientTutorials = getVisibleTutorials('client');
    expect(clientTutorials.some(tutorial => tutorial.id === 'create-task')).toBe(false);
    expect(searchTutorials(clientTutorials, 'download', 'en').some(tutorial => tutorial.id === 'download-deliverables')).toBe(true);
    expect(searchTutorials(clientTutorials, '下载', 'zh').some(tutorial => tutorial.id === 'download-deliverables')).toBe(true);
  });

  it('ranks business synonyms and searches instructional content', () => {
    const internal = getVisibleTutorials('projectManager');
    expect(searchTutorials(internal, 'assign task', 'en')[0]?.id).toBe('assign-task-to-hod');
    expect(searchTutorials(getVisibleTutorials('hod'), '更换负责人', 'zh')[0]?.id).toBe('change-assigned-staff');
    expect(searchTutorials(getVisibleTutorials('client'), '审核交付', 'zh')[0]?.id).toBe('approve-deliverables');
    expect(searchTutorials(internal, 'reviewer', 'en').some(tutorial => tutorial.id === 'review-completed-work')).toBe(true);
  });

  it('finds the documented English and Simplified Chinese task actions for the matching role', () => {
    const cases = [
      { persona: 'projectManager' as const, query: 'Assign task', locale: 'en' as const, expected: 'assign-task-to-hod' },
      { persona: 'hod' as const, query: 'Change staff', locale: 'en' as const, expected: 'change-assigned-staff' },
      { persona: 'projectManager' as const, query: 'Request revision', locale: 'en' as const, expected: 'request-task-revision' },
      { persona: 'hod' as const, query: 'Approve work', locale: 'en' as const, expected: 'approve-work' },
      { persona: 'staff' as const, query: 'Upload deliverable', locale: 'en' as const, expected: 'upload-deliverables' },
      { persona: 'projectManager' as const, query: '分配任务', locale: 'zh' as const, expected: 'assign-task-to-hod' },
      { persona: 'hod' as const, query: '更换负责人', locale: 'zh' as const, expected: 'change-assigned-staff' },
      { persona: 'projectManager' as const, query: '申请修改', locale: 'zh' as const, expected: 'request-task-revision' },
      { persona: 'hod' as const, query: '审核工作', locale: 'zh' as const, expected: 'approve-work' },
      { persona: 'staff' as const, query: '上传文件', locale: 'zh' as const, expected: 'upload-deliverables' },
    ];

    cases.forEach(({ persona, query, locale, expected }) => {
      expect(searchTutorials(getVisibleTutorials(persona), query, locale).some(tutorial => tutorial.id === expected), `${persona}: ${query}`).toBe(true);
    });
  });

  it('defines a visible learning track for every persona', () => {
    (['admin', 'projectManager', 'hod', 'staff', 'client'] as const).forEach(persona => {
      const ids = getLearningTrack(persona);
      expect(ids.length).toBeGreaterThan(0);
      ids.forEach(id => expect(getVisibleTutorials(persona).some(tutorial => tutorial.id === id)).toBe(true));
    });
  });

  it('gives every tutorial complete bilingual instructional sections and resolves related links', () => {
    const ids = new Set(tutorials.map(tutorial => tutorial.id));
    const traditionalOnly = /[於為與這個們從後裡讓說選擇點擊檢開啟]/;
    tutorials.forEach(tutorial => {
      expect(tutorial.title.en).toBeTruthy();
      expect(tutorial.title.zh).toBeTruthy();
      expect(tutorial.updatedAt).toMatch(/^2026-/);
      expect(tutorial.steps.length).toBeGreaterThanOrEqual(3);
      expect(tutorial.rules.length).toBeGreaterThan(0);
      expect(tutorial.problems.length).toBeGreaterThan(0);
      [tutorial.title, tutorial.summary, tutorial.outcome, ...tutorial.before, ...tutorial.steps, ...tutorial.rules, ...tutorial.problems, ...tutorial.keywords, ...(tutorial.searchTerms || [])].forEach(copy => {
        expect(copy.en.trim()).toBeTruthy();
        expect(copy.zh.trim()).toBeTruthy();
        expect(copy.zh).not.toMatch(traditionalOnly);
      });
      tutorial.related.forEach(relatedId => expect(ids.has(relatedId)).toBe(true));
      tutorial.guide?.forEach(step => {
        expect(step.title.en).toBeTruthy();
        expect(step.title.zh).toBeTruthy();
        expect(step.body.en).toBeTruthy();
        expect(step.body.zh).toBeTruthy();
      });
    });
  });
});
