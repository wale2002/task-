/** Organization, department, user, settings, audit, and health operations. */
function listDepartments_(context) {
  return findAll_('DEPARTMENTS', function (row) {
    return row.organization_id === context.organizationId && canSeeDepartment_(context, row.department_id);
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function saveDepartment_(context, payload) {
  requireRole_(context, [ROLE.ADMIN]);
  const name = cleanText_(payload.name, 160);
  assert_(name, 'Department name is required.');
  if (payload.hodUserId) requireOrganization_(context, getById_('USERS', payload.hodUserId));
  return withScriptLock_(function () {
    const timestamp = nowIso_();
    if (payload.departmentId) {
      const existing = getById_('DEPARTMENTS', payload.departmentId);
      requireOrganization_(context, existing);
      const updated = update_('DEPARTMENTS', existing.department_id, {
        name: name, hod_user_id: payload.hodUserId || '', active: payload.active !== false, updated_at: timestamp,
      });
      appendAudit_(context, 'DEPARTMENT', updated.department_id, 'DEPARTMENT_UPDATED', existing, updated);
      return updated;
    }
    const created = insert_('DEPARTMENTS', {
      organization_id: context.organizationId, name: name, hod_user_id: payload.hodUserId || '',
      active: payload.active !== false, created_at: timestamp, updated_at: timestamp,
    });
    appendAudit_(context, 'DEPARTMENT', created.department_id, 'DEPARTMENT_CREATED', {}, created);
    return created;
  });
}

function listUsers_(context, payload) {
  let users = findAll_('USERS', function (row) {
    if (row.organization_id !== context.organizationId) return false;
    if ([ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.VIEWER].indexOf(context.role) !== -1) return true;
    if (context.role === ROLE.HOD) return row.department_id === context.departmentId;
    return row.user_id === context.userId;
  });
  if (payload && payload.activeOnly) users = users.filter(function (row) { return asBool_(row.active); });
  return users.sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
}

function saveUser_(context, payload) {
  requireRole_(context, [ROLE.ADMIN]);
  const email = normalizeEmail_(payload.email);
  const displayName = cleanText_(payload.displayName, 160);
  const role = cleanText_(payload.role, 30).toUpperCase();
  assert_(isEmail_(email), 'A valid email is required.');
  assert_(displayName, 'Display name is required.');
  assert_(ROLE_VALUES.indexOf(role) !== -1, 'Invalid role.');
  const organization = getById_('ORGANIZATIONS', context.organizationId);
  if (organization.domain) assert_(email.endsWith('@' + organization.domain.toLowerCase()), 'User must belong to the approved Workspace domain.');
  if (payload.departmentId) requireOrganization_(context, getById_('DEPARTMENTS', payload.departmentId));
  if (payload.managerUserId) requireOrganization_(context, getById_('USERS', payload.managerUserId));
  return withScriptLock_(function () {
    const duplicate = findOne_('USERS', function (row) {
      return row.organization_id === context.organizationId && normalizeEmail_(row.email) === email && row.user_id !== payload.userId;
    });
    assert_(!duplicate, 'This email is already registered.');
    const timestamp = nowIso_();
    const patch = {
      email: email, display_name: displayName, department_id: payload.departmentId || '',
      role: role, manager_user_id: payload.managerUserId || '', active: payload.active !== false,
      updated_at: timestamp,
    };
    if (payload.userId) {
      const existing = getById_('USERS', payload.userId);
      requireOrganization_(context, existing);
      assert_(!(existing.user_id === context.userId && payload.active === false), 'You cannot deactivate your own account.');
      const updated = update_('USERS', existing.user_id, patch);
      appendAudit_(context, 'USER', updated.user_id, 'USER_UPDATED', existing, updated);
      return updated;
    }
    const created = insert_('USERS', Object.assign({ organization_id: context.organizationId, created_at: timestamp }, patch));
    appendAudit_(context, 'USER', created.user_id, 'USER_CREATED', {}, created);
    return created;
  });
}

function getSettings_(context) {
  requireRole_(context, [ROLE.ADMIN, ROLE.EXECUTIVE]);
  return {
    organization: getById_('ORGANIZATIONS', context.organizationId),
    settings: findAll_('SETTINGS', function (row) { return row.organization_id === context.organizationId; }),
    automationInstalled: ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); }),
  };
}

