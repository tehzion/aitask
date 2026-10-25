import { type StoreState } from '../shared/types/workspaceStore';
import { legacyDemoTaskIds, retiredDemoUserIds } from './index';
import {
  isLocalServiceDemoRecordId,
  LOCAL_SERVICE_DEMO_VERSION,
  LOCAL_SERVICE_DEMO_VERSION_KEY
} from './localServiceDemo';
export const legacyDemoTaskIdSet = new Set<string>(legacyDemoTaskIds);

export const retiredDemoUserIdSet = new Set<string>(retiredDemoUserIds);

export const getLocalServiceDemoVersion = () => {
  try { return window.localStorage.getItem(LOCAL_SERVICE_DEMO_VERSION_KEY); }
  catch { return null; }
};

export const setLocalServiceDemoVersion = () => {
  try { window.localStorage.setItem(LOCAL_SERVICE_DEMO_VERSION_KEY, LOCAL_SERVICE_DEMO_VERSION); }
  catch { /* Zustand persistence will still retain the fixture data when storage is available. */ }
};

export const hasLocalServiceData = (state: Pick<StoreState,
  'servicePackages' | 'clientPlans' | 'serviceCycles' | 'deliverables' | 'cycleComments' | 'addons' | 'servicePricingSnapshots'
>) => (
  state.servicePackages.length > 0 ||
  state.clientPlans.length > 0 ||
  state.serviceCycles.length > 0 ||
  state.deliverables.length > 0 ||
  state.cycleComments.length > 0 ||
  state.addons.length > 0 ||
  state.servicePricingSnapshots.length > 0
);

export const replaceLocalServiceDemoRecords = <T extends { id: string }>(current: T[], fixture: T[]) => [
  ...current.filter(item => !isLocalServiceDemoRecordId(item.id)),
  ...fixture,
];
