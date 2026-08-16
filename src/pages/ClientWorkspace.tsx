import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  GitBranchPlus,
  ListChecks,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Send,
  StopCircle,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import type {
  AddonBillingMode,
  AttachmentRef,
  CommentVisibility,
  DeliverableStatus,
} from "../types";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ProgressBar,
  SegmentedTabs,
  StatGroup,
  StatusChip,
  Surface,
} from "../components/ui";
import { cardBase, inputBase, pageShell } from "../components/uiTokens";
import { cn } from "../lib/utils";
import {
  calculatePlanTotalMinor,
  formatMoney,
  getCycleServiceProgress,
} from "../lib/serviceManagement";
import {
  canManageClientPlans,
  canManageServiceCycles,
  canViewServicePrices,
  hasPermission,
} from "../lib/access";
import { SECURE_WORKSPACE_ID } from "../lib/secureWorkspace";
import { useI18n } from "../components/I18nProvider";
import { downloadServiceFile, uploadServiceFile } from "../lib/serviceFiles";
import DraftServicePlanEditor from "../components/DraftServicePlanEditor";
import SideSheet from "../components/SideSheet";

type Tab = "overview" | "plan" | "cycles" | "addons" | "activity";
const CLIENT_WORKSPACE_TABS_ID = "client-workspace";
const MAX_SERVICE_FILE_BYTES = 100 * 1024 * 1024;
const deliverableStatuses: DeliverableStatus[] = [
  "Planned",
  "In Progress",
  "Ready",
  "Delivered",
];

