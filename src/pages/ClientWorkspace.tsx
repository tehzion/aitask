import { planStatusLabel, cycleStatusLabel } from '../lib/serviceStatusLabels';
import '../lib/pageCopy';
import ModalShell from '../components/ModalShell';
import '../lib/actionFeedbackCopy';
import { formatLocalizedDateRange } from '../lib/i18n';
import { getClientTaskTitle } from '../lib/clientPortal';
import { msg, type MessageDescriptor } from '../lib/messages';
import type { UiFeedback } from '../lib/actionFeedback';
import UnavailableWork from '../components/UnavailableWork';
import SystemMessage from '../components/SystemMessage';
import { DeliveryProgress } from '../components/DeliveryProgress';
import { useSaveAction } from '../hooks/useSaveAction';
import { captureWorkspaceSession, isWorkspaceSessionCurrent } from '../lib/workspaceSession';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  GitBranchPlus,
  Link2,
  ListChecks,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  StopCircle,
  X,
} from "lucide-react";
import { Link, Navigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { isPendingMutationResolution, useStore } from "../store";
import type {
  AttachmentRef,
  CommentVisibility,
  DeliverableStatus,
  ServiceCycle,
} from "../types";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  SegmentedTabs,
  StatusChip,
  Surface,
} from "../components/ui";
import { cardBase, inputBase, pageShell } from "../components/uiTokens";
import { cn, getTodayInputDate } from "../lib/utils";
import { parseOptionalDate } from "../lib/utils";
import { formatLocalizedDate } from "../lib/i18n";
import {
  calculatePlanTotalMinor,
  formatMoney,
  getCycleServiceProgress,
  canSetDeliverableStatus,
  isDeliverableWorkDone,
} from "../lib/serviceManagement";
import { getMonthlyCycleCloseout } from "../lib/monthlyCloseout";
import { getUnlinkedOpenTasks, rankLinkCandidates } from "../lib/deliveryLinks";
import { isTaskOpen } from "../lib/taskReporting";
import {
  canCreateManualTasks,
  canEditTask,
  canLinkTaskDelivery,
  canManageClientPlans,
  canManageServiceCycles,
  canOpenServiceClient,
  canViewServicePrices,
  getVisibleTasks,
  isDepartmentScopedUser,
} from "../lib/access";
import { SECURE_WORKSPACE_ID } from "../lib/secureWorkspace";
import { useI18n } from "../components/I18nProvider";
import {
  SERVICE_FILE_ACCEPT,
  SERVICE_FILE_MAX_BYTES,
  SERVICE_FILE_TYPE_ERROR,
  SERVICE_FILE_UPLOAD_UNAVAILABLE_ERROR,
  forgetPendingServiceFile,
  downloadServiceFile,
  getServiceFileMimeType,
  removeServiceFile,
  uploadServiceFile,
} from "../lib/serviceFiles";
import DraftServicePlanEditor from "../components/DraftServicePlanEditor";
import ClientSpecialNotes from "../components/ClientSpecialNotes";
import SideSheet from "../components/SideSheet";
import ClientServiceWorkspace from "../components/ClientServiceWorkspace";
import CreateClientPlanModal from "../components/CreateClientPlanModal";
import EditClientPlanDatesModal from "../components/EditClientPlanDatesModal";
import { useBillingToday } from "../hooks/useBillingToday";
import { resolveMonthlyRecord } from "../lib/monthlyRecords";
import MonthlyRecordPicker from "../components/MonthlyRecordPicker";
import { monthlyRecordLabel } from "../lib/monthlyRecords";
import RevisionRecoveryNotice from "../components/RevisionRecoveryNotice";
import ConfirmDialog from "../components/ConfirmDialog";
import MonthlyPlanSchedule from "../components/MonthlyPlanSchedule";
import CorrectDeliverableName from "../components/CorrectDeliverableName";
import ContextualTutorialLink from "../components/ContextualTutorialLink";

// Team feedback B (9 Nov 2026): Plan, Cycles and Overview are one tab.
type Tab = "delivery" | "activity";
const DeliveryReviewPanel = React.lazy(() => import('../components/DeliveryReviewPanel'));

