import { useEffect } from 'react';
import { useStore } from '../store';
import { useBillingToday } from './useBillingToday';

/** Catch up local plans on sign-in, activation, and each new calendar day. */
export const useMonthlyServiceCycles = () => {
  const today = useBillingToday().getTime();
  const plans = useStore(state => state.clientPlans);
  const actor = useStore(state => state.currentUser);
  const loading = useStore(state => state.backend.isLoading);
  const mode = useStore(state => state.backend.mode);
  useEffect(() => {
    useStore.getState().generateDueLocalServiceCycles();
  }, [today, plans, actor, loading, mode]);
};