const ClientWorkspace = () => {
  const { t } = useI18n();
  const { clientId = "" } = useParams();
  const store = useStore();
  const client = store.clients.find((item) => item.id === clientId);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [comment, setComment] = React.useState("");
  const [visibility, setVisibility] =
    React.useState<CommentVisibility>("internal");
  const [file, setFile] = React.useState<File>();
  const [message, setMessage] = React.useState("");
  const [addonSheetOpen, setAddonSheetOpen] = React.useState(false);
  const [activitySheetOpen, setActivitySheetOpen] = React.useState(false);
  const [addonSaving, setAddonSaving] = React.useState(false);
  const [activitySaving, setActivitySaving] = React.useState(false);
  const [addonEndDates, setAddonEndDates] = React.useState<
    Record<string, string>
  >({});
  const [addon, setAddon] = React.useState({
    name: "",
    platforms: "",
    quantity: 1,
    unitPrice: 0,
    billingMode: "one_off" as AddonBillingMode,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    targetCycleId: "",
  });
  if (!client) return <Navigate to="/clients" replace />;

  const canManagePlans = canManageClientPlans(
    store.currentUser,
    store.rolePermissions,
  );
  const canManageCycles = canManageServiceCycles(
    store.currentUser,
    store.rolePermissions,
  );
  const canLinkTasks = hasPermission(
    store.currentUser,
    "editTasks",
    store.rolePermissions,
  );
  const canSeePrices = canViewServicePrices(
    store.currentUser,
    store.rolePermissions,
  );
  const canSeeAllServiceClients = hasPermission(
    store.currentUser,
    "viewAllServiceClients",
    store.rolePermissions,
  );
  const isClient = store.currentUser?.role === "Client";
  const assignedStaff =
    store.currentUser?.role === "Staff" &&
    store.tasks.some(
      (task) =>
        task.clientId === client.id &&
        task.assignedTo === store.currentUser?.id,
    );
  if (
    !canSeeAllServiceClients &&
    !canManagePlans &&
    !canManageCycles &&
    !isClient &&
    !assignedStaff
  )
    return <Navigate to="/clients" replace />;
  if (
    isClient &&
    store.currentUser?.companyName?.trim().toLowerCase() !==
      client.clientName.trim().toLowerCase()
  )
    return <Navigate to="/" replace />;

  const plans = store.clientPlans
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.revision - a.revision);
  const activePlan =
    plans.find((item) => item.status === "Active") ||
    plans.find((item) => item.status === "Paused") ||
    plans[0];
  const scheduledRevision = plans.find(
    (item) =>
      item.status === "Draft" && item.supersedesPlanId === activePlan?.id,
  );
  const allCycles = store.serviceCycles
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const cycles = isClient
    ? allCycles.filter(
        (item) => item.status === "Published" || item.status === "Completed",
      )
    : allCycles;
  const deliverables = store.deliverables.filter(
    (item) => item.clientId === client.id,
  );
  const comments = store.cycleComments.filter(
    (item) =>
      item.clientId === client.id &&
      (!isClient || item.visibility === "client-visible"),
  );
  const addons = store.addons.filter((item) => item.clientId === client.id);
  const tasks = store.tasks.filter(
    (item) =>
      item.clientId === client.id &&
      (!isClient || item.visibility !== "internal"),
  );
  const planTotals = activePlan
    ? calculatePlanTotalMinor(
        activePlan.serviceItems,
        activePlan.discountType,
        activePlan.discountValue,
        activePlan.taxRateBps,
      )
    : null;
  const currentCycle = cycles[0];
  const currentCycleDeliverables = currentCycle
    ? deliverables.filter((item) => item.cycleId === currentCycle.id)
    : [];
  const currentDelivered = currentCycleDeliverables.filter(
    (item) => item.status === "Delivered",
  ).length;
  const currentProgress = currentCycleDeliverables.length
    ? Math.round((currentDelivered / currentCycleDeliverables.length) * 100)
    : 0;

  const saveAndCommit = async (
    result: { ok: boolean; error?: string },
    command: Parameters<typeof store.commitPendingMutation>[0],
  ): Promise<boolean> => {
    if (!result.ok) {
      setMessage(result.error || "Unable to save this change.");
      return false;
    }
    const saved = await store.commitPendingMutation(command);
    setMessage(
      saved.ok ? "Saved." : saved.error || "The change is waiting to be saved.",
    );
    return saved.ok;
  };
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activitySaving) return;
    const cycle = cycles[0];
    if (!cycle)
      return setMessage("Create a service cycle before adding activity.");
    if (file && file.size > MAX_SERVICE_FILE_BYTES)
      return setMessage("Files must be 100 MB or smaller.");
    setActivitySaving(true);
    let attachment: AttachmentRef | undefined;
    if (file && store.currentUser) {
      const uploaded = await uploadServiceFile({
        file,
        workspaceId: SECURE_WORKSPACE_ID,
        clientId: client.id,
        cycleId: cycle.id,
        userId: store.currentUser.id,
      });
      if (uploaded.ok === false) {
        setActivitySaving(false);
        return setMessage(uploaded.error);
      }
      attachment = uploaded.attachment;
    }
    const result = store.addCycleComment(cycle.id, comment, visibility);
    if (!result.ok || !result.id) {
      setActivitySaving(false);
      return setMessage(result.error || "Unable to add the comment.");
    }
    if (attachment) {
      store.addCycleCommentAttachment(result.id, attachment);
    }
    const saved = await store.commitPendingMutation("cycle_comment.manage");
    setActivitySaving(false);
    setMessage(
      saved.ok
        ? "Activity added."
        : saved.error || "The activity is waiting to be saved.",
    );
    if (saved.ok) {
      setComment("");
      setFile(undefined);
      setActivitySheetOpen(false);
    }
  };
  const addAddon = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activePlan || addonSaving) return;
    if (addon.quantity < 1 || !Number.isInteger(addon.quantity) || addon.unitPrice < 0 || !Number.isFinite(addon.unitPrice)) {
      setMessage("Enter a whole quantity of at least one and a valid non-negative price.");
      return;
    }
    if (addon.billingMode === "one_off" && !addon.targetCycleId) {
      setMessage("Choose a service cycle for this one-off add-on.");
      return;
    }
    setAddonSaving(true);
    const saved = await saveAndCommit(
      store.addAddon({
        clientId: client.id,
        clientName: client.clientName,
        planId: activePlan.id,
        name: addon.name,
        platforms: addon.platforms
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        quantity: addon.quantity,
        unitPriceMinor: Math.round(addon.unitPrice * 100),
        billingMode: addon.billingMode,
        targetCycleId:
          addon.billingMode === "one_off"
            ? addon.targetCycleId || undefined
            : undefined,
        effectiveFrom: addon.effectiveFrom,
        isActive: true,
      }),
      "addon.manage",
    );
    setAddonSaving(false);
    if (!saved) return;
    setAddon((current) => ({
      ...current,
      name: "",
      platforms: "",
      quantity: 1,
      unitPrice: 0,
    }));
    setAddonSheetOpen(false);
  };
  const createRevision = async () => {
    if (!activePlan) return;
    const result = store.createClientPlanRevision(activePlan.id);
    await saveAndCommit(result, "client_plan.manage");
  };
  const generateTaskChain = async (deliverableId: string) => {
    const result = store.generateDeliverableTaskChain(deliverableId);
    await saveAndCommit(result, "deliverable.workflow.generate");
  };
  const changeAddonState = async (addonId: string, isActive: boolean) => {
    await saveAndCommit(
      store.setAddonActive(addonId, isActive, addonEndDates[addonId]),
      "addon.manage",
    );
  };

  const tabs: { id: Tab; label: string; compactLabel?: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "plan", label: "Plan" },
    { id: "cycles", label: "Cycles" },
    ...(canManagePlans ? [{ id: "addons" as Tab, label: "Add-ons" }] : []),
    { id: "activity", label: "Activity / Files", compactLabel: "Activity" },
  ];

  return (
    <div className={pageShell}>
      <Link
        to="/clients"
        className="inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-semibold text-muted hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/35"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>
      <PageHeader
        compact
        title={<span data-i18n-skip>{client.clientName}</span>}
        description="Service plan, monthly cycles, deliverables and client files."
        meta={
          <>
            <StatusChip tone={activePlan?.status === "Active" ? "emerald" : activePlan?.status === "Paused" ? "amber" : "slate"}>{activePlan?.status || "No plan"}</StatusChip>
            {currentCycle && <span>{currentCycle.periodStart} – {currentCycle.periodEnd}</span>}
            {activePlan?.contractEndDate && <span>Contract reminder {activePlan.contractEndDate}</span>}
          </>
        }
        action={
          canManagePlans && activePlan?.status === "Draft" && !activePlan.supersedesPlanId ? (
            <Button onClick={() => void saveAndCommit(store.activateClientPlan(activePlan.id), "client_plan.manage")}>
              <Play className="h-4 w-4" />Activate plan
            </Button>
          ) : null
        }
      />
      <div className="sticky top-[4.5rem] z-20 border-b border-line/80 bg-canvas/95 py-3 backdrop-blur-md">
        <SegmentedTabs<Tab> items={tabs} value={tab} onChange={setTab} label="Client workspace" idPrefix={CLIENT_WORKSPACE_TABS_ID} />
      </div>
      {message && (
        <p
          className="rounded-control border border-line bg-inset px-4 py-3 text-sm font-medium text-ink"
          role="status"
        >
          {message}
        </p>
      )}

      {tab === "overview" && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-overview`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-overview`} tabIndex={0} className="grid scroll-mt-36 gap-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <Surface variant="inset" className="p-6 sm:p-8">
            <p className="calm-eyebrow">Current delivery progress</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div><p className="calm-number text-5xl font-semibold tracking-tight text-ink">{currentProgress}%</p><p className="mt-2 text-sm text-muted">{`${currentDelivered} of ${currentCycleDeliverables.length} deliverables completed`}</p></div>
              {currentCycle && <StatusChip tone={currentCycle.status === "Completed" || currentCycle.status === "Published" ? "emerald" : "slate"}>{currentCycle.status}</StatusChip>}
            </div>
            <ProgressBar className="mt-7" value={currentDelivered} max={Math.max(currentCycleDeliverables.length, 1)} label="Monthly deliverables" />
            <StatGroup className="mt-7 grid-cols-3">
              {[["Included", currentCycleDeliverables.length], ["Completed", currentDelivered], ["Remaining", currentCycleDeliverables.length - currentDelivered]].map(([label, value]) => <div key={label} className="p-4"><p className="calm-number text-2xl font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div>)}
            </StatGroup>
          </Surface>
          <Surface className="p-6">
            <p className="calm-eyebrow">Service context</p>
            <dl className="mt-5 divide-y divide-line/70">
              {[["Active plan", activePlan?.name || "Not configured"], ["Plan status", activePlan?.status || "None"], ["Service cycles", String(cycles.length)], ["Next key date", activePlan?.contractEndDate || currentCycle?.periodEnd || "Not scheduled"]].map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-3 py-3 text-sm"><dt className="text-muted">{label}</dt><dd data-i18n-skip className="text-right font-medium text-ink">{value}</dd></div>)}
            </dl>
          </Surface>
        </div>
      )}

      {tab === "plan" && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-plan`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-plan`} tabIndex={0} className="scroll-mt-36 space-y-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <section className={cn(cardBase, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 data-i18n-skip className="font-semibold text-slate-950">
                  {activePlan?.name || "No service plan"}
                </h2>
                {activePlan && (
                  <p data-i18n-skip className="mt-1 text-sm text-slate-500">
                    Revision {activePlan.revision} · {activePlan.origin} ·
                    billing day {activePlan.billingDay}
                    {activePlan.contractEndDate
                      ? ` · contract reminder ${activePlan.contractEndDate}`
                      : ""}
                  </p>
                )}
              </div>
              {activePlan && (
                <Badge
                  tone={
                    activePlan.status === "Active"
                      ? "emerald"
                      : activePlan.status === "Draft"
                        ? "amber"
                        : "slate"
                  }
                >
                  {activePlan.status}
                </Badge>
              )}
            </div>
            {activePlan ? (
              <div className="divide-y divide-slate-100">
                {activePlan.serviceItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_180px_150px] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.platforms.join(", ") || "No platform"} ·{" "}
                        {item.quantity} {item.unit}
                      </p>
                      {item.workflow && (
                        <p className="mt-1 text-xs font-medium text-blue-700">
                          {item.workflow.name} · rev{" "}
                          {item.workflow.templateRevision} ·{" "}
                          {item.workflow.steps.length} tasks
                        </p>
                      )}
                    </div>
                    {canSeePrices && (
                      <p className="text-sm font-medium text-slate-700">
                        {formatMoney(item.unitPriceMinor)} each
                      </p>
                    )}
                    <span className="text-sm text-slate-500">
                      {item.quantity} slots
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">
                Create a plan from the Clients page.
              </p>
            )}
            {canSeePrices && planTotals && (
              <div className="flex justify-end border-t border-slate-200 bg-slate-50 p-5">
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    Internal monthly total
                  </p>
                  <p className="text-xl font-semibold text-slate-950">
                    {formatMoney(planTotals.total)}
                  </p>
                </div>
              </div>
            )}
            {canManagePlans && activePlan?.status === "Active" && (
              <div className="flex flex-wrap justify-end gap-2 border-t p-4">
                {!scheduledRevision && (
                  <Button
                    variant="secondary"
                    onClick={() => void createRevision()}
                  >
                    <GitBranchPlus className="h-4 w-4" />
                    Create next revision
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    const confirmed = window.confirm(t(
                      `Pause the "${activePlan.name}" plan? The current cycle stays unchanged and future cycles stop generating.`,
                    ));
                    if (!confirmed) return;
                    void saveAndCommit(
                      store.setClientPlanStatus(activePlan.id, "Paused"),
                      "client_plan.manage",
                    );
                  }}
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const confirmed = window.confirm(t(
                      `End the "${activePlan.name}" plan? This cannot be reopened; the client keeps access to completed work.`,
                    ));
                    if (!confirmed) return;
                    void saveAndCommit(
                      store.setClientPlanStatus(activePlan.id, "Ended"),
                      "client_plan.manage",
                    );
                  }}
                >
                  <StopCircle className="h-4 w-4" />
                  End
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
                  Resume from next billing day
                </Button>
              </div>
            )}
          </section>
          {canManagePlans && scheduledRevision && (
            <DraftServicePlanEditor plan={scheduledRevision} />
          )}
        </div>
      )}

      {tab === "cycles" && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-cycles`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-cycles`} tabIndex={0} className="scroll-mt-36 space-y-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {cycles.map((cycle) => {
            const cycleDeliverables = deliverables.filter(
              (item) => item.cycleId === cycle.id,
            );
            const progress = getCycleServiceProgress(cycle, cycleDeliverables);
            const includedTotal = progress.reduce((sum, item) => sum + item.included, 0);
            const completedTotal = progress.reduce((sum, item) => sum + item.completed, 0);
            return (
              <section
                key={cycle.id}
                className={cn(cardBase, "overflow-hidden")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">
                      {cycle.periodStart} – {cycle.periodEnd}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {cycleDeliverables.length} deliverables · plan revision{" "}
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
                      {cycle.status}
                    </Badge>
                    {canManageCycles && cycle.status === "Draft" && (
                      <Button
                        onClick={() =>
                          void saveAndCommit(
                            store.setServiceCycleStatus(cycle.id, "Published"),
                            "service_cycle.manage",
                          )
                        }
                      >
                        <Send className="h-4 w-4" />
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
                <div className="border-b border-line bg-inset/70 px-5 py-5">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <ProgressBar value={completedTotal} max={Math.max(includedTotal, 1)} label={`${completedTotal} of ${includedTotal} deliverables completed`} />
                    <div className="grid grid-cols-3 gap-6 text-right">
                      {[["Included", includedTotal], ["Completed", completedTotal], ["Remaining", Math.max(0, includedTotal - completedTotal)]].map(([label, value]) => <span key={label}><strong className="calm-number block text-lg text-ink">{value}</strong><small className="text-muted">{label}</small></span>)}
                    </div>
                  </div>
                  {progress.length > 1 && <p className="mt-4 text-xs text-muted">{progress.map((item) => `${item.name} ${item.completed}/${item.included}`).join(" · ")}</p>}
                </div>
                <div className="divide-y divide-slate-100">
                  {cycleDeliverables.map((deliverable) => {
                    const linkedTasks = tasks
                      .filter((task) => deliverable.taskIds.includes(task.id))
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
                          <p data-i18n-skip className="font-semibold text-slate-900">
                            {deliverable.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {linkedTasks.length} linked task(s)
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
                                return (
                                  <li
                                    key={task.id}
                                    className="relative grid min-h-12 gap-1 pb-4 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                                  >
                                    <span
                                      className={cn(
                                        "absolute -left-[2.1rem] flex h-6 w-6 items-center justify-center rounded-full border bg-surface text-[10px] font-semibold",
                                        task.isCompleted
                                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                          : waiting
                                            ? "border-amber-400 bg-amber-50 text-amber-700"
                                            : "border-accent bg-accent-soft text-accent",
                                      )}
                                    >{task.workflowStepOrder}</span>
                                    <Link
                                      to="/tasks"
                                      data-i18n-skip
                                      className="min-w-0 font-medium text-ink hover:text-accent"
                                    >
                                      {task.title.replace(/^\d+\.\s*/, "")}
                                    </Link>
                                    <span className={cn("font-medium", task.isCompleted ? "text-emerald-700" : waiting ? "text-amber-700" : "text-muted")}>{task.isCompleted ? "Completed" : waiting ? "Waiting on previous step" : "Current / ready"}</span>
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
                          <select
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
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        )}
                        {!isClient && (
                          <div className="flex flex-wrap gap-2">
                            {canManageCycles &&
                              serviceItem?.workflow &&
                              linkedTasks.length === 0 && (
                                <Button
                                  onClick={() =>
                                    void generateTaskChain(deliverable.id)
                                  }
                                >
                                  <ListChecks className="h-4 w-4" />
                                  Generate {
                                    serviceItem.workflow.steps.length
                                  }{" "}
                                  tasks
                                </Button>
                              )}
                            {canLinkTasks && (
                            <select
                              className={cn(
                                inputBase,
                                "min-w-44 flex-1 px-3 py-2",
                              )}
                              value=""
                              onChange={(e) =>
                                void saveAndCommit(
                                  store.linkTaskToDeliverable(
                                    e.target.value,
                                    cycle.id,
                                    deliverable.id,
                                  ),
                                  "deliverable.manage",
                                )
                              }
                            >
                              <option value="">Link a task...</option>
                              {tasks
                                .filter(
                                  (task) =>
                                    !task.deliverableId ||
                                    task.deliverableId === deliverable.id,
                                )
                                .map((task) => (
                                  <option key={task.id} value={task.id} data-i18n-skip>
                                    {task.title}
                                  </option>
                                ))}
                            </select>
                            )}
                            <Button
                              variant="secondary"
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
                              Task
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {cycles.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              No visible service cycles yet.
            </p>
          )}
        </div>
      )}

      {tab === "addons" && canManagePlans && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-addons`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-addons`} tabIndex={0} className="scroll-mt-36 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Service add-ons</h2><p className="mt-1 text-sm text-muted">One-off and recurring scope changes remain visible in the history.</p></div><Button onClick={() => setAddonSheetOpen(true)}><Plus className="h-4 w-4" />Add service add-on</Button></div>
          <section className={cn(cardBase, "divide-y divide-slate-100")}>
            {addons.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <Badge tone={item.isActive ? "emerald" : "slate"}>
                      {item.isActive ? "Active" : "Stopped"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.billingMode} ·{" "}
                    {item.platforms.join(", ") || "No platform"}
                    {item.effectiveUntil
                      ? ` · through ${item.effectiveUntil}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canSeePrices && (
                    <p className="mr-2 font-semibold text-slate-950">
                      {formatMoney(item.quantity * item.unitPriceMinor)}
                    </p>
                  )}
                  {item.billingMode === "monthly" && item.isActive && (
                    <>
                      <input
                        aria-label={`End date for ${item.name}`}
                        type="date"
                        min={item.effectiveFrom}
                        className={cn(inputBase, "w-auto px-3 py-2")}
                        value={addonEndDates[item.id] || ""}
                        onChange={(e) =>
                          setAddonEndDates((current) => ({
                            ...current,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="secondary"
                        onClick={() => void changeAddonState(item.id, false)}
                      >
                        Stop future cycles
                      </Button>
                    </>
                  )}
                  {!item.isActive && (
                    <Button
                      variant="secondary"
                      onClick={() => void changeAddonState(item.id, true)}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {addons.length === 0 && (
              <EmptyState title="No add-ons yet" description="Add one-off or monthly scope when this client needs work outside the active plan." className="m-4" />
            )}
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div id={`${CLIENT_WORKSPACE_TABS_ID}-panel-activity`} role="tabpanel" aria-labelledby={`${CLIENT_WORKSPACE_TABS_ID}-tab-activity`} tabIndex={0} className="scroll-mt-36 space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">
          {!isClient && <div className="flex justify-end"><Button onClick={() => setActivitySheetOpen(true)}><MessageSquareText className="h-4 w-4" />Add activity</Button></div>}
          <section className={cn(cardBase, "divide-y divide-slate-100")}>
            {comments.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-800">
                    {store.users.find((user) => user.id === item.userId)
                      ?.name || "Team member"}
                  </p>
                  {!isClient && <Badge tone="slate">{item.visibility}</Badge>}
                </div>
                <p data-i18n-skip className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                  {item.text}
                </p>
                {item.attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    data-i18n-skip
                    onClick={async () => {
                      const downloaded = await downloadServiceFile(attachment);
                      if (!downloaded.ok) setMessage(downloaded.error);
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-blue-700"
                  >
                    <FileUp className="h-4 w-4" />
                    {attachment.fileName}
                  </button>
                ))}
              </article>
            ))}
            {comments.length === 0 && (
              <EmptyState title="No activity yet" description="Comments and private service files will appear here in chronological order." className="m-4" />
            )}
          </section>
        </div>
      )}

      <SideSheet
        isOpen={addonSheetOpen}
        onClose={() => { if (!addonSaving) setAddonSheetOpen(false); }}
        title="Add service add-on"
        description="Add one-off work to a cycle or recurring work from an effective date. Prices remain internal."
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAddonSheetOpen(false)} disabled={addonSaving}>Cancel</Button><Button type="submit" form="add-addon-form" disabled={addonSaving}><Plus className="h-4 w-4" />{addonSaving ? "Saving…" : "Add add-on"}</Button></div>}
      >
        <form id="add-addon-form" onSubmit={addAddon} className="space-y-5">
          <label className="block text-sm font-medium text-ink">Add-on name<input required className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.name} onChange={(e) => setAddon({ ...addon, name: e.target.value })} /></label>
          <label className="block text-sm font-medium text-ink">Platforms<input placeholder="Instagram, TikTok" className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.platforms} onChange={(e) => setAddon({ ...addon, platforms: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-ink">Quantity<input type="number" min="1" className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.quantity} onChange={(e) => setAddon({ ...addon, quantity: Number(e.target.value) })} /></label>
            <label className="text-sm font-medium text-ink">Unit price<input type="number" min="0" step="0.01" className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.unitPrice} onChange={(e) => setAddon({ ...addon, unitPrice: Number(e.target.value) })} /></label>
          </div>
          <label className="block text-sm font-medium text-ink">Billing mode<select className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.billingMode} onChange={(e) => setAddon({ ...addon, billingMode: e.target.value as AddonBillingMode })}><option value="one_off">One-off</option><option value="monthly">Monthly</option></select></label>
          {addon.billingMode === "one_off" ? (
            <label className="block text-sm font-medium text-ink">Service cycle<select className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.targetCycleId} onChange={(e) => setAddon({ ...addon, targetCycleId: e.target.value })}><option value="">Choose cycle</option>{allCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.periodStart}</option>)}</select></label>
          ) : (
            <label className="block text-sm font-medium text-ink">Effective from<input type="date" className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={addon.effectiveFrom} onChange={(e) => setAddon({ ...addon, effectiveFrom: e.target.value })} /></label>
          )}
        </form>
      </SideSheet>

      <SideSheet
        isOpen={activitySheetOpen && !isClient}
        onClose={() => { if (!activitySaving) setActivitySheetOpen(false); }}
        title="Add activity"
        description="Share an internal note or a client-visible update with an optional private file."
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setActivitySheetOpen(false)} disabled={activitySaving}>Cancel</Button><Button type="submit" form="add-activity-form" disabled={activitySaving}><CheckCircle2 className="h-4 w-4" />{activitySaving ? "Saving…" : "Add activity"}</Button></div>}
      >
        <form id="add-activity-form" onSubmit={submitComment} className="space-y-5">
          <label className="block text-sm font-medium text-ink">Update<textarea required className={cn(inputBase, "mt-1.5 min-h-32 px-3 py-2.5")} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share an update..." /></label>
          <label className="block text-sm font-medium text-ink">Visibility<select className={cn(inputBase, "mt-1.5 px-3 py-2.5")} value={visibility} onChange={(e) => setVisibility(e.target.value as CommentVisibility)}><option value="internal">Internal only</option><option value="client-visible">Visible to client</option></select></label>
          <label className="block text-sm font-medium text-ink">File <span className="font-normal text-muted">(maximum 100 MB)</span><input type="file" onChange={(e) => { const selected = e.target.files?.[0]; if (selected && selected.size > MAX_SERVICE_FILE_BYTES) { e.target.value = ""; setFile(undefined); setMessage("Files must be 100 MB or smaller."); return; } setFile(selected); setMessage(""); }} className="mt-2 block min-h-11 w-full text-sm text-muted" /></label>
        </form>
      </SideSheet>
    </div>
  );
};

export default ClientWorkspace;
