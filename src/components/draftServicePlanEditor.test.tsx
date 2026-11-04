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
});
