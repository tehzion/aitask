export type Diagnostic = { name: 'startup.paint' | 'startup.long-task' | 'route.ready' | 'sync.request' | 'save' | 'conflict'; durationMs: number; outcome: 'ok' | 'failed' | 'timeout' | 'aborted'; at: number };
const samples: Diagnostic[] = [];
const listeners = new Set<() => void>();
export const recordDiagnostic = (name: Diagnostic['name'], durationMs: number, outcome: Diagnostic['outcome'] = 'ok') => {
  samples.push({ name, durationMs: Math.max(0, Math.round(durationMs)), outcome, at: Date.now() });
  if (samples.length > 100) samples.shift();
  listeners.forEach(listener => listener());
};
export const getDiagnostics = () => samples.map(sample => ({ ...sample }));
export const subscribeDiagnostics = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const registerPerformanceDiagnostics = () => {
  if (typeof PerformanceObserver === 'undefined') return;
  for (const type of ['paint', 'longtask']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => {
      recordDiagnostic(type === 'paint' ? 'startup.paint' : 'startup.long-task', type === 'paint' ? entry.startTime : entry.duration);
    }));
    observer.observe({ type, buffered: true });
  }
};
