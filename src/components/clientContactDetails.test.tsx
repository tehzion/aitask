import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from './I18nProvider';
import ClientContactDetails from './ClientContactDetails';
import type { ClientProfile } from '../types';

const render = (client: Partial<ClientProfile>) => renderToStaticMarkup(
  <I18nProvider><ClientContactDetails client={{ id: 'CL-1', clientName: 'MeTalk', createdAt: '', updatedAt: '', ...client } as ClientProfile} /></I18nProvider>,
);

describe('ClientContactDetails', () => {
  it('shows every saved contact detail with call and email links', () => {
    const html = render({ contactPerson: 'Adam', phone: '60 11 3969 9998', email: 'adam@example.com', address: 'Johor Bahru', website: 'https://metalk.example', facebookPage: 'https://facebook.com/metalk' });
    expect(html).toContain('Adam');
    expect(html).toContain('href="tel:601139699998"');
    expect(html).toContain('href="mailto:adam@example.com"');
    expect(html).toContain('Johor Bahru');
    expect(html).toContain('href="https://metalk.example"');
    expect(html).toContain('href="https://facebook.com/metalk"');
  });

  it('says so when nothing has been saved', () => {
    expect(render({})).toContain('No contact details saved yet.');
  });
});