function saveSettings_(context, payload) {
  requireRole_(context, [ROLE.ADMIN]);
  const allowed = ['ACKNOWLEDGEMENT_SLA_HOURS', 'DUE_SOON_HOURS', 'ESCALATION_LEVEL_2_HOURS', 'ESCALATION_LEVEL_3_HOURS', 'DAILY_DIGEST_ENABLED', 'RETENTION_POLICY'];
  return withScriptLock_(function () {
    Object.keys(payload.settings || {}).forEach(function (key) {
      assert_(allowed.indexOf(key) !== -1, 'Unsupported setting: ' + key);
      setSetting_(context, key, payload.settings[key]);
    });
    appendAudit_(context, 'ORGANIZATION', context.organizationId, 'SETTINGS_UPDATED', {}, payload.settings || {});
    return getSettings_(context);
  });
}

function listAudit_(context, payload) {
  requireRole_(context, [ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.HOD, ROLE.VIEWER]);
  let events = findAll_('AUDIT_EVENTS', function (row) { return row.organization_id === context.organizationId; });
  if (context.role === ROLE.HOD) {
    const allowedEntities = {};
    findAll_('REPORT_SUBMISSIONS', function (row) { return row.organization_id === context.organizationId; }).forEach(function (submission) {
      const user = getById_('USERS', submission.submitted_by);
      if (user && user.department_id === context.departmentId) allowedEntities[submission.submission_id] = true;
    });
    findAll_('ACTIONS', function (row) { return row.organization_id === context.organizationId; }).forEach(function (action) {
      const user = getById_('USERS', action.assigned_to);
      if (user && user.department_id === context.departmentId) allowedEntities[action.action_id] = true;
    });
    events = events.filter(function (row) { return allowedEntities[row.entity_id] || row.actor_id === context.userId; });
  }
  if (payload.entityType) events = events.filter(function (row) { return row.entity_type === payload.entityType; });
  if (payload.entityId) events = events.filter(function (row) { return row.entity_id === payload.entityId; });
  return events.sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).slice(0, Math.min(Number(payload.limit || 200), 500));
}

function getSystemHealth_(context) {
  requireRole_(context, [ROLE.ADMIN]);
  const outbox = findAll_('NOTIFICATION_OUTBOX', function (row) { return row.organization_id === context.organizationId; });
  const counts = {};
  outbox.forEach(function (item) { counts[item.status] = (counts[item.status] || 0) + 1; });
  return {
    notifications: counts,
    failed: outbox.filter(function (row) { return row.status === 'FAILED'; }).slice(-50).reverse(),
    dataSpreadsheetId: PropertiesService.getScriptProperties().getProperty(APP.PROP_SPREADSHEET_ID),
    mailQuotaRemaining: MailApp.getRemainingDailyQuota(),
    triggers: ScriptApp.getProjectTriggers().map(function (trigger) { return { handler: trigger.getHandlerFunction(), source: String(trigger.getTriggerSource()) }; }),
  };
}

function retryNotification_(context, payload) {
  requireRole_(context, [ROLE.ADMIN]);
  const notification = getById_('NOTIFICATION_OUTBOX', payload.notificationId);
  requireOrganization_(context, notification);
  return update_('NOTIFICATION_OUTBOX', notification.notification_id, {
    status: 'PENDING', attempt_count: 0, next_attempt_at: nowIso_(), claimed_at: '', last_error: '', updated_at: nowIso_(),
  });
}
