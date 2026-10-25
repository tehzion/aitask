/** Live flags shared by mutation bookkeeping, remote projection and realtime coordination. */
export const workspaceMutationRuntime = { isApplyingRemoteSnapshot: false, isApplyingNotificationRead: false, localMutationEpoch: 0 };
