/** Traceable action lifecycle linked to source reports. */
function listActions_(context, payload) {
  let actions = findAll_('ACTIONS', function (row) { return row.organization_id === context.organizationId; });
  actions = actions.filter(function (action) {
    const assignee = getById_('USERS', action.assigned_to);
    if (context.role === ROLE.EMPLOYEE) return action.assigned_to === context.userId || action.created_by === context.userId;
    if (context.role === ROLE.HOD) return assignee && assignee.department_id === context.departmentId;
    return true;
  });
  if (payload.status) actions = actions.filter(function (row) { return row.status === payload.status; });
  if (payload.priority) actions = actions.filter(function (row) { return row.priority === payload.priority; });
  if (payload.assigneeId) actions = actions.filter(function (row) { return row.assigned_to === payload.assigneeId; });
  if (payload.departmentId) actions = actions.filter(function (row) {
    const assignee = getById_('USERS', row.assigned_to); return assignee && assignee.department_id === payload.departmentId;
  });
  const query = cleanText_(payload.query, 160).toLowerCase();
  return actions.map(function (action) {
    const assignee = getById_('USERS', action.assigned_to);
    const creator = getById_('USERS', action.created_by);
    const department = assignee ? getById_('DEPARTMENTS', assignee.department_id) : null;
    return Object.assign({}, action, {
      assigneeName: assignee ? assignee.display_name : 'Unknown',
      creatorName: creator ? creator.display_name : 'Unknown',
      departmentName: department ? department.name : '',
      ageDays: Math.max(0, Math.floor((Date.now() - new Date(action.created_at).getTime()) / 86400000)),
    });
  }).filter(function (row) {
    return !query || [row.instruction, row.assigneeName, row.departmentName, row.action_id].join(' ').toLowerCase().indexOf(query) !== -1;
  }).sort(function (a, b) {
    const overdueA = new Date(a.due_at).getTime() < Date.now() && !['VERIFIED', 'CANCELLED'].includes(a.status) ? 0 : 1;
    const overdueB = new Date(b.due_at).getTime() < Date.now() && !['VERIFIED', 'CANCELLED'].includes(b.status) ? 0 : 1;
    return overdueA - overdueB || a.due_at.localeCompare(b.due_at);
  }).slice(0, 500);
}

function getActionDetails_(context, payload) {
  const action = getById_('ACTIONS', payload.actionId);
  requireOrganization_(context, action);
  const assignee = getById_('USERS', action.assigned_to);
  if (context.role === ROLE.EMPLOYEE) assert_(action.assigned_to === context.userId || action.created_by === context.userId, 'You cannot view this action.', 'FORBIDDEN');
  else requireDepartmentScope_(context, assignee && assignee.department_id);
  return {
    action: action, assignee: assignee, creator: getById_('USERS', action.created_by), verifier: getById_('USERS', action.verifier_id),
    sourceReport: action.source_submission_id ? getById_('REPORT_SUBMISSIONS', action.source_submission_id) : null,
    events: findAll_('ACTION_EVENTS', function (row) { return row.action_id === action.action_id; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }),
    audit: findAll_('AUDIT_EVENTS', function (row) { return row.entity_id === action.action_id; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }),
  };
}

function createAction_(context, payload) {
  requireRole_(context, MANAGER_ROLES);
  const instruction = cleanText_(payload.instruction, 5000);
  const priority = cleanText_(payload.priority, 20).toUpperCase();
  assert_(instruction, 'Instruction is required.');
  assert_(PRIORITIES.indexOf(priority) !== -1, 'Invalid priority.');
  assert_(payload.dueAt && !isNaN(new Date(payload.dueAt).getTime()), 'A valid deadline is required.');
  const assignee = getById_('USERS', payload.assignedTo);
  requireOrganization_(context, assignee);
  assert_(asBool_(assignee.active), 'Assignee is inactive.');
  requireManagerScope_(context, assignee.department_id);
  if (payload.sourceSubmissionId) {
    const submission = getById_('REPORT_SUBMISSIONS', payload.sourceSubmissionId);
    requireOrganization_(context, submission);
  }
    const reportOwner = getById_('USERS', submission.submitted_by);
    requireManagerScope_(context, reportOwner && reportOwner.department_id);
  const verifierId = payload.verifierId || context.userId;
  const verifier = getById_('USERS', verifierId);
  requireOrganization_(context, verifier);
  return withScriptLock_(function () {
    const timestamp = nowIso_();
    const action = insert_('ACTIONS', {
      organization_id: context.organizationId, source_submission_id: payload.sourceSubmissionId || '',
      created_by: context.userId, assigned_to: assignee.user_id, verifier_id: verifier.user_id,
      instruction: instruction, priority: priority, due_at: new Date(payload.dueAt).toISOString(),
      status: STATUS.ACTION_ASSIGNED, acknowledged_at: '', completed_at: '', verified_at: '', completion_comment: '',
      created_at: timestamp, updated_at: timestamp,
    });
    insert_('ACTION_EVENTS', {
      action_id: action.action_id, event_type: 'ASSIGNED', actor_id: context.userId,
      comment: cleanText_(payload.comment, 2000), evidence_ref: '', created_at: timestamp,
    });
    appendAudit_(context, 'ACTION', action.action_id, 'ACTION_CREATED', {}, action);
    queueNotification_(context, notificationEventKey_('ACTION', action.action_id, 'ASSIGNED', 'ONCE', assignee.email), assignee.email, 'EMAIL', 'ACTION_ASSIGNED', {
      recipientName: assignee.display_name, actionId: action.action_id, instruction: action.instruction,
      priority: action.priority, dueAt: action.due_at, assignedBy: context.displayName,
    });
    return action;
  });
}

