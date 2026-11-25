import { describe, expect, it } from 'vitest';
import { getCompanyOwnerIds, getCompanyOwnerNames } from './companyOwners';

const client = { id: 'c1', clientName: 'MeTalk', createdBy: 'creator' };
const users = [{ id: 'creator', name: 'Ting Ting' }, { id: 'pm2', name: 'Adam PM' }];

describe('company owner', () => {
  it('falls back to the creator while no project has a PM', () => {
    expect(getCompanyOwnerIds(client, [{ clientId: 'c1', clientName: 'MeTalk' }])).toEqual(['creator']);
  });

  it('follows the project PM when it changes', () => {
    const projects = [{ clientId: 'c1', clientName: 'MeTalk', projectManagerIds: ['pm2'] }];
    expect(getCompanyOwnerNames(client, projects, users)).toEqual(['Adam PM']);
  });

  it('ignores projects of other companies', () => {
    const projects = [{ clientId: 'c2', clientName: 'MeTalk', projectManagerIds: ['pm2'] }];
    expect(getCompanyOwnerIds(client, projects)).toEqual(['creator']);
  });
});
