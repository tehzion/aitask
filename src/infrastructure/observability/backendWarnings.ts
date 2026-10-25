export type BackendWarning = 'pending-command-storage-full' | 'pending-member-storage-full';
let report: (warning: BackendWarning) => void = () => undefined;
/** Application composition owns presentation; transport only reports a typed event. */
export const configureBackendWarnings = (handler: (warning: BackendWarning) => void) => {
  const previous = report;
  report = handler;
  return () => { report = previous; };
};
export const reportBackendWarning = (warning: BackendWarning) => report(warning);
