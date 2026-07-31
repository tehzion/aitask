import { expect, test } from '@playwright/test';

test('first login reaches the app and critical responsive routes remain usable', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/feedback?role=Client&lang=zh');
  await expect(page.getByRole('heading', { name: 'AiTask 一周使用反馈' })).toBeVisible();
  await expect(page.getByLabel('角色')).toHaveValue('Client');
  await expect(page.getByText('请在2026年7月30日前提交。')).toBeVisible();
  await expect(page.getByText('超级管理员检查')).toHaveCount(0);

  const publicViewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1536, height: 864 },
  ];
  for (const viewport of publicViewports) {
    await page.setViewportSize(viewport);
    for (const route of ['/feedback?role=Client&lang=zh', '/feedback/results']) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, `${route} should not overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport);
    }
  }
  await expect(page.getByRole('heading', { name: 'Feedback reviewer login' })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to AiTask' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo accounts - select username' })).toBeVisible();
  await expect(page.getByText('Boss Koo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Super Admin', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^v\d+\.\d+\.\d+\+[a-z0-9]+(?:\.dev)?$/)).toBeVisible();

  await page.getByRole('button', { name: 'Register as Staff' }).click();
  await expect(page.getByRole('heading', { name: 'Register for Access' })).toBeVisible();
  await expect(page.getByText('Staff', { exact: true })).toBeVisible();
  await expect(page.getByText('Client (External Customer)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Full Name').fill('QA Staff Applicant');
  await page.getByLabel('Email', { exact: true }).fill('qa.staff@example.com');
  await page.getByLabel('Phone Number').fill('+60120000000');
  await page.getByLabel('Job Position / Department').fill('Designer');
  await page.getByRole('button', { name: 'Submit Staff Registration' }).click();
  await expect(page.getByRole('heading', { name: 'Registration Submitted!' })).toBeVisible();
  await expect(page.getByText('Your Staff access request has been submitted for Super Admin approval.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Login' }).click();

  await page.goto('/account/password');
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Login' }).click();

  await expect(page.getByRole('button', { name: 'Use Boss Koo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use Admin Demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Staff Demo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use Finance Demo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use UrbanEats Client Demo' })).toBeVisible();

  await page.getByLabel('Email or username').fill('Boss Koo');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Access Dashboard' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Account Setup' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue for now' }).click();
  await expect(page).toHaveURL(/\/$/);

  await expect(page.getByRole('region', { name: 'Agency pulse' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent completions' })).toBeVisible();
  for (const viewport of publicViewports) {
    await page.setViewportSize(viewport);
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content, `Boss dashboard should not overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    const ordinaryAdmin = current.users.find(user => user.name === 'Admin Demo');
    useStore.setState({
      currentUser: ordinaryAdmin ? { ...ordinaryAdmin, mustResetPassword: false } : null,
    });
  });
  await expect(page.getByRole('region', { name: 'Agency pulse' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Workspace metrics' })).toBeVisible();
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    const boss = current.users.find(user => user.name === 'Boss Koo');
    useStore.setState({ currentUser: boss });
  });
  await expect(page.getByRole('region', { name: 'Agency pulse' })).toBeVisible();

  await page.goto('/approvals');
  await page.getByRole('button', { name: 'Add Member' }).first().click();
  const addMemberDialog = page.getByRole('dialog', { name: 'Add new member' });
  await expect(addMemberDialog.getByRole('checkbox', { name: 'Designer' })).toBeVisible();
  await expect(addMemberDialog.getByRole('checkbox', { name: 'Video Editor' })).toBeVisible();
  await addMemberDialog.getByRole('checkbox', { name: 'Designer' }).check();
  await addMemberDialog.getByRole('checkbox', { name: 'Video Editor' }).check();
  await expect(addMemberDialog.getByRole('checkbox', { name: 'Designer' })).toBeChecked();
  await expect(addMemberDialog.getByRole('checkbox', { name: 'Video Editor' })).toBeChecked();
  await page.keyboard.press('Escape');
  await page.goto('/');

  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    useStore.setState({ notifications: [] });
  });
  await expect(page.locator('[aria-label="New notifications"]')).toHaveAttribute('data-popup-ready', 'true');
  const headerNotificationButton = page.locator('header').getByRole('button', { name: 'Notifications', exact: true });
  await expect(headerNotificationButton.locator('span')).toHaveCount(0);

  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: [{
        id: 'popup-notification-1',
        targetUserId: current.currentUser.id,
        title: 'Popup QA 1',
        message: 'Closing this card must keep the notification unread.',
        route: { page: 'tasks' },
        isRead: false,
        readByUserIds: [],
        createdAt: new Date().toISOString(),
        iconType: 'task',
      }],
    });
  });
  const firstPopup = page.getByRole('article', { name: 'New notification: Popup QA 1' });
  await expect(firstPopup).toBeVisible();
  const desktopPopupBox = await firstPopup.boundingBox();
  expect(desktopPopupBox?.x).toBeGreaterThanOrEqual(256);
  await expect(headerNotificationButton.locator('span')).toHaveText('1');
  await firstPopup.getByRole('button', { name: 'Dismiss notification: Popup QA 1' }).click();
  await expect(firstPopup).toBeHidden();
  await expect(headerNotificationButton.locator('span')).toHaveText('1');

  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: [{
        id: 'popup-notification-locked',
        targetUserId: current.currentUser.id,
        title: 'Locked notification QA',
        message: 'An unrelated retry must block this read without being discarded.',
        route: { page: 'tasks' },
        isRead: false,
        readByUserIds: [],
        createdAt: new Date().toISOString(),
        iconType: 'status',
      }, ...current.notifications],
      backend: {
        ...current.backend,
        status: 'retry_required',
        hasLocalChanges: true,
        pendingMutations: 1,
        message: 'Unrelated task change requires retry.',
      },
    });
  });
  const lockedPopup = page.getByRole('article', { name: 'New notification: Locked notification QA' });
  await expect(lockedPopup).toBeVisible();
  await lockedPopup.getByRole('button', { name: 'Mark as read' }).click();
  await expect(lockedPopup).toBeVisible();
  await expect(headerNotificationButton.locator('span')).toHaveText('2');
  await expect(page.getByText('Resolve the current workspace sync change before updating notifications.')).toBeVisible();
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: current.notifications.filter(notification => notification.id !== 'popup-notification-locked'),
      backend: {
        ...current.backend,
        status: 'live',
        hasLocalChanges: false,
        pendingMutations: 0,
        error: undefined,
        message: 'Workspace is current.',
      },
    });
  });
  await expect(lockedPopup).toBeHidden();

  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: [{
        id: 'popup-notification-2',
        targetUserId: current.currentUser.id,
        title: 'Popup QA 2',
        message: 'Marking this card read must update the bell.',
        route: { page: 'tasks' },
        isRead: false,
        readByUserIds: [],
        createdAt: new Date().toISOString(),
        iconType: 'status',
      }, ...current.notifications],
    });
  });
  const secondPopup = page.getByRole('article', { name: 'New notification: Popup QA 2' });
  await expect(secondPopup).toBeVisible();
  await expect(headerNotificationButton.locator('span')).toHaveText('2');
  await secondPopup.getByRole('button', { name: 'Mark as read' }).click();
  await expect(secondPopup).toBeHidden();
  await expect(headerNotificationButton.locator('span')).toHaveText('1');
  await headerNotificationButton.click();
  await page.getByRole('button', { name: 'Mark All as Read' }).click();
  await expect(headerNotificationButton.locator('span')).toHaveCount(0);

  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: [{
        id: 'popup-notification-3',
        targetUserId: current.currentUser.id,
        title: 'Popup QA 3',
        message: 'Viewing this card opens its safe internal destination.',
        route: { page: 'calendar' },
        isRead: false,
        readByUserIds: [],
        createdAt: new Date().toISOString(),
        iconType: 'success',
      }, ...current.notifications],
    });
  });
  const thirdPopup = page.getByRole('article', { name: 'New notification: Popup QA 3' });
  await expect(thirdPopup).toBeVisible();
  await thirdPopup.getByRole('button', { name: 'View' }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(headerNotificationButton.locator('span')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts';
    const { useStore } = await import(storePath);
    const current = useStore.getState();
    useStore.setState({
      notifications: [{
        id: 'popup-notification-mobile',
        targetUserId: current.currentUser.id,
        title: 'Mobile Popup QA',
        message: 'This card must remain above the mobile navigation.',
        route: { page: 'calendar' },
        isRead: false,
        readByUserIds: [],
        createdAt: new Date().toISOString(),
        iconType: 'alert',
      }, ...current.notifications],
    });
  });
  const mobilePopup = page.getByRole('article', { name: 'New notification: Mobile Popup QA' });
  await expect(mobilePopup).toBeVisible();
  const mobilePopupBox = await mobilePopup.boundingBox();
  const mobileNavBox = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
  expect((mobilePopupBox?.y ?? 0) + (mobilePopupBox?.height ?? 0)).toBeLessThanOrEqual(mobileNavBox?.y ?? 0);

  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  const offlineNotice = page.getByText('You are offline').locator('..').locator('..');
  await expect(offlineNotice).toBeVisible();
  const raisedPopupBox = await mobilePopup.boundingBox();
  const offlineNoticeBox = await offlineNotice.boundingBox();
  expect((raisedPopupBox?.y ?? 0) + (raisedPopupBox?.height ?? 0)).toBeLessThanOrEqual(offlineNoticeBox?.y ?? 0);

  await page.evaluate(async () => {
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('aitask:pwa-update-ready'));
    const toastPath = '/src/store/useToastStore.ts';
    const { useToastStore } = await import(toastPath);
    useToastStore.getState().addToast('Mobile overlay QA', 'info');
  });
  const updateNotice = page.getByText('New version ready').locator('..').locator('..');
  const mobileToast = page.getByText('Mobile overlay QA').locator('..');
  await expect(updateNotice).toBeVisible();
  await expect(mobileToast).toBeVisible();
  const pwaPopupBox = await mobilePopup.boundingBox();
  const updateNoticeBox = await updateNotice.boundingBox();
  const mobileToastBox = await mobileToast.boundingBox();
  expect((pwaPopupBox?.y ?? 0) + (pwaPopupBox?.height ?? 0)).toBeLessThanOrEqual(updateNoticeBox?.y ?? 0);
  expect((mobileToastBox?.y ?? 0) + (mobileToastBox?.height ?? 0)).toBeLessThanOrEqual(pwaPopupBox?.y ?? 0);
  await mobilePopup.getByRole('button', { name: 'Dismiss notification: Mobile Popup QA' }).click();

  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks Management' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Workflow' })).toHaveCount(0);
  await expect(page.getByText(/^Client: (Pending|Approved|Rejected)$/)).toHaveCount(0);
  const newTaskButton = page.getByRole('button', { name: 'New task' });
  await expect(newTaskButton).toBeVisible();
  await newTaskButton.click();
  const createTaskDialog = page.getByRole('dialog', { name: 'Create Task' });
  await expect(createTaskDialog).toBeVisible();
  await expect(createTaskDialog.getByText('4. Files and notes')).toBeVisible();
  await expect(createTaskDialog.getByLabel('Recurrence')).toHaveCount(0);
  const taskDepartment = createTaskDialog.getByLabel(/Assign to Position\/Department/);
  await expect(taskDepartment.locator('option[value="Videoshooting"]')).toHaveCount(0);
  await expect(taskDepartment.locator('option[value="Video Shooting"]')).toHaveCount(1);
  await expect(taskDepartment.locator('option[value="Editor"]')).toHaveCount(0);
  await expect(taskDepartment.locator('option[value="Video Editor"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(createTaskDialog).toBeHidden();
  await expect(newTaskButton).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();
  const calendarDates = await page.evaluate(() => {
    const raw = window.localStorage.getItem('market-task-storage');
    if (!raw) throw new Error('Expected local AiTask state');
    const stored = JSON.parse(raw);
    const currentUser = stored.state.currentUser;
    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 8);
    const due = new Date(start);
    due.setDate(start.getDate() + 2);
    const extendedDue = new Date(start);
    extendedDue.setDate(start.getDate() + 4);
    const moveTarget = new Date(start);
    moveTarget.setDate(start.getDate() + 7);
    const movedDue = new Date(extendedDue);
    movedDue.setDate(extendedDue.getDate() + 7);
    const resizedStart = new Date(moveTarget);
    resizedStart.setDate(moveTarget.getDate() + 1);
    const resizedDue = new Date(movedDue);
    resizedDue.setDate(movedDue.getDate() + 2);
    stored.state.tasks.unshift({
      id: 'calendar-range-qa',
      clientName: 'Calendar QA',
      serviceType: 'Design',
      title: 'Calendar Range QA',
      description: '',
      department: 'Management',
      assignedTo: currentUser.id,
      createdBy: currentUser.id,
      startDate: toDateKey(start),
      dueDate: toDateKey(due),
      priority: 'Medium',
      status: 'In Progress',
      completionPercentage: 25,
      isCompleted: false,
      revisionCount: 0,
      clientApprovalStatus: 'Pending',
      isRecurring: false,
      comments: [],
      approvalHistory: [],
    });
    window.localStorage.setItem('market-task-storage', JSON.stringify(stored));
    return {
      start: toDateKey(start),
      due: toDateKey(due),
      extendedDue: toDateKey(extendedDue),
      moveTarget: toDateKey(moveTarget),
      movedDue: toDateKey(movedDue),
      resizedStart: toDateKey(resizedStart),
      resizedDue: toDateKey(resizedDue),
    };
  });
  await page.reload();
  await page.locator(`[data-calendar-date="${calendarDates.start}"]`).click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole('group', { name: /Calendar Range QA/ }).first()).toBeVisible();
  await expect(page.getByText('1 active task')).toBeVisible();
  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().click();
  const dateEditor = page.getByRole('dialog', { name: 'Edit task dates' });
  await expect(dateEditor).toBeVisible();
  await expect(dateEditor.getByLabel('Start Date')).toHaveValue(calendarDates.start);
  await expect(dateEditor.getByLabel(/Due Date/)).toHaveValue(calendarDates.due);
  await dateEditor.getByLabel(/Due Date/).fill(calendarDates.extendedDue);
  await dateEditor.getByRole('button', { name: 'Save dates' }).click();
  await expect(dateEditor).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Calendar Range QA · dates updated' })).toBeVisible();
  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Edit task dates' }).getByLabel(/Due Date/)).toHaveValue(calendarDates.extendedDue);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().dragTo(
    page.locator(`[data-calendar-date="${calendarDates.moveTarget}"]`),
    {
      sourcePosition: { x: 12, y: 10 },
      targetPosition: { x: 24, y: 30 },
    },
  );
  await expect(page.getByRole('status').filter({ hasText: 'date range moved' })).toBeVisible();
  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Edit task dates' }).getByLabel('Start Date')).toHaveValue(calendarDates.moveTarget);
  await expect(page.getByRole('dialog', { name: 'Edit task dates' }).getByLabel(/Due Date/)).toHaveValue(calendarDates.movedDue);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Adjust due date for Calendar Range QA' }).dragTo(
    page.locator(`[data-calendar-date="${calendarDates.resizedDue}"]`),
    { targetPosition: { x: 24, y: 30 } },
  );
  await expect(page.getByRole('status').filter({ hasText: 'due date adjusted' })).toBeVisible();
  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Edit task dates' }).getByLabel(/Due Date/)).toHaveValue(calendarDates.resizedDue);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Adjust start date for Calendar Range QA' }).dragTo(
    page.locator(`[data-calendar-date="${calendarDates.resizedStart}"]`),
    { targetPosition: { x: 24, y: 30 } },
  );
  await expect(page.getByRole('status').filter({ hasText: 'start date adjusted' })).toBeVisible();
  await page.getByRole('button', { name: /Edit dates for Calendar Range QA/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Edit task dates' }).getByLabel('Start Date')).toHaveValue(calendarDates.resizedStart);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: /Calendar Range QA/ }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDateButton = page.getByRole('button', { name: 'Edit dates for Calendar Range QA' });
  await expect(mobileDateButton).toBeVisible();
  await mobileDateButton.click();
  const mobileDateEditor = page.getByRole('dialog', { name: 'Edit task dates' });
  await expect(mobileDateEditor).toBeVisible();
  await expect(mobileDateEditor.getByLabel('Start Date')).toBeVisible();
  await expect(mobileDateEditor.getByLabel(/Due Date/)).toBeVisible();
  const mobileEditorBox = await mobileDateEditor.boundingBox();
  expect((mobileEditorBox?.x ?? 0) + (mobileEditorBox?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto('/clients');
  const techNovaRow = page.getByRole('row').filter({ hasText: 'TechNova' });
  const techNovaDetails = techNovaRow.getByRole('button', { name: 'Details' });
  await techNovaDetails.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(techNovaDetails).toBeFocused();

  await page.goto('/projects');
  const newCompanyButton = page.getByRole('button', { name: 'New company' });
  await newCompanyButton.click();
  const createCompanyDialog = page.getByRole('dialog', { name: 'Create company' });
  await expect(createCompanyDialog).toBeVisible();
  await expect(createCompanyDialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(createCompanyDialog).toBeHidden();

  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible();
  await expect(page.getByText('Client Access', { exact: true })).toBeVisible();
  await expect(page.getByText('Task Access', { exact: true })).toBeVisible();
  await expect(page.getByText('View all tasks', { exact: true })).toBeVisible();
  await expect(page.getByText('View all clients', { exact: true })).toBeVisible();
  await expect(page.getByText('Manage assigned clients', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1536, height: 864 },
  ];
  const routes = ['/', '/tasks', '/calendar', '/clients', '/projects', '/settings', '/reports'];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, `${route} should not overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('market-task-storage');
    if (!raw) throw new Error('Expected local AiTask state');
    const stored = JSON.parse(raw);
    stored.state.currentUser = {
      ...stored.state.currentUser,
      id: 'e2e-task-only-role',
      name: 'Task Only User',
      role: 'Staff',
      isSuperAdmin: false,
      mustResetPassword: false,
      permissions: {
        viewDashboard: false,
        viewTasks: true,
        viewCalendar: false,
        viewProjects: false,
        viewAllTasks: false,
        viewAllClients: false,
        manageAssignedClients: false,
        viewReports: false,
        viewApprovals: false,
        viewSettings: false,
        createTasks: false,
        editTasks: false,
        createProjects: false,
        manageUsers: false,
        approveRegistrations: false,
        deleteUsers: false,
        clientReview: false,
      },
    };
    window.localStorage.setItem('market-task-storage', JSON.stringify(stored));
    window.sessionStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByText('Dashboard', { exact: true })).toHaveCount(0);
  await expect(mobileNav.getByText('Tasks', { exact: true })).toBeVisible();
  await expect(mobileNav.getByText('Calendar', { exact: true })).toHaveCount(0);

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks Management' })).toBeVisible();
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('market-task-storage');
    if (!raw) throw new Error('Expected local AiTask state');
    const stored = JSON.parse(raw);
    stored.state.currentUser.mustResetPassword = true;
    window.localStorage.setItem('market-task-storage', JSON.stringify(stored));
  });
  await page.reload();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Account Setup' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Workspace' })).toHaveCount(0);
});