const CLIENT_WORKSPACE_TABS_ID = "client-workspace";
type ActivityStage = "idle" | "uploading" | "saving";
type ActivityFeedback = {
  tone: "status" | "error";
  text: UiFeedback['message'];
  action?: "upload" | "save";
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const deliverableStatuses: DeliverableStatus[] = [
  "Planned",
  "In Progress",
  "Ready",
  "Delivered",
];

const OperationsClientWorkspace = () => {
  const { locale, t } = useI18n();
  const today = useBillingToday();
  const { clientId = "" } = useParams();
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const client = store.clients.find((item) => item.id === clientId);
  const tabParam = searchParams.get('tab');
  // Old deep links (?tab=overview|plan|cycles|addons) land on the merged tab.
  const tab: Tab = tabParam === 'activity' ? 'activity' : 'delivery';
  const setTab = (next: Tab) => setSearchParams(current => { const query = new URLSearchParams(current); query.set('tab', next); return query; });
  const [activityCycleId, setActivityCycleId] = React.useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = React.useState(false);
  const [planDatesOpen, setPlanDatesOpen] = React.useState(false);
  const [planSavePending, setPlanSavePending] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [visibility, setVisibility] =
    React.useState<CommentVisibility>("internal");
  const [file, setFile] = React.useState<File>();
  const [activityStage, setActivityStage] = React.useState<ActivityStage>("idle");
  const activityFileInputRef = React.useRef<HTMLInputElement>(null);
  const activityFormRef = React.useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = React.useState<UiFeedback | null>(null);
  const message = feedback?.message;
  const setMessage = (value: string | MessageDescriptor, tone: UiFeedback['tone'] = 'error') => setFeedback(value ? { message: value, tone } : null);
  const [downloadingFileId, setDownloadingFileId] = React.useState<string | null>(null);
  const [activityFeedback, setActivityFeedback] = React.useState<ActivityFeedback | null>(null);
  const [generatingAll, setGeneratingAll] = React.useState(false);
  const [activitySheetOpen, setActivitySheetOpen] = React.useState(false);
  const { busy: serviceSaving, run: runServiceAction } = useSaveAction(clientId);
  const [activitySaving, setActivitySaving] = React.useState(false);
  const [carryPending, setCarryPending] = React.useState<string | null>(null);
  const [carrySavePending, setCarrySavePending] = React.useState(false);
  const activityContext = React.useRef({ clientId, actorId: store.currentUser?.id });
  activityContext.current = { clientId, actorId: store.currentUser?.id };
  const activityDraft = React.useRef({ comment, file, visibility });
  activityDraft.current = { comment, file, visibility };
  const pendingActivity = React.useRef<{ comment: string; commentId: string; cycleId: string; file?: File; visibility: CommentVisibility; attachment?: AttachmentRef } | null>(null);
  useUnsavedChanges(Boolean(comment.trim() || file || activitySaving));
  React.useEffect(() => {
    setComment(''); setFile(undefined); setActivitySaving(false); setActivityStage('idle');
    setActivityFeedback(null); setActivitySheetOpen(false); pendingActivity.current = null; setActivityCycleId(null);
    if (activityFileInputRef.current) activityFileInputRef.current.value = '';
  }, [clientId, store.currentUser?.id]);
  const acknowledgeActivity = (submitted: NonNullable<typeof pendingActivity.current>) => {
    const current = activityDraft.current;
    const sameText = current.comment === submitted.comment;
    const sameFile = current.file === submitted.file;
    const sameVisibility = current.visibility === submitted.visibility;
    if (sameText) setComment('');
    if (sameFile) {
      setFile(undefined);
      if (activityFileInputRef.current) activityFileInputRef.current.value = '';
    }
    if (submitted.attachment) forgetPendingServiceFile(submitted.attachment);
    pendingActivity.current = null;
    setActivityFeedback(null);
    setMessage(msg('feedback.activityAdded'), 'success');
    if (sameText && sameFile && sameVisibility) setActivitySheetOpen(false);
  };
  const [planAction, setPlanAction] = React.useState<"pause" | "end" | null>(null);
  const planConfirmationTitleId = React.useId();
  React.useEffect(() => {
    setPlanAction(null); setPlanSavePending(false); setCarrySavePending(false); setMessage(''); setDownloadingFileId(null);
  }, [clientId, store.currentUser?.id]);
  useUnsavedChanges(serviceSaving);

  const [detailsPlanId, setDetailsPlanId] = React.useState<string | null>(null);
  const [activationConfirmOpen, setActivationConfirmOpen] = React.useState(false);
  const activationTitleId = React.useId();
  if (!client) return store.currentUser?.role === "Client" ? <Navigate to="/projects" replace /> : <UnavailableWork />;

  const canManagePlans = canManageClientPlans(
    store.currentUser,
    store.rolePermissions,
  );
  const canAddManualTask = canCreateManualTasks(store.currentUser, store.rolePermissions);
  const canManageCycles = canManageServiceCycles(
    store.currentUser,
    store.rolePermissions,
  );
  const canLinkTasks = getVisibleTasks(
    store.currentUser,
    store.tasks,
    store.rolePermissions,
    { clients: store.clients, projects: store.projects },
  )
    .filter(task => task.clientId === client.id)
    .some(task => canEditTask(
      store.currentUser,
      task,
      store.rolePermissions,
      { clients: store.clients, projects: store.projects },
    ));
  const canSeePrices = canViewServicePrices(
    store.currentUser,
    store.rolePermissions,
  );
  const isClient = store.currentUser?.role === "Client";
  // Team feedback F2: open tasks of this client that are not counted toward
  // any month yet, offered on each deliverable so progress can move.
  const linkCandidates = isClient ? [] : getUnlinkedOpenTasks(
    getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects }),
    store.deliverables,
    client.id,
  ).filter(task => canLinkTaskDelivery(store.currentUser, task, store.rolePermissions, { users: store.users, clients: store.clients, projects: store.projects }));
  if (!canOpenServiceClient(store.currentUser, client.clientName, store.tasks, store.rolePermissions, store.clients, store.projects)) {
    if (store.currentUser?.role === "Client") return <Navigate to="/projects" replace />;
    const departmentLead = isDepartmentScopedUser(store.currentUser, store.rolePermissions);
    return <UnavailableWork hint={departmentLead ? t('You can see this company through your department work, but no service workspace is assigned to you.') : undefined} />;
  }
  if (
    isClient &&
    store.currentUser?.companyName?.trim().toLowerCase() !==
      client.clientName.trim().toLowerCase()
  )
    return <Navigate to="/" replace />;

  const plans = store.clientPlans
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.revision - a.revision);
  const activeOrPausedPlan =
    plans.find((item) => item.status === "Active") ||
    plans.find((item) => item.status === "Paused");
  const renewalSourcePlan = activeOrPausedPlan || plans.find((item) => item.status === "Ended");
  const scheduledRevision = plans.find(
    (item) =>
      item.status === "Draft" && Boolean(item.supersedesPlanId),
  );
  const activePlan = activeOrPausedPlan || scheduledRevision || plans[0];
  const revisionSource = scheduledRevision?.supersedesPlanId
    ? plans.find(item => item.id === scheduledRevision.supersedesPlanId)
    : activeOrPausedPlan;
  const allCycles = store.serviceCycles
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const cycles = isClient
    ? allCycles.filter(
        (item) => item.status === "Published" || item.status === "Completed",
      )
    : allCycles;
  let requestedCycle = searchParams.get('cycleId');
  if (!requestedCycle && location.hash.startsWith('#cycle-')) {
    try { requestedCycle = decodeURIComponent(location.hash.slice(7)); } catch { requestedCycle = location.hash; }
  }
  const monthly = resolveMonthlyRecord(cycles, client.id, getTodayInputDate(today), requestedCycle, new Set(plans.map(plan => plan.id)));
  const selectedCycle = monthly.selected;
  const activityCycle = cycles.find(item => item.id === activityCycleId) || selectedCycle;
  const canAddActivityForCycle = Boolean(canManageCycles
    || (activityCycle && store.currentUser
      && canOpenServiceClient(store.currentUser, activityCycle.clientName, store.tasks, store.rolePermissions, store.clients, store.projects)
      && store.tasks.some(task => task.serviceCycleId === activityCycle.id && task.assignedTo === store.currentUser!.id)));
  const capturedPlan = selectedCycle ? plans.find(plan => plan.id === selectedCycle.planId) : undefined;
  const displayPlan = selectedCycle ? {
    ...(capturedPlan || activePlan), id: selectedCycle.planId, name: capturedPlan?.name || `${t('Plan revision')} ${selectedCycle.planRevision}`,
    revision: selectedCycle.planRevision, serviceItems: selectedCycle.serviceItems,
    discountType: selectedCycle.discountType, discountValue: selectedCycle.discountValue, taxRateBps: selectedCycle.taxRateBps,
  } : !monthly.unavailable && activePlan?.status === 'Draft' ? activePlan : undefined;
  const selectMonth = (id: string | null) => setSearchParams(current => { const query = new URLSearchParams(current); if (id) query.set('cycleId', id); else query.delete('cycleId'); return query; });
  const deliverables = store.deliverables.filter(
    (item) => item.clientId === client.id,
  );
  const comments = store.cycleComments.filter(
    (item) =>
      item.clientId === client.id &&
      (!isClient || item.visibility === "client-visible") && item.cycleId === selectedCycle?.id,
  );
  const tasks = getVisibleTasks(store.currentUser, store.tasks, store.rolePermissions, { clients: store.clients, projects: store.projects }).filter(
    (item) =>
      item.clientId === client.id &&
      (!isClient || item.visibility !== "internal"),
  );
  const planTotals = displayPlan ? calculatePlanTotalMinor(displayPlan.serviceItems, displayPlan.discountType, displayPlan.discountValue, displayPlan.taxRateBps) : null;
  const currentCycle = selectedCycle && ['Published', 'Completed'].includes(selectedCycle.status) ? selectedCycle : undefined;
  const currentCycleDeliverables = currentCycle
    ? deliverables.filter((item) => item.cycleId === currentCycle.id)
    : [];
  const currentDelivered = currentCycleDeliverables.filter(isDeliverableWorkDone).length;
  const currentConfirmed = currentCycleDeliverables.filter((item) => item.status === "Delivered").length;


  const saveAndCommit = async (
    result: { ok: boolean; error?: string },
    command: Parameters<typeof store.commitPendingMutation>[0],
  ): Promise<boolean> => {
    if (!result.ok) {
      setMessage(result.error || "Unable to save this change.");
      return false;
    }
    const saved = await runServiceAction(() => store.commitPendingMutation(command));
    if (!saved) return false;
    setPlanSavePending(command === 'client_plan.manage' && !saved.ok && isPendingMutationResolution(useStore.getState().backend));
    setMessage(
      saved.ok ? msg('feedback.changesSaved') : saved.error || "The change is waiting to be saved.",
      saved.ok ? 'success' : 'error',
    );
    return saved.ok;
  };
  const confirmPlanAction = async () => {
    if (!activePlan || !planAction || serviceSaving) return;
    const saved = await saveAndCommit(
      store.setClientPlanStatus(activePlan.id, planAction === "pause" ? "Paused" : "Ended"),
      "client_plan.manage",
    );
    if (saved) setPlanAction(null);
  };
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activitySaving) return;
    if (pendingActivity.current) { await retryActivitySave(); return; }
    const cycle = cycles.find(item => item.id === activityCycleId);
    if (!cycle)
      return setActivityFeedback({ tone: "error", text: canManageCycles ? "Create a month before adding activity." : "No month is available for this activity. Ask your project manager to start one." });
    if (file && file.size > SERVICE_FILE_MAX_BYTES) {
      setActivityFeedback({ tone: "error", text: t("Files must be 100 MB or smaller."), action: pendingActivity.current ? "save" : undefined });
      return;
    }
    const submitted = { comment, file, visibility, cycleId: cycle.id };
    const session = captureWorkspaceSession();
    const actorId = store.currentUser?.id;
    const requestClientId = clientId;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && activityContext.current.clientId === requestClientId && activityContext.current.actorId === actorId;
    setActivitySaving(true);
    setActivityStage(file ? "uploading" : "saving");
    let attachment: AttachmentRef | undefined;
    if (file && store.currentUser) {
      setActivityFeedback({ tone: "status", text: "Uploading file…" });
      const uploaded = await uploadServiceFile({
        file,
        workspaceId: SECURE_WORKSPACE_ID,
        clientId: client.id,
        cycleId: cycle.id,
        userId: store.currentUser.id,
      });
      if (!isCurrent()) return;
      if (uploaded.ok === false) {
        setActivitySaving(false);
        setActivityStage("idle");
        return setActivityFeedback({
          tone: "error",
          text: uploaded.error || "The file could not be uploaded.",
          action: uploaded.error === SERVICE_FILE_UPLOAD_UNAVAILABLE_ERROR ? undefined : "upload",
        });
      }
      attachment = uploaded.attachment;
    }
    setActivityStage("saving");
    setActivityFeedback({ tone: "status", text: "Saving activity…" });
    const previousCycleComments = useStore.getState().cycleComments;
    const result = store.addCycleComment(cycle.id, comment, visibility);
    if (!result.ok || !result.id) {
      if (attachment) await removeServiceFile(attachment);
      setActivitySaving(false);
      setActivityStage("idle");
      return setActivityFeedback({ tone: "error", text: result.error || "Unable to add the comment." });
    }
    if (attachment) {
      const attachmentResult = store.addCycleCommentAttachment(result.id, attachment);
      if (!attachmentResult.ok) {
        useStore.setState({ cycleComments: previousCycleComments });
        const cleanup = await removeServiceFile(attachment);
        setActivitySaving(false);
        setActivityStage("idle");
        return setActivityFeedback({
          tone: "error",
          text: cleanup.ok ? (attachmentResult.error || "Unable to attach the uploaded file.") : "Unable to attach the uploaded file. The uploaded file was kept and could not be removed automatically.",
        });
      }
    }
    const pending = { ...submitted, attachment, commentId: result.id };
    pendingActivity.current = pending;
    try {
      const saved = await store.commitPendingMutation("cycle_comment.manage");
      if (!isCurrent()) return;
      if (!saved.ok) {
        setActivityFeedback({ tone: "error", text: saved.error || "The activity is waiting to be saved.", action: "save" });
        return;
      }
      acknowledgeActivity(pending);
    } catch (failure) {
      if (isCurrent()) setActivityFeedback({ tone: "error", text: failure instanceof Error ? failure.message : t("The activity is waiting to be saved."), action: "save" });
    } finally {
      if (isCurrent()) { setActivitySaving(false); setActivityStage("idle"); }
    }
  };

  const retryActivitySave = async () => {
    const submitted = pendingActivity.current;
    if (activitySaving || !submitted) return;
    const session = captureWorkspaceSession();
    const actorId = store.currentUser?.id;
    const requestClientId = clientId;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && activityContext.current.clientId === requestClientId && activityContext.current.actorId === actorId;
    setActivitySaving(true);
    setActivityStage("saving");
    setActivityFeedback({ tone: "status", text: "Saving activity…" });
    try {
      const saved = await store.retryPendingSave("cycle_comment.manage");
      if (!isCurrent()) return;
      if (!saved.ok) { setActivityFeedback({ tone: "error", text: saved.error || "The activity is waiting to be saved.", action: "save" }); return; }
      if (!useStore.getState().cycleComments.some(item => item.id === submitted.commentId)) {
        pendingActivity.current = null;
        setActivityFeedback({ tone: "error", text: t("The pending activity is no longer available. Review your draft before saving again.") });
        return;
      }
      acknowledgeActivity(submitted);
    } catch (failure) {
      if (isCurrent()) setActivityFeedback({ tone: "error", text: failure instanceof Error ? failure.message : t("The activity is waiting to be saved."), action: "save" });
    } finally {
      if (isCurrent()) { setActivitySaving(false); setActivityStage("idle"); }
    }
  };

  // Team feedback H: one action. A plan that starts this month (or earlier) is
  // activated and its month published in one confirmed step; a later start is
  // activated only, and that month shows Publish when it is due.
  const planToActivate = canManagePlans && activePlan?.status === "Draft" && !activePlan.supersedesPlanId ? activePlan : undefined;
  const activationPublishesNow = Boolean(planToActivate && planToActivate.startDate <= getTodayInputDate(today));
  const activationTaskCount = planToActivate
    ? planToActivate.serviceItems.reduce((sum, item) => sum + item.quantity * (item.workflow?.steps.length || 0), 0)
    : 0;
  const activatePlan = async () => {
    if (!planToActivate || serviceSaving) return;
    const result = store.activateClientPlan(planToActivate.id);
    if (!(await saveAndCommit(result, "client_plan.manage"))) return;
    if (activationPublishesNow && result.cycleId) {
      const cycle = useStore.getState().serviceCycles.find(item => item.id === result.cycleId);
      if (cycle?.status === "Draft") await saveAndCommit(useStore.getState().setServiceCycleStatus(cycle.id, "Published"), "service_cycle.manage");
    }
    setActivationConfirmOpen(false);
    if (result.cycleId) selectMonth(result.cycleId);
  };
  const detailsPlan = store.clientPlans.find(item => item.id === detailsPlanId && item.clientId === client.id);
  const editDetails = async () => {
    if (!activePlan || !canManagePlans) return;
    if (activePlan.status === 'Draft') { setDetailsPlanId(activePlan.id); return; }
    const result = store.createClientPlanRevision(activePlan.id);
    if (await saveAndCommit(result, 'client_plan.manage')) setDetailsPlanId(result.planId || null);
  };
  const createRevision = async () => {
    if (!renewalSourcePlan || serviceSaving) return;
    const result = store.createClientPlanRevision(renewalSourcePlan.id);
    const saved = await saveAndCommit(result, "client_plan.manage");
    if (saved) requestAnimationFrame(() => document.getElementById('next-month-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const viewNextPlan = () => requestAnimationFrame(() => document.getElementById('next-month-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const retryPlanSave = async () => {
    const saved = await runServiceAction(() => store.retryPendingSave('client_plan.manage'));
    if (!saved) return;
    setPlanSavePending(!saved.ok && isPendingMutationResolution(useStore.getState().backend));
    setMessage(saved.ok ? msg('feedback.changesSaved') : saved.error || 'The change is waiting to be saved.', saved.ok ? 'success' : 'error');
  };
  const linkExistingTask = async (taskId: string, cycleId: string, deliverableId: string) => {
    if (serviceSaving || !taskId) return;
    const saved = await saveAndCommit(store.linkTaskToDeliverable(taskId, cycleId, deliverableId), "task.update");
    if (saved) setMessage(msg('feedback.changesSaved'), 'success');
  };
  // F3: publish late, cancel or close a month that has ended.
  const setMonthStatus = async (cycleId: string, status: ServiceCycle["status"]) => {
    if (serviceSaving) return;
    await saveAndCommit(store.setServiceCycleStatus(cycleId, status), "service_cycle.manage");
  };
  // F6: correct a deliverable name in a published month, with a reason kept
  // as an internal note on that month.
  const correctDeliverableName = async (deliverableId: string, cycleId: string, title: string, reason: string) => {
    if (serviceSaving) return false;
    const result = store.correctDeliverableName(deliverableId, title);
    const renamed = await saveAndCommit(result, "deliverable.manage");
    if (!renamed || !result.ok) return false;
    const note = t('Name corrected from "{from}" to "{to}". Reason: {reason}', { from: result.previousTitle || '', to: title, reason });
    const noted = await saveAndCommit(useStore.getState().addCycleComment(cycleId, note, 'internal'), "cycle_comment.manage");
    // The name is already saved. If the note is still queued (for example the
    // connection dropped), it is retried automatically; say so instead of
    // "Changes saved", and do not ask the user to submit it again.
    if (!noted) setMessage(t('The new name is saved. The reason note is still saving and will finish when the connection is back.'));
    return true;
  };
  const generateTaskChain = async (deliverableId: string) => {
    if (serviceSaving) return;
    const result = store.generateDeliverableTaskChain(deliverableId);
    await saveAndCommit(result, "deliverable.workflow.generate");
  };
  // One deliverable at a time: each chain is confirmed before the next starts,
  // and the run stops at the first failure so nothing is left half-saved.
  const generateAllTaskChains = async (deliverableIds: string[]) => {
    if (serviceSaving || generatingAll) return;
    setGeneratingAll(true);
    try {
      for (const deliverableId of deliverableIds) {
        const saved = await saveAndCommit(useStore.getState().generateDeliverableTaskChain(deliverableId), "deliverable.workflow.generate");
        if (!saved) return;
      }
    } finally {
      setGeneratingAll(false);
    }
  };
  const carryForward = async (taskId: string, targetCycleId: string, targetDeliverableId?: string) => {
    if (serviceSaving || carryPending) return;
    setCarryPending(taskId);
    try {
      const result = store.carryForwardTaskToCycle(taskId, targetCycleId, targetDeliverableId);
      const saved = await saveAndCommit(result, "task.create");
      setCarrySavePending(!saved && isPendingMutationResolution(useStore.getState().backend));
      if (saved) setMessage(msg('feedback.taskCarriedForward'), 'success');
    } finally {
      setCarryPending(null);
    }
  };
  const retryCarryForward = async () => {
    if (carryPending) return;
    setCarryPending('retry');
    try {
      const saved = await runServiceAction(() => store.retryPendingSave('task.create'));
      if (saved.ok) {
        setCarrySavePending(false);
        setMessage(msg('feedback.taskCarriedForward'), 'success');
      } else {
        setMessage(saved.error || 'The carried work is waiting to be saved.');
      }
    } finally {
      setCarryPending(null);
    }
  };
  const download = async (attachment: AttachmentRef) => {
    if (downloadingFileId) return;
    const session = captureWorkspaceSession();
    const requestClientId = clientId;
    const actorId = store.currentUser?.id;
    const isCurrent = () => isWorkspaceSessionCurrent(session) && activityContext.current.clientId === requestClientId && activityContext.current.actorId === actorId;
    setDownloadingFileId(attachment.id); setMessage('');
    try {
      const downloaded = await downloadServiceFile(attachment, { isCurrent });
      if (isCurrent()) setMessage(downloaded.ok ? msg('feedback.downloadStarted') : downloaded.error, downloaded.ok ? 'success' : 'error');
    } catch (failure) {
      if (isCurrent()) setMessage(failure instanceof Error ? failure.message : 'The file could not be downloaded.');
    } finally { if (isCurrent()) setDownloadingFileId(null); }
  };

  const tabs: { id: Tab; label: string; compactLabel?: string }[] = [
    { id: "delivery", label: t("Plan & delivery") },
    { id: "activity", label: t("Activity / Files"), compactLabel: t("Activity") },
  ];

  return (
    <div className={pageShell}>
      <Link
        to="/projects"
        className="inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-semibold text-muted hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/35"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("Back to companies")}
      </Link>
      <PageHeader
        compact
        title={<span data-i18n-skip>{client.clientName}</span>}
        description={t("Plan details, months, deliverables, and shared files.")}
        onboardingTarget="service-plan"
        meta={
          <>
            <StatusChip tone={activePlan?.status === "Active" ? "emerald" : activePlan?.status === "Paused" ? "amber" : "slate"}>{activePlan ? t(planStatusLabel(activePlan.status)) : t("No plan")}</StatusChip>
            {currentCycle && <span>{formatLocalizedDate(parseOptionalDate(currentCycle.periodStart)!, locale)} – {formatLocalizedDate(parseOptionalDate(currentCycle.periodEnd)!, locale)}</span>}
            {activePlan?.contractEndDate && <span>{t("Renewal date")} {formatLocalizedDate(parseOptionalDate(activePlan.contractEndDate)!, locale)}</span>}
          </>
        }
        action={
          planToActivate ? (
            <Button onClick={() => setActivationConfirmOpen(true)}>
              <Play className="h-4 w-4" />{t(activationPublishesNow ? "Start plan and this month" : "Start plan")}
            </Button>
          ) : null
        }
      />
      {activationConfirmOpen && planToActivate && <ModalShell labelledBy={activationTitleId} onClose={() => { if (!serviceSaving) setActivationConfirmOpen(false); }} panelClassName="max-w-lg"><div className="p-5">
        <h2 id={activationTitleId} className="font-semibold text-ink">{t(activationPublishesNow ? "Start plan and this month" : "Start plan")}</h2>
        <p className="mt-2 text-sm text-muted">{activationPublishesNow
          ? t("This starts the plan and this month. The team can begin work, and the client will see this month's deliverables.")
          : t("This starts the plan. Its first month begins on {date}.").replace("{date}", formatLocalizedDate(parseOptionalDate(planToActivate.startDate)!, locale))}</p>
        <ul className="mt-4 divide-y divide-line/70 rounded-control border border-line text-sm">
          {planToActivate.serviceItems.map(item => <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2"><span data-i18n-skip className="font-medium text-ink">{item.name}</span><span className="text-muted">{item.quantity} <span data-i18n-skip>{item.unit}</span></span></li>)}
          {planToActivate.serviceItems.length === 0 && <li className="px-3 py-2 text-muted">{t("No services in this plan yet.")}</li>}
        </ul>
        {activationPublishesNow && activationTaskCount > 0 && <p className="mt-3 text-sm text-muted">{t("{count} workflow tasks can then be generated from this month.", { count: activationTaskCount })}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={serviceSaving} onClick={() => setActivationConfirmOpen(false)}>{t("Cancel")}</Button>
          <Button disabled={serviceSaving} onClick={() => void activatePlan()}><Play className="h-4 w-4" />{t(activationPublishesNow ? "Start plan and this month" : "Start plan")}</Button>
        </div>
      </div></ModalShell>}
      {detailsPlan && canManagePlans && <ModalShell labelledBy="plan-details-title" onClose={() => setDetailsPlanId(null)} panelClassName="max-w-4xl"><div className="p-4"><h2 id="plan-details-title" className="mb-4 font-semibold">{t('Edit details')}</h2><DraftServicePlanEditor key={`${store.currentUser?.authUserId || store.currentUser?.id}:${detailsPlan.id}`} plan={detailsPlan} source={store.clientPlans.find(item => item.id === detailsPlan.supersedesPlanId) || detailsPlan} /><Button variant="secondary" className="mt-4" onClick={() => setDetailsPlanId(null)}>{t('Close')}</Button></div></ModalShell>}
      {canManagePlans && <div className="flex justify-end"><ContextualTutorialLink tutorialId="manage-service-plans" label={t("How do service plans work?")} /></div>}
      <div className="sticky top-[4.5rem] z-20 border-b border-line/80 bg-canvas/95 py-3 backdrop-blur-md">
        <SegmentedTabs<Tab> items={tabs} value={tab} onChange={next => {
          setTab(next);
        }} label={t("Client workspace")} idPrefix={CLIENT_WORKSPACE_TABS_ID} />
      </div>
      <MonthlyRecordPicker records={monthly.available} selected={selectedCycle} current={monthly.current} unavailable={monthly.unavailable} onChange={selectMonth} />
      {canManagePlans && <RevisionRecoveryNotice plans={plans} activePlan={activePlan} />}
      {message && (
        <div
          className="rounded-control border border-line bg-inset px-4 py-3 text-sm font-medium text-ink"
          role={feedback?.tone === 'error' ? 'alert' : 'status'}
          aria-live={feedback?.tone === 'error' ? 'assertive' : 'polite'}
        >
          <SystemMessage message={message} />
          {planSavePending && <Button className="mt-3" variant="secondary" onClick={() => void retryPlanSave()}>{t('Retry plan save')}</Button>}
          {carrySavePending && <Button className="mt-3" variant="secondary" onClick={() => void retryCarryForward()}>{t('Retry carried work')}</Button>}
        </div>
      )}

      {(
        <div hidden={tab !== 'delivery'} style={tab !== 'delivery' ? { display: 'none' } : undefined} id={`${CLIENT_WORKSPACE_TABS_ID}-panel-delivery`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-delivery`} tabIndex={0} className="scroll-mt-36 space-y-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <div className={cn("grid gap-5", !isClient && "xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]")}>
          <Surface variant="inset" className="p-6 sm:p-8">
            <h2 className="calm-eyebrow">{t('Delivery progress')}</h2>
            <DeliveryProgress published={Boolean(currentCycle)} total={currentCycleDeliverables.length} delivered={currentDelivered} confirmed={isClient ? undefined : currentConfirmed}
              draft={!isClient && allCycles.some(item => item.status === 'Draft' && parseOptionalDate(item.periodStart) && parseOptionalDate(item.periodEnd) && parseOptionalDate(item.periodStart)! <= today && today <= parseOptionalDate(item.periodEnd)!)} />
            {!isClient && <div id="delivery-review" className="scroll-mt-36"><React.Suspense fallback={null}><DeliveryReviewPanel clientId={client.id} includeOpenTasks /></React.Suspense></div>}
          </Surface>
            {!isClient && <ClientSpecialNotes client={client} />}
          </div>
          {activePlan && <MonthlyPlanSchedule plan={activePlan} cycles={cycles} deliverables={store.deliverables} today={today} canManagePlans={canManagePlans} canManageCycles={!isClient && canManageCycles} busy={serviceSaving} onSetCycleStatus={(id, status) => void setMonthStatus(id, status)} onEditDetails={() => void editDetails()} upcomingPlan={scheduledRevision} onCreateNextPlan={() => void createRevision()} onViewNextPlan={viewNextPlan} onViewCycle={id => selectMonth(id)} onViewHistory={() => selectMonth(null)} />}
          {(selectedCycle ? [selectedCycle] : []).map((cycle) => {
            const cycleDeliverables = deliverables.filter(
              (item) => item.cycleId === cycle.id,
            );
            const nextCycle = allCycles
              .filter(item => item.clientId === cycle.clientId && item.status !== 'Cancelled' && item.periodStart > cycle.periodStart)
              .sort((left, right) => left.periodStart.localeCompare(right.periodStart))[0];
            const progress = getCycleServiceProgress(cycle, cycleDeliverables);
            const closeout = getMonthlyCycleCloseout(cycle, cycleDeliverables, tasks, today);
            const includedTotal = progress.reduce((sum, item) => sum + item.included, 0);
            return (
              <section
                key={cycle.id} id={`cycle-${cycle.id}`}
                className={cn(cardBase, "overflow-hidden")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-ink">
                      {formatLocalizedDateRange(cycle.periodStart, cycle.periodEnd, locale)}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {cycleDeliverables.length} {t("deliverables")} · {t("plan revision")}{" "}
                      {cycle.planRevision}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        cycle.status === "Published" ||
                        cycle.status === "Completed"
                          ? "emerald"
                          : "slate"
                      }
                    >
                      {t(cycleStatusLabel(cycle.status))}
                    </Badge>
                    {canManageCycles && cycle.status === "Draft" && (
                      <Button
                        title={t("Starting this month lets the team begin work and makes its deliverables visible to the client.")}
                        onClick={() =>
                          void saveAndCommit(
                            store.setServiceCycleStatus(cycle.id, "Published"),
                            "service_cycle.manage",
                          )
                        }
                      >
                        <Send className="h-4 w-4" />
                        {t("Start month")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="border-b border-line bg-inset/70 px-5 py-5">
                  {/* The month's % lives in the delivery summary above; this block keeps the closeout figures. */}
                  {cycle.status === 'Draft' && <p className="text-sm text-muted">{t('Planned deliverables')}: {includedTotal}</p>}
                  {progress.length > 1 && <p className="mt-2 text-xs text-muted">{progress.map((item) => item.name).join(" · ")}</p>}
                  <section aria-label={t('Month closeout')} className={cn((cycle.status === 'Draft' || progress.length > 1) && "mt-5 border-t border-line/70 pt-4")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><h3 className="text-sm font-semibold text-ink">{t('Month closeout')}</h3><p className="mt-1 text-xs text-muted">{closeout.isReadyToClose ? t('All deliverables and tasks are complete.') : t('Resolve the remaining work before closing this month.')}</p></div>
                      <Badge tone={closeout.isReadyToClose ? 'emerald' : closeout.overdueTasks > 0 ? 'red' : 'amber'}>{t(closeout.isReadyToClose ? 'Ready to close' : 'In progress')}</Badge>
                    </div>
                    {/* The % is shown once, in the delivery summary at the top of the tab. */}
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
                      <div><span className="calm-number block text-lg font-semibold text-ink">{closeout.openTasks}</span>{t('Open tasks')}</div>
                      <div><span className="calm-number block text-lg font-semibold text-ink">{closeout.overdueTasks}</span>{t('Overdue tasks')}</div>
                      <div><span className="calm-number block text-lg font-semibold text-ink">{closeout.waitingApproval}</span>{t('Waiting approval')}</div>
                      <div><span className="calm-number block text-lg font-semibold text-ink">{closeout.delivered}/{closeout.deliverables}</span>{t('Delivered')}</div>
                    </div>
                  </section>
                </div>
                {(() => {
                  const ungenerated = cycleDeliverables.filter(deliverable => deliverable.status !== "Delivered"
                    && cycle.serviceItems.find(item => item.id === deliverable.serviceItemId)?.workflow?.steps.length
                    && !tasks.some(task => task.deliverableId === deliverable.id || deliverable.taskIds.includes(task.id)));
                  return !isClient && canManageCycles && ungenerated.length > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                    <p className="text-sm text-muted">{t("{count} deliverables have no tasks yet.", { count: ungenerated.length })}</p>
                    <Button variant="secondary" disabled={generatingAll} onClick={() => void generateAllTaskChains(ungenerated.map(item => item.id))}><ListChecks className="h-4 w-4" />{t("Generate all task chains")}</Button>
                  </div>;
                })()}
                <div className="divide-y divide-line/70">
                  {cycleDeliverables.map((deliverable) => {
                    const linkedTasks = tasks
                      .filter((task) => task.deliverableId === deliverable.id || deliverable.taskIds.includes(task.id))
                      .sort(
                        (a, b) =>
                          (a.workflowStepOrder || 0) -
                          (b.workflowStepOrder || 0),
                      );
                    const serviceItem = cycle.serviceItems.find(
                      (item) => item.id === deliverable.serviceItemId,
                    );
                    return (
                      <div
                        key={deliverable.id}
                        className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_180px_420px] lg:items-start"
                      >
                        <div>
                          <p data-i18n-skip className="font-semibold text-ink">
                            {deliverable.title}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {linkedTasks.length} {t("linked task(s)")}
                            {serviceItem?.workflow
                              ? <> · <span data-i18n-skip>{serviceItem.workflow.name}</span></>
                              : ""}
                          </p>
                          {linkedTasks.length > 0 && (
                            <ol className="relative mt-4 space-y-0 border-l border-line pl-5">
                              {linkedTasks.map((task) => {
                                const waiting = (
                                  task.predecessorTaskIds || []
                                ).some(
                                  (id) =>
                                    !tasks.find((value) => value.id === id)
                                      ?.isCompleted,
                                );
                                const alreadyCarried = Boolean(nextCycle && tasks.some(candidate => candidate.carriedFromTaskId === task.id && candidate.serviceCycleId === nextCycle.id));
                                const targetDeliverable = nextCycle && deliverables.find(item => item.cycleId === nextCycle.id && item.serviceItemId === deliverable.serviceItemId);
                                return (
                                  <li
                                    key={task.id}
                                    className="relative grid min-h-12 gap-1 pb-4 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                                  >
                                    <span
                                      className={cn(
                                        "absolute -left-[2.1rem] flex h-6 w-6 items-center justify-center rounded-full border bg-surface text-[11px] font-semibold",
                                        task.isCompleted
                                          ? "border-[rgb(var(--calm-success)/.55)] bg-[rgb(var(--calm-success-soft))] text-[rgb(var(--calm-success))]"
                                          : waiting
                                            ? "border-[rgb(var(--calm-warning)/.55)] bg-[rgb(var(--calm-warning-soft))] text-[rgb(var(--calm-warning))]"
                                            : "border-accent bg-accent-soft text-accent",
                                      )}
                                    >{task.workflowStepOrder}</span>
                                    <Link
                                      to={`/clients?client=${encodeURIComponent(task.clientName)}&taskId=${encodeURIComponent(task.id)}`}
                                      data-i18n-skip
                                      className="min-w-0 font-medium text-ink hover:text-accent"
                                    >
                                      {getClientTaskTitle(task)}
                                    </Link>
                                    <span className={cn("font-medium", task.isCompleted ? "text-[rgb(var(--calm-success))]" : waiting ? "text-[rgb(var(--calm-warning))]" : "text-muted")}>{task.isCompleted ? t("Completed") : waiting ? t("Waiting on previous step") : t("Current / ready")}</span>
                                    {!isClient && canManageCycles && nextCycle && isTaskOpen(task) && (
                                      alreadyCarried
                                        ? <span className="text-xs font-medium text-[rgb(var(--calm-success))]">{t('Carried forward')}</span>
                                        : <Button variant="secondary" className="min-h-9 px-2.5 py-1 text-xs" disabled={carryPending === task.id || Boolean(carryPending)} onClick={() => void carryForward(task.id, nextCycle.id, targetDeliverable?.id)}>
                                            {carryPending === task.id ? t('Saving…') : t('Carry forward')}
                                          </Button>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </div>
                        {isClient ? (
                          <Badge
                            tone={
                              deliverable.status === "Delivered"
                                ? "emerald"
                                : "slate"
                            }
                          >
                            {deliverable.status}
                          </Badge>
                        ) : (
                          <div>
                            <select
                              aria-label={`${t('Deliverable status')}: ${deliverable.title}`}
                              aria-describedby={`delivery-status-help-${deliverable.id}`}
                              disabled={
                                !canManageCycles &&
                                !linkedTasks.some(
                                  (task) =>
                                    task.assignedTo === store.currentUser?.id,
                                )
                              }
                              className={cn(inputBase, "px-3 py-2")}
                              value={deliverable.status}
                              onChange={(e) =>
                                void saveAndCommit(
                                  store.updateDeliverableStatus(
                                    deliverable.id,
                                    e.target.value as DeliverableStatus,
                                  ),
                                  "deliverable.manage",
                                )
                              }
                            >
                              {deliverableStatuses.map((value) => (
                                <option key={value} value={value} disabled={!canSetDeliverableStatus(deliverable, value, store.tasks, store.serviceCycles, store.backend.mode === 'supabase')}>{t(value)}</option>
                              ))}
                            </select>
                            <p id={`delivery-status-help-${deliverable.id}`} className="mt-2 text-xs text-muted">{t(linkedTasks.length || serviceItem?.workflow?.steps.some(step => step.required !== false)
                              ? 'Available statuses follow required task progress.'
                              : 'No linked tasks. Update this status manually.')}</p>
                          </div>
                        )}
                        {!isClient && (
                          <div className="flex flex-wrap gap-2">
                            {canManageCycles && deliverable.status !== "Delivered" &&
                              serviceItem?.workflow &&
                              linkedTasks.length === 0 && (
                                <Button
                                  onClick={() =>
                                    void generateTaskChain(deliverable.id)
                                  }
                                >
                                  <ListChecks className="h-4 w-4" />
                                  {t("Generate")} {
                                    serviceItem.workflow.steps.length
                                  }{" "}{t("tasks")}
                                </Button>
                              )}
                            {deliverable.status !== "Delivered" && !serviceItem?.workflow && linkCandidates.length > 0 && (() => {
                              // Best guess first; one click when a single task clearly fits.
                              const ranked = rankLinkCandidates(linkCandidates, deliverable, cycle, serviceItem?.name);
                              return <>
                                {ranked.suggestion && (
                                  <Button
                                    variant="secondary"
                                    className="min-h-10 max-w-full"
                                    disabled={serviceSaving}
                                    aria-label={`${t("Link suggested task")}: ${ranked.suggestion.title} → ${deliverable.title}`}
                                    onClick={() => void linkExistingTask(ranked.suggestion!.id, cycle.id, deliverable.id)}
                                  >
                                    <Link2 className="h-4 w-4" />{t("Link")}: <span className="truncate" data-i18n-skip>{ranked.suggestion.title}</span>
                                  </Button>
                                )}
                                <select
                                  aria-label={`${t("Link a task")}: ${deliverable.title}`}
                                  value=""
                                  disabled={serviceSaving}
                                  onChange={event => void linkExistingTask(event.target.value, cycle.id, deliverable.id)}
                                  className="min-h-10 max-w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
                                >
                                  <option value="">{t(ranked.suggestion ? "Link another task" : "Link a task")}…</option>
                                  {ranked.ordered.map(task => <option key={task.id} value={task.id} data-i18n-skip>{task.title}{task.dueDate ? ` · ${task.dueDate}` : ''}</option>)}
                                </select>
                              </>;
                            })()}
                            {!isClient && canManageCycles && (cycle.status === "Published" || cycle.status === "Completed") && (
                              <CorrectDeliverableName
                                deliverable={deliverable}
                                disabled={serviceSaving}
                                onSave={(title, reason) => correctDeliverableName(deliverable.id, cycle.id, title, reason)}
                              />
                            )}
                            {canLinkTasks && <Button variant="secondary" onClick={() => document.getElementById('delivery-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t('Review task links')}</Button>}
                            {canAddManualTask && <Button
                              variant="secondary"
                              disabled={deliverable.status === 'Delivered'}
                              title={deliverable.status === 'Delivered' ? t('Reopen the delivery before adding task links.') : undefined}
                              onClick={() =>
                                store.openCreateTaskForDeliverable({
                                  clientId: client.id,
                                  clientName: client.clientName,
                                  serviceType: serviceItem?.name || "Service",
                                  cycleId: cycle.id,
                                  deliverableId: deliverable.id,
                                })
                              }
                            >
                              <Plus className="h-4 w-4" />
                              {t("Task")}
                            </Button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!selectedCycle && (
            <p className="rounded-control border border-dashed border-line p-10 text-center text-sm text-muted">
              {t("No months to show yet.")}
            </p>
          )}
          <section className={cn(cardBase, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
              <div>
                <h2 className="font-semibold text-ink">
                  {displayPlan?.name ? <span data-i18n-skip>{displayPlan.name}</span> : t("No service plan")}
                </h2>
                {displayPlan && (
                  <p className="mt-1 text-sm text-muted">
                    {selectedCycle && <>{t(selectedCycle.id === monthly.current?.id ? 'This month’s record' : 'Historical record')} · </>}{t('Revision')} {displayPlan.revision} · {selectedCycle ? <span>{monthlyRecordLabel(selectedCycle, locale)}</span> : <><span data-i18n-skip>{displayPlan.origin}</span> · {t('billing day')} {displayPlan.billingDay}</>}
                    {!selectedCycle && displayPlan.contractEndDate
                      ? <> · {t('contract reminder')} {!selectedCycle && displayPlan.contractEndDate}</>
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {displayPlan && (
                  <Badge
                    tone={
                      displayPlan.status === "Active"
                        ? "emerald"
                        : displayPlan.status === "Draft"
                          ? "amber"
                          : "slate"
                    }
                  >
                    {displayPlan.status}
                  </Badge>
                )}
                {activePlan && !selectedCycle && activePlan.status === "Draft" && canManagePlans && (
                  <Button variant="secondary" onClick={() => setPlanDatesOpen(true)}>{t('Edit plan dates')}</Button>
                )}
              </div>
            </div>
            {displayPlan ? (
              <div className="divide-y divide-line/70">
                {displayPlan.serviceItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_180px_150px] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-ink">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        <span data-i18n-skip>{item.platforms.join(", ") || t("No platform")}</span> ·{" "}
                        {item.quantity} <span data-i18n-skip>{item.unit}</span>
                      </p>
                      {item.workflow && (
                        <p className="mt-1 text-xs font-medium text-accent">
                          <span data-i18n-skip>{item.workflow.name}</span> · {t("rev")}{" "}
                          {item.workflow.templateRevision} ·{" "}
                          {item.workflow.steps.length} {t("tasks")}
                        </p>
                      )}
                    </div>
                    {canSeePrices && (
                      <p className="text-sm font-medium text-ink">
                        {formatMoney(item.unitPriceMinor, 'MYR', locale)} {t("each")}
                      </p>
                    )}
                    <span className="text-sm text-muted">
                      {item.quantity} {t("slots")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 p-8 text-center">
                <p className="text-sm text-muted">{t("No monthly plan record is available for this period.")}</p>
                {canManagePlans && !activePlan && <Button onClick={() => setPlanModalOpen(true)}><Plus className="h-4 w-4" />{t("Add service plan")}</Button>}
              </div>
            )}
            {canSeePrices && planTotals && (
              <div className="flex justify-end border-t border-line bg-inset p-5">
                <div className="text-right">
                  <p className="text-xs text-muted">
                    {t("Internal monthly total")}
                  </p>
                  <p className="text-xl font-semibold text-ink">
                    {formatMoney(planTotals.total, 'MYR', locale)}
                  </p>
                </div>
              </div>
            )}
            {canManagePlans && activePlan && ['Active', 'Paused'].includes(activePlan.status) && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4"><p className="text-sm text-muted">{t('Plan settings apply to future months.')}</p><Button variant="secondary" onClick={() => setPlanDatesOpen(true)}>{t('Edit plan dates')}</Button></div>}
            {canManagePlans && activeOrPausedPlan?.status === "Active" && (
              <div className="flex flex-wrap justify-end gap-2 border-t p-4">
                {!scheduledRevision && (
                  <Button
                    variant="secondary"
                    onClick={() => void createRevision()}
                  >
                    <GitBranchPlus className="h-4 w-4" />
                    {t("Create next revision")}
                  </Button>
                )}
                  <Button
                    variant="secondary"
                    onClick={() => setPlanAction("pause")}
                >
                  <Pause className="h-4 w-4" />
                  {t("Pause")}
                </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPlanAction("end")}
                >
                  <StopCircle className="h-4 w-4" />
                  {t("End")}
                </Button>
              </div>
            )}
            {canManagePlans && activePlan?.status === "Paused" && (
              <div className="flex justify-end border-t p-4">
                <Button
                  onClick={() =>
                    void saveAndCommit(
                      store.activateClientPlan(activePlan.id),
                      "client_plan.manage",
                    )
                  }
                >
                  <Play className="h-4 w-4" />
                  {t("Resume from next billing day")}
                </Button>
              </div>
            )}
          </section>
          {canManagePlans && scheduledRevision && revisionSource && (
            <DraftServicePlanEditor key={`${store.currentUser?.authUserId || store.currentUser?.id}:${scheduledRevision.id}`} plan={scheduledRevision} source={revisionSource} />
          )}
        </div>
      )}

      {tab === "activity" && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-activity`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-activity`} tabIndex={0} className="scroll-mt-36 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {!isClient && <div className="flex justify-end"><Button disabled={!activityCycle || !canAddActivityForCycle} onClick={() => { if (!pendingActivity.current) setActivityFeedback(null); if (!activityCycleId || (!comment.trim() && !file && !pendingActivity.current)) setActivityCycleId(selectedCycle?.id || null); setActivitySheetOpen(true); }}><MessageSquareText className="h-4 w-4" />{t("Add activity")}</Button></div>}
          <section className={cn(cardBase, "divide-y divide-line/70")}>
            {comments.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-muted" aria-hidden="true" />
                  <p className="text-sm font-semibold text-ink">
                    {store.users.find((user) => user.id === item.userId)
                      ?.name || t("Team member")}
                  </p>
                  {!isClient && <Badge tone="slate">{item.visibility}</Badge>}
                </div>
                <p data-i18n-skip className="mt-3 whitespace-pre-wrap text-sm text-muted">
                  {item.text}
                </p>
                {item.attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    data-i18n-skip
                    type="button"
                    disabled={Boolean(downloadingFileId)}
                    aria-busy={downloadingFileId === attachment.id}
                    onClick={() => void download(attachment)}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-wait disabled:opacity-60"
                  >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                    {attachment.fileName}
                  </button>
                ))}
              </article>
            ))}
            {comments.length === 0 && (
              <EmptyState title={t("No activity yet")} description={t("Comments and private service files will appear here in chronological order.")} className="m-4" />
            )}
          </section>
        </div>
      )}

      {planModalOpen && <CreateClientPlanModal client={client} onClose={() => setPlanModalOpen(false)} />}
      {planDatesOpen && activePlan && <EditClientPlanDatesModal plan={activePlan} onClose={() => setPlanDatesOpen(false)} />}

        <SideSheet
        isOpen={activitySheetOpen && !isClient}
        closeDisabled={activitySaving}
        onClose={() => { if (!activitySaving) setActivitySheetOpen(false); }}
        title={t("Add activity")}
        description={t("Share an internal note or a client-visible update with an optional private file.")}
        footer={<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="secondary" onClick={() => setActivitySheetOpen(false)} disabled={activitySaving}>{t("Cancel")}</Button><Button type="submit" form="add-activity-form" disabled={activitySaving} aria-busy={activitySaving}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{activityStage === "uploading" ? t("Uploading…") : activityStage === "saving" ? t("Saving…") : activityFeedback?.action === "save" ? t("Retry save") : t("Add activity")}</Button></div>}
      >
        <form ref={activityFormRef} id="add-activity-form" noValidate={Boolean(pendingActivity.current)} onSubmit={activityFeedback?.action === "save" ? (event) => { event.preventDefault(); void retryActivitySave(); } : submitComment} className="space-y-5" aria-busy={activitySaving}>
          <p className="rounded-control border border-line bg-inset p-3 text-sm text-ink">{t('Billing period')}: {cycles.find(item => item.id === activityCycleId) ? monthlyRecordLabel(cycles.find(item => item.id === activityCycleId)!, locale) : t('Monthly record unavailable')}</p>
          {activityFeedback && (
            <div
              id="activity-feedback"
              className={cn(
                "rounded-control border px-3 py-3 text-sm",
                activityFeedback.tone === "error"
                  ? "border-[rgb(var(--calm-danger)/.35)] bg-[rgb(var(--calm-danger-soft))] text-[rgb(var(--calm-danger))]"
                  : "border-accent/25 bg-accent-soft text-accent",
              )}
              role={activityFeedback.tone === "error" ? "alert" : "status"}
              aria-live={activityFeedback.tone === "error" ? "assertive" : "polite"}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1"><SystemMessage message={activityFeedback.text} /></p>
                {activityFeedback.action === "upload" && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 px-3 text-xs"
                    onClick={() => {
                      setActivityFeedback(null);
                      activityFormRef.current?.requestSubmit();
                    }}
                    disabled={activitySaving}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t("Try again")}
                  </Button>
                )}
                {activityFeedback.action === "save" && (
                  <Button type="submit" form="add-activity-form" variant="secondary" className="shrink-0 px-3 text-xs" disabled={activitySaving}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t("Retry save")}
                  </Button>
                )}
              </div>
            </div>
          )}
          {activityStage === "uploading" && (
            <div
              className="overflow-hidden rounded-full bg-inset"
              role="progressbar"
              aria-label={t("Uploading file…")}
              aria-valuetext={t("Uploading file…")}
            >
              <div className="motion-safe:animate-pulse h-1.5 w-1/3 rounded-full bg-accent" />
            </div>
          )}
          <label className="block text-sm font-medium text-ink">{t("Update")}<textarea required className={cn(inputBase, "mt-1.5 min-h-32 px-3 py-2.5")} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("Share an update...")} /></label>
          <label className="block text-sm font-medium text-ink">{t("Visibility")}<select className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={visibility} onChange={(e) => setVisibility(e.target.value as CommentVisibility)}><option value="internal">{t("Internal only")}</option><option value="client-visible">{t("Visible to client")}</option></select></label>
          <div>
            <label htmlFor="activity-file" className="block text-sm font-medium text-ink">{t("File")} <span className="font-normal text-muted">{t("(maximum 100 MB)")}</span></label>
            <input
              id="activity-file"
              ref={activityFileInputRef}
              type="file"
              accept={SERVICE_FILE_ACCEPT}
              aria-describedby="activity-file-help activity-file-selection"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected && selected.size > SERVICE_FILE_MAX_BYTES) {
                  e.target.value = "";
                  setFile(undefined);
                  setActivityFeedback({ tone: "error", text: t("Files must be 100 MB or smaller."), action: pendingActivity.current ? "save" : undefined });
                  return;
                }
                if (selected && !getServiceFileMimeType(selected)) {
                  e.target.value = "";
                  setFile(undefined);
                  setActivityFeedback({ tone: "error", text: t(SERVICE_FILE_TYPE_ERROR), action: pendingActivity.current ? "save" : undefined });
                  return;
                }
                setFile(selected);
                if (!pendingActivity.current) setActivityFeedback(null);
              }}
              className="mt-2 block min-h-11 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-muted file:mr-3 file:rounded-control file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:font-semibold file:text-accent focus:outline-none focus:ring-2 focus:ring-accent/35"
            />
            <p id="activity-file-help" className="mt-1 text-xs leading-5 text-muted">{t("Optional private PDF or image. Uploads require the secure workspace backend.")}</p>
            {file && (
              <div id="activity-file-selection" className="mt-3 flex items-center justify-between gap-3 rounded-control border border-line bg-inset px-3 py-2.5 text-sm" role="status">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink" data-i18n-skip>{file.name}</p>
                  <p className="text-xs text-muted">{formatFileSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => { setFile(undefined); if (!pendingActivity.current) setActivityFeedback(null); if (activityFileInputRef.current) activityFileInputRef.current.value = ""; }} disabled={activitySaving} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-50" aria-label={t("Remove selected file")} title={t("Remove selected file")}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </form>
      </SideSheet>
      {planAction && activePlan && (
        <ConfirmDialog
          labelledBy={planConfirmationTitleId}
          title={planAction === "pause" ? t(`Pause the "${activePlan.name}" plan?`) : t(`End the "${activePlan.name}" plan?`)}
          description={planAction === "pause"
            ? t("This month stays as it is, and no new months are created.")
            : t("This cannot be reopened; the client keeps access to completed work.")}
          confirmLabel={planAction === "pause" ? t("Pause plan") : t("End plan")}
          onClose={() => setPlanAction(null)}
          onConfirm={confirmPlanAction}
        />
      )}
    </div>
  );
};

const ClientWorkspace = () => {
  const currentUser = useStore(state => state.currentUser);
  if (currentUser?.role === "Client") return <ClientServiceWorkspace />;
  return <OperationsClientWorkspace />;
};

export default ClientWorkspace;
