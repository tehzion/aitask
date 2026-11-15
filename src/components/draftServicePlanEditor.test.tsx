import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './I18nProvider';
import DraftServicePlanEditor from './DraftServicePlanEditor';
import { useStore } from '../store';
import type { ClientServicePlan, User } from '../types';

const initial = useStore.getState();
const pm: User = { id: 'draft-editor-pm', name: 'Draft PM', role: 'Project Manager', department: 'Management', departments: ['Management'] };
const source = {
  id: 'PLN-source', clientId: 'CL-1', clientName: 'Dr Cermin Sdn Bhd', name: 'Social Media Plan', origin: 'custom', status: 'Active',
  revision: 1, startDate: '2026-09-16', billingDay: 16, nextCycleStart: '2026-11-16',
  serviceItems: [{ id: 'SI-1', name: 'Social Media Marketing', platforms: ['FB'], unit: 'item', quantity: 1, unitPriceMinor: 850000 }],
  discountType: 'none', discountValue: 0, taxRateBps: 800, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
} as unknown as ClientServicePlan;
// The draft was created before the 16 Oct cycle ran, so it still carries that boundary.
const draft = { ...source, id: 'PLN-draft', revision: 2, status: 'Draft', supersedesPlanId: source.id, revisionScheduleStatus: 'draft',
  effectiveFromCycleStart: '2026-10-16', startDate: '2026-10-16', nextCycleStart: undefined } as ClientServicePlan;

afterEach(() => { useStore.setState(initial, true); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('DraftServicePlanEditor', () => {
  it('proposes the source plan’s upcoming boundary instead of a draft date that has already passed', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 4, 12));
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en', setItem: () => undefined, removeItem: () => undefined }, location: { hostname: 'localhost' }, navigator: { language: 'en-GB' }, addEventListener: () => undefined, removeEventListener: () => undefined });
    useStore.setState({ currentUser: pm, users: [pm], clientPlans: [source, draft], rolePermissions: [] });
    const html = renderToStaticMarkup(<I18nProvider><DraftServicePlanEditor plan={draft} source={source} /></I18nProvider>);
    expect(html).toMatch(/Proposed start[^<]*16 Nov 2026/);
    expect(html).not.toContain('16 Oct 2026');
  });

  const renderEditor = (plan: ClientServicePlan, from: ClientServicePlan) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 4, 12));
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en', setItem: () => undefined, removeItem: () => undefined }, location: { hostname: 'localhost' }, navigator: { language: 'en-GB' }, addEventListener: () => undefined, removeEventListener: () => undefined });
    useStore.setState({ currentUser: pm, users: [pm], clientPlans: [from, plan], rolePermissions: [] });
    return renderToStaticMarkup(<I18nProvider><DraftServicePlanEditor plan={plan} source={from} /></I18nProvider>);
  };
  const startInput = (html: string) => html.match(/Start date<input[^>]*>/)?.[0] ?? '';

  it('lets a revision of an active plan start on a later billing date', () => {
    const html = renderEditor({ ...draft, startDate: '2026-12-16' } as ClientServicePlan, source);
    const input = startInput(html);
    expect(input).not.toMatch(/\sdisabled=""/);
    expect(input).toContain('min="2026-11-16"');
    expect(input).toContain('value="2026-12-16"');
    expect(html).toMatch(/Proposed start[^<]*16 Dec 2026/);
    expect(html).toContain('Pick one of this plan’s billing dates, from 16 Nov 2026, up to 12 months ahead.');
  });

  it('shows the next boundary in the field when the saved date has passed', () => {
    expect(startInput(renderEditor(draft, source))).toContain('value="2026-11-16"');
  });

  it('keeps the start date fixed when the plan being revised has ended', () => {
    expect(startInput(renderEditor(draft, { ...source, status: 'Ended' } as ClientServicePlan))).toMatch(/\sdisabled=""/);
  });
});
