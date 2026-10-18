import React from 'react';
import { BookOpen, CheckCircle2, CircleHelp, Clock3, Filter, GitBranch, LockKeyhole, MessageSquareText, RefreshCw, Route, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { useI18n } from '../components/I18nProvider';
import { Badge, Button, PageHeader, Surface, StatusChip } from '../components/ui';
import {
  getAllTutorialProgress,
  getHelpCopy,
  getOnboardingPersona,
  getRoleLabel,
  getStatusCopy,
  getWorkflowCopy,
  markTutorialStarted,
  markTutorialViewed,
} from '../lib/onboarding';
import {
  getLocalizedCopy,
  getLearningTrack,
  getTutorialById,
  getTutorialCategory,
  getVisibleTutorials,
  searchTutorials,
  TUTORIAL_GUIDE_START_EVENT,
  tutorialCategories,
  type Tutorial,
  type TutorialCategoryId,
} from '../lib/tutorials';
import { workflowGuides } from '../lib/workflowGuides';
import TutorialFeedback from '../components/TutorialFeedback';

const Help: React.FC = () => {
  const { locale, t } = useI18n();
  const currentUser = useStore(state => state.currentUser);
  const rolePermissions = useStore(state => state.rolePermissions);
  const [searchParams, setSearchParams] = useSearchParams();
  const persona = getOnboardingPersona(currentUser, rolePermissions);
  const roleLabel = getRoleLabel(persona, locale);
  const roleGuide = getHelpCopy(persona, locale);
  const workflow = getWorkflowCopy(locale);
  const statuses = getStatusCopy(locale);
  const [query, setQuery] = React.useState(searchParams.get('q') || '');
  const [category, setCategory] = React.useState<TutorialCategoryId | 'all'>((searchParams.get('category') as TutorialCategoryId | 'all') || 'all');
  const [selectedId, setSelectedId] = React.useState(searchParams.get('tutorial') || '');
  const [progressVersion, setProgressVersion] = React.useState(0);
  const zh = locale === 'zh';

  const visibleTutorials = React.useMemo(() => getVisibleTutorials(persona), [persona]);
  const visibleTutorialIds = React.useMemo(() => new Set(visibleTutorials.map(tutorial => tutorial.id)), [visibleTutorials]);
  const filteredTutorials = React.useMemo(() => searchTutorials(visibleTutorials, query, locale).filter(item => category === 'all' || item.category === category), [category, locale, query, visibleTutorials]);
  const selected = React.useMemo(() => {
    const candidate = getTutorialById(selectedId);
    return candidate && visibleTutorials.some(item => item.id === candidate.id) ? candidate : null;
  }, [selectedId, visibleTutorials]);
  const progress = React.useMemo(() => {
    void progressVersion;
    return currentUser?.id ? getAllTutorialProgress(currentUser.id) : {};
  }, [currentUser?.id, progressVersion]);
  const recentTutorials = React.useMemo(() => visibleTutorials
    .filter(item => Boolean(progress[item.id]?.lastViewedAt))
    .sort((left, right) => Date.parse(progress[right.id].lastViewedAt || '') - Date.parse(progress[left.id].lastViewedAt || ''))
    .slice(0, 3), [progress, visibleTutorials]);
  const recommendedTutorials = React.useMemo(() => visibleTutorials
    .filter(item => !progress[item.id]?.completedAt)
    .slice(0, 4), [progress, visibleTutorials]);
  const learningTutorials = React.useMemo(() => getLearningTrack(persona)
    .map(id => getTutorialById(id))
    .filter((item): item is Tutorial => Boolean(item && visibleTutorials.some(visible => visible.id === item.id))), [persona, visibleTutorials]);
  const completedLearningCount = learningTutorials.filter(item => progress[item.id]?.completedAt).length;
  const visibleWorkflowGuides = React.useMemo(() => persona === 'client' ? [] : workflowGuides, [persona]);

  const updateQuery = (next: { q?: string; category?: TutorialCategoryId | 'all'; tutorial?: string }) => {
    const params = new URLSearchParams(searchParams);
    if (next.q !== undefined) {
      if (next.q) params.set('q', next.q);
      else params.delete('q');
    }
    if (next.category !== undefined) {
      if (next.category !== 'all') params.set('category', next.category);
      else params.delete('category');
    }
    if (next.tutorial !== undefined) {
      if (next.tutorial) params.set('tutorial', next.tutorial);
      else params.delete('tutorial');
    }
    setSearchParams(params, { replace: true });
  };

  const openTutorial = (tutorial: Tutorial) => {
    if (!visibleTutorialIds.has(tutorial.id)) return;
    setSelectedId(tutorial.id);
    updateQuery({ tutorial: tutorial.id });
    if (currentUser?.id) markTutorialViewed(currentUser.id, tutorial.id);
    setProgressVersion(value => value + 1);
  };

  const startGuide = (tutorial: Tutorial) => {
    if (!currentUser?.id || !tutorial.guide?.length || !visibleTutorialIds.has(tutorial.id)) return;
    markTutorialStarted(currentUser.id, tutorial.id);
    setProgressVersion(value => value + 1);
    window.dispatchEvent(new CustomEvent(TUTORIAL_GUIDE_START_EVENT, { detail: { tutorialId: tutorial.id } }));
  };

  const restartOnboarding = () => window.dispatchEvent(new CustomEvent('aitask-start-onboarding'));

  React.useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setCategory((searchParams.get('category') as TutorialCategoryId | 'all') || 'all');
    setSelectedId(searchParams.get('tutorial') || '');
  }, [searchParams]);

  return (
    <div className="mx-auto w-full max-w-workspace space-y-6">
      <PageHeader
        title={zh ? '帮助与教程' : 'Help & tutorials'}
        description={zh ? '按您的角色查找实际工作流程、操作说明和状态规则。' : 'Find practical workflows, action guides, and status rules matched to your role.'}
        onboardingTarget="help-overview"
        action={(
          <Button onClick={restartOnboarding}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {t('Restart tutorial')}
          </Button>
        )}
      />

      <section className="grid gap-4 lg:grid-cols-[1.05fr_1.95fr]" aria-labelledby="help-role-guide-title">
        <Surface className="overflow-hidden p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><CircleHelp className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <p className="calm-eyebrow">{t('Matched to your access')}</p>
              <h2 id="help-role-guide-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{roleGuide.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">{roleGuide.intro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="purple">{roleLabel}</Badge>
            <Badge tone="slate">{t('Permission-aware')}</Badge>
          </div>
        </Surface>

        <Surface as="div" className="overflow-hidden p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-base font-semibold text-ink">{t('Your day-to-day checklist')}</h2>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {roleGuide.steps.map((item, index) => (
              <li key={item} className="flex gap-3 rounded-control bg-inset/70 px-3 py-3 text-sm leading-5 text-ink">
                <span className="calm-number flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-accent ring-1 ring-line/70">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Surface>
      </section>

      <section className="rounded-panel bg-surface p-5 ring-1 ring-line/80 sm:p-6" aria-labelledby="learning-checklist-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /><p className="calm-eyebrow">{t('Personal learning')}</p></div>
            <h2 id="learning-checklist-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{t('Your learning checklist')}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{t('Work through the guides that match your role. Nothing is required, and completed guides stay available to revisit.')}</p>
          </div>
          <span className="text-sm font-semibold text-muted">{t('{completed} of {total} completed', { completed: completedLearningCount, total: learningTutorials.length })}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-inset" aria-label={t('Learning progress')}><div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${learningTutorials.length ? (completedLearningCount / learningTutorials.length) * 100 : 0}%` }} /></div>
        <ol className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {learningTutorials.map((item, index) => {
            const completed = Boolean(progress[item.id]?.completedAt);
            return <li key={item.id} className="flex items-center gap-3 rounded-control border border-line/70 bg-inset/40 p-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${completed ? 'bg-accent text-white' : 'bg-surface text-accent ring-1 ring-line'}`}>{completed ? <CheckCircle2 className="h-4 w-4" aria-label={t('Completed')} /> : index + 1}</span>
              <button type="button" onClick={() => openTutorial(item)} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><span className="block truncate text-sm font-semibold text-ink">{getLocalizedCopy(item.title, locale)}</span><span className="mt-0.5 block text-xs text-muted">{completed ? t('Completed — revisit anytime') : t('Remaining')}</span></button>
              <span className="sr-only">{completed ? t('Completed') : t('Remaining')}</span>
            </li>;
          })}
        </ol>
      </section>

      <section className="rounded-panel bg-surface p-5 ring-1 ring-line/80 sm:p-6" aria-labelledby="tutorial-centre-title">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent"><Sparkles className="h-4 w-4" aria-hidden="true" /><p className="calm-eyebrow">{t('Practical learning')}</p></div>
            <h2 id="tutorial-centre-title" className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink">{t('Tutorial centre')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t('Find an action, read the exact steps, or let AiTask point out the safe place to begin.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{visibleTutorials.filter(item => progress[item.id]?.completedAt).length} {t('completed')}</span>
            <span aria-hidden="true">·</span>
            <span>{visibleTutorials.length} {t('tutorials available')}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative block">
            <span className="sr-only">{t('Search tutorials')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={event => { const value = event.target.value; setQuery(value); updateQuery({ q: value }); }}
              placeholder={t('Search tutorials by action')}
              aria-label={t('Search tutorials')}
              className="min-h-11 w-full rounded-control border border-line bg-canvas pl-10 pr-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <label className="relative block">
            <span className="sr-only">{t('Filter tutorial categories')}</span>
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <select value={category} onChange={event => { const value = event.target.value as TutorialCategoryId | 'all'; setCategory(value); updateQuery({ category: value }); }} aria-label={t('Filter tutorial categories')} className="min-h-11 w-full appearance-none rounded-control border border-line bg-canvas pl-10 pr-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25">
              <option value="all">{t('All categories')}</option>
              {tutorialCategories.map(item => <option key={item.id} value={item.id}>{getLocalizedCopy(item.label, locale)}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label={t('Tutorial categories')}>
          <button type="button" aria-pressed={category === 'all'} onClick={() => { setCategory('all'); updateQuery({ category: 'all' }); }} className={`min-h-10 shrink-0 rounded-control px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${category === 'all' ? 'bg-accent text-white dark:text-[rgb(var(--calm-accent-ink))]' : 'bg-inset text-muted hover:text-ink'}`}>{t('All')}</button>
          {tutorialCategories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => { setCategory(item.id); updateQuery({ category: item.id }); }} className={`min-h-10 shrink-0 rounded-control px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${category === item.id ? 'bg-accent text-white dark:text-[rgb(var(--calm-accent-ink))]' : 'bg-inset text-muted hover:text-ink'}`}>{getLocalizedCopy(item.label, locale)}</button>)}
        </div>

        {query.trim() === '' && category === 'all' && recommendedTutorials.length > 0 && (
          <div className="mt-6" aria-labelledby="recommended-tutorials-title">
            <div className="flex items-center justify-between gap-3"><h3 id="recommended-tutorials-title" className="text-sm font-semibold text-ink">{t('Recommended for you')}</h3><span className="text-xs text-muted">{roleLabel}</span></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recommendedTutorials.map(item => <TutorialCard key={item.id} tutorial={item} locale={locale} progress={progress[item.id]} onOpen={openTutorial} />)}
            </div>
          </div>
        )}

        {recentTutorials.length > 0 && query.trim() === '' && category === 'all' && (
          <div className="mt-6" aria-labelledby="recent-tutorials-title">
            <div className="flex items-center justify-between gap-3"><h3 id="recent-tutorials-title" className="text-sm font-semibold text-ink">{t('Recently viewed')}</h3><Clock3 className="h-4 w-4 text-muted" aria-hidden="true" /></div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">{recentTutorials.map(item => <TutorialCard key={item.id} tutorial={item} locale={locale} progress={progress[item.id]} onOpen={openTutorial} compact />)}</div>
          </div>
        )}

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">{query.trim() || category !== 'all' ? t('Matching tutorials') : t('All tutorials')}</h3><span className="text-xs text-muted">{filteredTutorials.length} {t('shown')}</span></div>
            {filteredTutorials.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{filteredTutorials.map(item => <TutorialCard key={item.id} tutorial={item} locale={locale} progress={progress[item.id]} selected={item.id === selected?.id} onOpen={openTutorial} />)}</div> : <div className="rounded-control border border-dashed border-line px-5 py-10 text-center"><Search className="mx-auto h-5 w-5 text-muted" aria-hidden="true" /><h3 className="mt-3 font-semibold text-ink">{t('No tutorials match')}</h3><p className="mt-1 text-sm leading-6 text-muted">{t('Try another action, clear the category, or search in English or Simplified Chinese.')}</p></div>}
          </div>

          <TutorialDetail tutorial={selected} locale={locale} userId={currentUser?.id} progress={selected ? progress[selected.id] : undefined} visibleTutorialIds={visibleTutorialIds} onOpen={openTutorial} onStartGuide={startGuide} onClose={() => { setSelectedId(''); updateQuery({ tutorial: '' }); }} />
        </div>
      </section>

      {visibleWorkflowGuides.length > 0 && <section className="rounded-panel bg-surface p-5 ring-1 ring-line/80 sm:p-6" aria-labelledby="workflow-guides-title">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><GitBranch className="h-5 w-5" aria-hidden="true" /></div><div><p className="calm-eyebrow">{t('Practical scenarios')}</p><h2 id="workflow-guides-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{t('Workflow learning guides')}</h2><p className="mt-1 text-sm leading-6 text-muted">{t('See who owns each handoff, what action is expected, and what outcome to check.')}</p></div></div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {visibleWorkflowGuides.map(guide => <details key={guide.id} className="group rounded-control border border-line/80 bg-inset/35 p-4 open:bg-surface">
            <summary className="cursor-pointer list-none text-base font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{getLocalizedCopy(guide.title, locale)}<span className="mt-1 block text-sm font-normal leading-5 text-muted">{getLocalizedCopy(guide.summary, locale)}</span></summary>
            <ol className="mt-4 space-y-3">
              {guide.stages.map((stage, index) => { const linked = getTutorialById(stage.tutorialId); return <li key={stage.id} className="relative pl-9"><span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{index + 1}</span>{index < guide.stages.length - 1 && <span className="absolute left-3 top-6 h-[calc(100%+0.75rem)] w-px bg-line" aria-hidden="true" />}<p className="text-xs font-semibold uppercase tracking-[0.06em] text-accent">{getLocalizedCopy(stage.role, locale)}</p><h3 className="mt-0.5 text-sm font-semibold text-ink">{getLocalizedCopy(stage.title, locale)}</h3><p className="mt-1 text-sm leading-5 text-muted">{getLocalizedCopy(stage.action, locale)}</p><p className="mt-1 text-xs leading-5 text-muted"><span className="font-semibold text-ink">{t('Outcome')}:</span> {getLocalizedCopy(stage.outcome, locale)}</p>{linked && visibleTutorialIds.has(linked.id) && <button type="button" onClick={() => openTutorial(linked)} className="mt-1 min-h-9 text-xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{t('Read linked tutorial')} →</button>}</li>; })}
            </ol>
            <div className="mt-4 rounded-control bg-surface px-3 py-2 text-xs leading-5 text-muted">{guide.rules.map(rule => <p key={rule.en}>{getLocalizedCopy(rule, locale)}</p>)}</div>
          </details>)}
        </div>
      </section>}

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]" aria-labelledby="help-workflow-title">
        <Surface className="overflow-hidden p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><Route className="h-5 w-5" aria-hidden="true" /></div>
            <div><p className="calm-eyebrow">{t('Who owns the next step')}</p><h2 id="help-workflow-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{workflow.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{workflow.intro}</p></div>
          </div>
          <ol className="mt-6 grid gap-3">{workflow.stages.map(([title, body], index) => <li key={title} className="grid gap-3 rounded-control border border-line/70 bg-surface p-4 sm:grid-cols-[10rem_1fr] sm:items-start"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="calm-number text-xs text-accent">0{index + 1}</span>{title}</div><p className="text-sm leading-6 text-muted">{body}</p></li>)}</ol>
        </Surface>

        <Surface as="div" className="overflow-hidden p-5 sm:p-6">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-amber-50 text-amber-700"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div><div><p className="calm-eyebrow">{t('Status controls assignment')}</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">{statuses.title}</h2></div></div>
          <p className="mt-4 text-sm leading-6 text-muted">{statuses.intro}</p>
          <div className="mt-5 space-y-4"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">{statuses.assignable.title}</p><div className="mt-2 flex flex-wrap gap-2">{statuses.assignable.items.map(item => <StatusChip key={item} tone="emerald" dot>{item}</StatusChip>)}</div></div><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">{statuses.locked.title}</p><div className="mt-2 flex flex-wrap gap-2">{statuses.locked.items.map(item => <StatusChip key={item} tone="amber" dot>{item}</StatusChip>)}</div></div></div>
          <p className="mt-5 rounded-control bg-inset px-3 py-3 text-sm leading-5 text-muted">{statuses.note}</p>
        </Surface>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label={zh ? '常见帮助' : 'Common help'}>
        {[
          { icon: MessageSquareText, title: zh ? '评论和反馈' : 'Comments and feedback', body: zh ? '用评论补充上下文。客户只能看到客户可见的内容。' : 'Use comments to add context. Clients only see client-visible activity.' },
          { icon: RefreshCw, title: zh ? '修订流程' : 'Revision flow', body: zh ? '需要修改时请求修订，任务会回到可继续处理的阶段。' : 'When work needs changes, request a revision and the task returns to a workable stage.' },
          { icon: ShieldCheck, title: zh ? '权限边界' : 'Permission boundaries', body: zh ? '教程和帮助内容只介绍您有权访问的工作。' : 'Tutorials and help only describe work your permissions can access.' },
        ].map(({ icon: Icon, title, body }) => <Surface key={title} className="p-5"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><h2 className="mt-4 text-base font-semibold text-ink">{title}</h2><p className="mt-1.5 text-sm leading-6 text-muted">{body}</p></Surface>)}
      </section>
    </div>
  );
};

const TutorialCard: React.FC<{ tutorial: Tutorial; locale: 'en' | 'zh'; progress?: { completedAt?: string; startedAt?: string }; selected?: boolean; compact?: boolean; onOpen: (tutorial: Tutorial) => void }> = ({ tutorial, locale, progress, selected, compact, onOpen }) => {
  const { t } = useI18n();
  const category = getTutorialCategory(tutorial.category);
  return (
    <button type="button" onClick={() => onOpen(tutorial)} aria-pressed={selected} className={`group w-full rounded-control border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${selected ? 'border-accent bg-accent-soft/50' : 'border-line/80 bg-surface hover:border-accent/50 hover:bg-inset/55'}`}>
      <div className="flex items-start justify-between gap-3"><span className="calm-eyebrow text-[10px]">{category ? getLocalizedCopy(category.label, locale) : ''}</span>{progress?.completedAt ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-label={t('Completed')} /> : tutorial.guide?.length ? <Sparkles className="h-4 w-4 shrink-0 text-accent/70" aria-label={t('Guide me available')} /> : null}</div>
      <h4 className={`${compact ? 'mt-2 text-sm' : 'mt-3 text-base'} font-semibold leading-5 text-ink`}>{getLocalizedCopy(tutorial.title, locale)}</h4>
      <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted">{getLocalizedCopy(tutorial.summary, locale)}</p>
      <span className="mt-4 inline-flex min-h-9 items-center text-xs font-semibold text-accent group-hover:underline">{compact ? t('Open guide') : t('Read guide')} <span aria-hidden="true" className="ml-1">→</span></span>
    </button>
  );
};

const TutorialDetail: React.FC<{ tutorial: Tutorial | null; locale: 'en' | 'zh'; userId?: string; progress?: { completedAt?: string; startedAt?: string; lastStep?: number }; visibleTutorialIds: ReadonlySet<string>; onOpen: (tutorial: Tutorial) => void; onStartGuide: (tutorial: Tutorial) => void; onClose: () => void }> = ({ tutorial, locale, userId, progress, visibleTutorialIds, onOpen, onStartGuide, onClose }) => {
  const { t } = useI18n();
  if (!tutorial) return <aside className="rounded-control border border-dashed border-line bg-inset/45 p-5 lg:sticky lg:top-6 lg:self-start"><BookOpen className="h-5 w-5 text-accent" aria-hidden="true" /><h3 className="mt-3 text-base font-semibold text-ink">{t('Choose a tutorial')}</h3><p className="mt-1 text-sm leading-6 text-muted">{t('Select a guide to read its prerequisites, exact steps, rules, and common fixes.')}</p></aside>;
  const category = getTutorialCategory(tutorial.category);
  const copy = (value: { en: string; zh: string }) => getLocalizedCopy(value, locale);
  return (
    <aside className="rounded-control border border-line/80 bg-inset/45 p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto" aria-labelledby="selected-tutorial-title">
      <div className="flex items-start justify-between gap-3"><div><p className="calm-eyebrow">{category ? copy(category.label) : ''}</p><h3 id="selected-tutorial-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink">{copy(tutorial.title)}</h3></div><button type="button" onClick={onClose} aria-label={t('Close guide details')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><X className="h-4 w-4" aria-hidden="true" /></button></div>
      <p className="mt-3 text-sm leading-6 text-muted">{copy(tutorial.outcome)}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Badge tone="slate">{t('Read guide')}</Badge>{tutorial.guide?.length ? <Badge tone="purple">{t('Guide me available')}</Badge> : null}{progress?.completedAt && <Badge tone="emerald">{t('Completed')}</Badge>}</div>
      <section className="mt-6" aria-labelledby="tutorial-before-title"><h4 id="tutorial-before-title" className="text-sm font-semibold text-ink">{t('Before you begin')}</h4><ul className="mt-2 space-y-2 text-sm leading-5 text-muted">{tutorial.before.map(item => <li key={item.en} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{copy(item)}</li>)}</ul></section>
      <section className="mt-6" aria-labelledby="tutorial-steps-title"><h4 id="tutorial-steps-title" className="text-sm font-semibold text-ink">{t('Step-by-step instructions')}</h4><ol className="mt-3 space-y-3">{tutorial.steps.map((item, index) => <li key={item.en} className="flex gap-3 text-sm leading-6 text-ink"><span className="calm-number flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-accent ring-1 ring-line/70">{index + 1}</span><span>{copy(item)}</span></li>)}</ol></section>
      <section className="mt-6 rounded-control bg-surface p-4 ring-1 ring-line/70" aria-labelledby="tutorial-rules-title"><h4 id="tutorial-rules-title" className="text-sm font-semibold text-ink">{t('Important rules')}</h4><ul className="mt-2 space-y-2 text-sm leading-5 text-muted">{tutorial.rules.map(item => <li key={item.en}>• {copy(item)}</li>)}</ul></section>
      <section className="mt-4 rounded-control border border-amber-200 bg-amber-50 p-4" aria-labelledby="tutorial-problems-title"><h4 id="tutorial-problems-title" className="text-sm font-semibold text-amber-950">{t('Common problems')}</h4><ul className="mt-2 space-y-2 text-sm leading-5 text-amber-950">{tutorial.problems.map(item => <li key={item.en}>• {copy(item)}</li>)}</ul></section>
      {tutorial.related.some(id => visibleTutorialIds.has(id)) && <section className="mt-6" aria-labelledby="tutorial-related-title"><h4 id="tutorial-related-title" className="text-sm font-semibold text-ink">{t('Related tutorials')}</h4><div className="mt-2 space-y-1">{tutorial.related.map(id => { const related = getTutorialById(id); return related && visibleTutorialIds.has(related.id) ? <button key={id} type="button" onClick={() => onOpen(related)} className="block min-h-10 w-full rounded-control px-2 text-left text-sm font-semibold text-accent transition hover:bg-surface hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{copy(related.title)}</button> : null; })}</div></section>}
      <TutorialFeedback tutorialId={tutorial.id} userId={userId} />
      <div className="mt-6 flex flex-col gap-2 sm:flex-row"><Button variant="secondary" onClick={() => onStartGuide(tutorial)} disabled={!tutorial.guide?.length}>{tutorial.guide?.length ? <><Sparkles className="h-4 w-4" aria-hidden="true" />{t('Guide me')}</> : <><BookOpen className="h-4 w-4" aria-hidden="true" />{t('Read guide')}</>}</Button>{progress?.startedAt && !progress.completedAt && <span className="self-center text-xs text-muted">{t('In progress')}</span>}</div>
    </aside>
  );
};

export default Help;