function transitionAction_(context, payload) {
  const action = getById_('ACTIONS', payload.actionId);
  requireOrganization_(context, action);
  const assignee = getById_('USERS', action.assigned_to);
  const target = cleanText_(payload.status, 30).toUpperCase();
  assert_(transitionAllowed_(action.status, target), 'That status transition is not allowed.', 'INVALID_STATE');
  const isAssignee = action.assigned_to === context.userId;
  const isManager = MANAGER_ROLES.indexOf(context.role) !== -1 && canManageDepartment_(context, assignee.department_id);
  if (target === STATUS.ACTION_ACKNOWLEDGED) {
    assert_(isAssignee && !action.acknowledged_at, 'Only the assignee can acknowledge this action, exactly once.', 'FORBIDDEN');
  }
  if ([STATUS.ACTION_IN_PROGRESS, STATUS.ACTION_COMPLETED].indexOf(target) !== -1) assert_(isAssignee || isManager, 'Only the assignee or an authorized manager can update this action.', 'FORBIDDEN');
  if ([STATUS.ACTION_VERIFIED, STATUS.ACTION_CANCELLED].indexOf(target) !== -1 || (action.status === STATUS.ACTION_COMPLETED && target === STATUS.ACTION_IN_PROGRESS)) assert_(isManager, 'Manager authority is required.', 'FORBIDDEN');
  if (target === STATUS.ACTION_VERIFIED) {
    assert_(action.status === STATUS.ACTION_COMPLETED, 'Only completed actions can be verified.');
    assert_(context.userId !== action.assigned_to, 'The assignee cannot verify their own completion.');
  }
  const comment = cleanText_(payload.comment, 5000);
  const evidenceRef = cleanText_(payload.evidenceRef, 2000);
  if (target === STATUS.ACTION_COMPLETED) assert_(comment || evidenceRef, 'Add a completion comment or evidence link.');
  if (evidenceRef) assert_(/^https:\/\//i.test(evidenceRef), 'Evidence links must use https.');
  return withScriptLock_(function () {
    const timestamp = nowIso_();
    const patch = { status: target, updated_at: timestamp };
    if (target === STATUS.ACTION_ACKNOWLEDGED && !action.acknowledged_at) patch.acknowledged_at = timestamp;
    if (target === STATUS.ACTION_COMPLETED) { patch.completed_at = timestamp; patch.completion_comment = comment; }
    if (target === STATUS.ACTION_VERIFIED) patch.verified_at = timestamp;
    if (target === STATUS.ACTION_IN_PROGRESS && action.status === STATUS.ACTION_COMPLETED) { patch.completed_at = ''; patch.verified_at = ''; }
    const updated = update_('ACTIONS', action.action_id, patch);
    insert_('ACTION_EVENTS', {
      action_id: action.action_id, event_type: target, actor_id: context.userId,
      comment: comment, evidence_ref: evidenceRef, created_at: timestamp,
    });
    appendAudit_(context, 'ACTION', action.action_id, 'ACTION_' + target, action, updated);
    const verifier = getById_('USERS', action.verifier_id || action.created_by);
    if (target === STATUS.ACTION_COMPLETED && verifier) {
      queueNotification_(context, notificationEventKey_('ACTION', action.action_id, 'COMPLETED', 'ONCE', verifier.email), verifier.email, 'EMAIL', 'ACTION_COMPLETED', {
        recipientName: verifier.display_name, actionId: action.action_id, instruction: action.instruction,
        assigneeName: assignee.display_name, comment: comment, dueAt: action.due_at,
      });
    }
    if ([STATUS.ACTION_VERIFIED, STATUS.ACTION_IN_PROGRESS, STATUS.ACTION_CANCELLED].indexOf(target) !== -1) {
      queueNotification_(context, notificationEventKey_('ACTION', action.action_id, target, timestamp.slice(0, 10), assignee.email), assignee.email, 'EMAIL', 'ACTION_' + target, {
        recipientName: assignee.display_name, actionId: action.action_id, instruction: action.instruction,
        reviewerName: context.displayName, comment: comment, dueAt: action.due_at,
      });
    }
    return updated;
  });
}
