import { describe, expect, it } from 'vitest';
import {
  createLocalServiceDemoFixture,
  getLocalServiceDemoFile,
  LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID,
} from './localServiceDemo';
import { getCycleServiceProgress } from '../lib/serviceManagement';

describe('local service demo fixture', () => {
  const fixture = createLocalServiceDemoFixture('2026-08-16', '2026-08-16T08:00:00.000Z');

  it('links all three plan-creation modes to stable client records', () => {
    expect(fixture.clients.map(client => client.clientName)).toEqual(['UrbanEats', 'TechNova', 'EcoLife']);
    expect(fixture.clientPlans.map(plan => plan.origin)).toEqual(['standard', 'customized', 'customized', 'custom']);
    expect(fixture.clientPlans.find(plan => plan.clientId === LOCAL_SERVICE_DEMO_URBAN_CLIENT_ID)?.status).toBe('Active');
    expect(fixture.clientPlans.find(plan => plan.clientName === 'TechNova' && plan.revision === 2)).toMatchObject({
      status: 'Draft',
      supersedesPlanId: 'demo-service-plan-technova-active',
      effectiveFromCycleStart: '2026-09-01',
    });
  });

  it('keeps package and client-plan service snapshots independent', () => {
    const packageVideo = fixture.servicePackages[0].serviceItems[0];
    const urbanVideo = fixture.clientPlans.find(plan => plan.clientName === 'UrbanEats')!.serviceItems[0];

    packageVideo.quantity = 99;
    expect(urbanVideo.quantity).toBe(3);
    expect(urbanVideo.workflow?.steps).toHaveLength(10);
  });

  it('provides a published cycle with complete, active, and remaining delivery work', () => {
    const cycle = fixture.serviceCycles.find(item => item.id === 'demo-service-cycle-urban-current')!;
    const progress = getCycleServiceProgress(cycle, fixture.deliverables);
    expect(cycle.status).toBe('Published');
    expect(fixture.deliverables.filter(item => item.cycleId === cycle.id && item.status === 'Delivered')).toHaveLength(2);
    expect(progress.reduce((sum, item) => sum + item.included, 0)).toBe(7);
    expect(progress.reduce((sum, item) => sum + item.remaining, 0)).toBe(5);
  });

  it('includes a frozen ten-step task chain plus client-visible and internal activity', () => {
    const chain = fixture.tasks.filter(task => task.deliverableId === 'demo-service-deliverable-urban-video-1');
    const visibleComment = fixture.cycleComments.find(comment => comment.visibility === 'client-visible')!;
    const internalComment = fixture.cycleComments.find(comment => comment.visibility === 'internal')!;

    expect(chain).toHaveLength(10);
    expect(chain.map(task => task.title.replace(/^\d+\.\s*/, ''))).toEqual([
      'Content Idea',
      'Script Writing',
      'Script Internal Review',
      'Client Script Approval',
      'Shooting',
      'Video Editing',
      'Internal Review',
      'Client Approval',
      'Revision',
      'Posting',
    ]);
    expect(chain[0].predecessorTaskIds).toEqual([]);
    expect(chain[5].predecessorTaskIds).toEqual([chain[4].id]);
    expect(chain.some(task => task.revisionCount === 1)).toBe(true);
    expect(chain.some(task => task.visibility === 'client-visible')).toBe(true);
    expect(visibleComment.attachments).toHaveLength(1);
    expect(getLocalServiceDemoFile(visibleComment.attachments[0])?.content).toContain('UrbanEats');
    expect(internalComment.text).toContain('hidden from the client portal');
  });

  it('contains active monthly and current-cycle one-off add-ons with pricing snapshots', () => {
    expect(fixture.addons.map(addon => addon.billingMode)).toEqual(['monthly', 'one_off']);
    expect(fixture.addons.every(addon => addon.pricingSnapshotId)).toBe(true);
    expect(fixture.servicePricingSnapshots.some(snapshot => snapshot.parentId === 'demo-service-plan-urban-active')).toBe(true);
  });
});
