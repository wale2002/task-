(function () {
  'use strict';

  const iso = function (days, hour) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour || 17, 0, 0, 0);
    return date.toISOString();
  };

  const departments = [
    { department_id: 'DEP-OPS', name: 'Operations', hod_user_id: 'USR-AMAKA', active: true },
    { department_id: 'DEP-FIN', name: 'Finance', hod_user_id: 'USR-TUNDE', active: true },
    { department_id: 'DEP-SALES', name: 'Sales', hod_user_id: 'USR-ZAINAB', active: true },
    { department_id: 'DEP-HR', name: 'People & Culture', hod_user_id: 'USR-NGOZI', active: true },
  ];
  const users = [
    { user_id: 'USR-CEO', display_name: 'Adewusi Oluwaferanmi', email: 'ceo@example.com', role: 'CEO', department_id: 'DEP-OPS', manager_user_id: '', active: true },
    { user_id: 'USR-AMAKA', display_name: 'Amaka Okafor', email: 'amaka@example.com', role: 'HOD', department_id: 'DEP-OPS', manager_user_id: 'USR-CEO', active: true },
    { user_id: 'USR-TUNDE', display_name: 'Tunde Balogun', email: 'tunde@example.com', role: 'HOD', department_id: 'DEP-FIN', manager_user_id: 'USR-CEO', active: true },
    { user_id: 'USR-ZAINAB', display_name: 'Zainab Musa', email: 'zainab@example.com', role: 'HOD', department_id: 'DEP-SALES', manager_user_id: 'USR-CEO', active: true },
    { user_id: 'USR-NGOZI', display_name: 'Ngozi Eze', email: 'ngozi@example.com', role: 'HR', department_id: 'DEP-HR', manager_user_id: 'USR-CEO', active: true },
  ];
  const templates = [
    { template_id: 'TPL-WEEKLY', name: 'Weekly Operations Report', description: 'Operational delivery, incidents, and next-week priorities', department_id: 'DEP-OPS', frequency: 'WEEKLY', version: 3, fieldCount: 5, assignmentCount: 1, status: 'ACTIVE', due_rule_json: '{"dueTime":"17:00","weekday":5}' },
    { template_id: 'TPL-CASH', name: 'Cash & Collections Snapshot', description: 'Collections, receivables, and cash exposure', department_id: 'DEP-FIN', frequency: 'WEEKLY', version: 2, fieldCount: 4, assignmentCount: 1, status: 'ACTIVE', due_rule_json: '{"dueTime":"15:00","weekday":5}' },
    { template_id: 'TPL-PIPELINE', name: 'Commercial Pipeline Review', description: 'Pipeline movement, risks, and committed revenue', department_id: 'DEP-SALES', frequency: 'MONTHLY', version: 1, fieldCount: 6, assignmentCount: 1, status: 'DRAFT', due_rule_json: '{"dueTime":"16:00","dayOfMonth":28}' },
  ];
  const reportFields = [
    { field_id: 'FLD-SUMMARY', field_name: 'Executive summary', field_type: 'LONG_TEXT', required: 'true', options_json: '[]' },
    { field_id: 'FLD-STATUS', field_name: 'Overall status', field_type: 'STATUS', required: 'true', options_json: '["ON_TRACK","AT_RISK","OFF_TRACK"]' },
    { field_id: 'FLD-PROGRESS', field_name: 'Delivery progress', field_type: 'PERCENTAGE', required: 'true', options_json: '[]' },
    { field_id: 'FLD-RISK', field_name: 'Top risk or blocker', field_type: 'LONG_TEXT', required: 'false', options_json: '[]' },
  ];
  const reports = [
    { submission_id: 'RPT-1048', templateName: 'Weekly Operations Report', reporterName: 'Amaka Okafor', departmentName: 'Operations', periodStart: '2026-09-14', status: 'SUBMITTED', submitted_at: iso(-2, 16) },
    { submission_id: 'RPT-1044', templateName: 'Cash & Collections Snapshot', reporterName: 'Tunde Balogun', departmentName: 'Finance', periodStart: '2026-09-14', status: 'REVIEWED', submitted_at: iso(-3, 13) },
    { submission_id: 'RPT-1037', templateName: 'Weekly Operations Report', reporterName: 'Amaka Okafor', departmentName: 'Operations', periodStart: '2026-09-07', status: 'CLARIFICATION_REQUIRED', submitted_at: iso(-9, 17) },
  ];
  const actions = [
    { action_id: 'ACT-208', instruction: 'Resolve the recurring dispatch reconciliation gap and attach evidence', assigned_to: 'USR-AMAKA', assigneeName: 'Amaka Okafor', departmentName: 'Operations', priority: 'CRITICAL', due_at: iso(-1, 12), status: 'OVERDUE', ageDays: 5, created_by: 'USR-CEO', verifier_id: 'USR-CEO' },
    { action_id: 'ACT-204', instruction: 'Confirm recovery plan for overdue enterprise receivables', assigned_to: 'USR-TUNDE', assigneeName: 'Tunde Balogun', departmentName: 'Finance', priority: 'HIGH', due_at: iso(1, 15), status: 'IN_PROGRESS', ageDays: 3, created_by: 'USR-CEO', verifier_id: 'USR-CEO' },
    { action_id: 'ACT-197', instruction: 'Publish the September hiring and capacity forecast', assigned_to: 'USR-NGOZI', assigneeName: 'Ngozi Eze', departmentName: 'People & Culture', priority: 'MEDIUM', due_at: iso(3, 16), status: 'ACKNOWLEDGED', ageDays: 2, created_by: 'USR-CEO', verifier_id: 'USR-CEO' },
  ];
  const audit = [
    { created_at: iso(-1, 11), event_type: 'ACTION_OVERDUE', entity_type: 'ACTION', actor_id: 'SYSTEM', entity_id: 'ACT-208' },
    { created_at: iso(-2, 16), event_type: 'REPORT_SUBMITTED', entity_type: 'SUBMISSION', actor_id: 'USR-AMAKA', entity_id: 'RPT-1048' },
    { created_at: iso(-3, 14), event_type: 'REPORT_REVIEWED', entity_type: 'SUBMISSION', actor_id: 'USR-CEO', entity_id: 'RPT-1044' },
  ];

  const options = {
    roles: ['EMPLOYEE', 'HOD', 'HR', 'CEO', 'ADMIN'],
    priorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    frequencies: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'AD_HOC'],
    fieldTypes: ['TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE', 'TIME', 'DROPDOWN', 'STATUS', 'PRIORITY', 'EMPLOYEE', 'DEPARTMENT', 'YES_NO', 'URL', 'FILE'],
  };
  const permissions = { manageTemplates: true, manageUsers: true, manageDepartments: true, viewAudit: true, viewHealth: true, createActions: true, reviewReports: true };

  function findUser(id) { return users.find(function (item) { return item.user_id === id; }) || users[0]; }
  function findTemplate(id) { return templates.find(function (item) { return item.template_id === id; }) || templates[0]; }
  function demo(method, payload) {
    payload = payload || {};
    if (method === 'bootstrap') return { app: { name: 'Accountability Hub' }, context: { userId: 'USR-CEO', displayName: 'Adewusi Oluwaferanmi', role: 'CEO', departmentId: 'DEP-OPS', organizationName: 'Management Accountability Office' }, permissions: permissions, options: options };
    if (method === 'departments') return departments;
    if (method === 'users') return users;
    if (method === 'templates') return templates;
    if (method === 'dashboard') return {
      cards: { expected: 18, submitted: 14, missing: 2, awaitingReview: 3, openActions: 8, overdueActions: 1 },
      compliance: [
        { departmentName: 'Operations', expected: 5, submitted: 4, missing: 1, complianceRate: 80 },
        { departmentName: 'Finance', expected: 4, submitted: 4, missing: 0, complianceRate: 100 },
        { departmentName: 'Sales', expected: 5, submitted: 3, missing: 1, complianceRate: 60 },
        { departmentName: 'People & Culture', expected: 4, submitted: 3, missing: 0, complianceRate: 75 },
      ],
      attention: [
        { id: 'ACT-208', type: 'OVERDUE_ACTION', title: 'Dispatch reconciliation is overdue', owner: 'Amaka Okafor', dueAt: iso(-1), severity: 'CRITICAL' },
        { id: 'RPT-1048', type: 'AWAITING_REVIEW', title: 'Weekly Operations Report needs review', owner: 'Amaka Okafor', dueAt: iso(-2), severity: 'HIGH' },
        { id: 'OBL-303', type: 'MISSING_REPORT', title: 'Commercial pipeline report is missing', owner: 'Zainab Musa', dueAt: iso(-1), severity: 'HIGH' },
      ],
    };
    if (method === 'myObligations') return [
      { obligation_id: 'OBL-301', bucket: 'DUE', templateName: 'Weekly Operations Report', frequency: 'WEEKLY', due_at: iso(1), status: 'OPEN' },
      { obligation_id: 'OBL-302', bucket: 'UPCOMING', templateName: 'Cash & Collections Snapshot', frequency: 'WEEKLY', due_at: iso(4), status: 'OPEN' },
      { obligation_id: 'OBL-300', bucket: 'SUBMITTED', templateName: 'Weekly Operations Report', frequency: 'WEEKLY', due_at: iso(-6), status: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
    ];
    if (method === 'reportForm') return { obligation: { period_start: '2026-09-21', period_end: '2026-09-27', due_at: iso(1) }, template: findTemplate('TPL-WEEKLY'), fields: reportFields, values: { 'FLD-PROGRESS': 72 }, attachments: [], submission: null };
    if (method === 'reports') return reports;
    if (method === 'report') {
      const row = reports.find(function (item) { return item.submission_id === payload.submissionId; }) || reports[0];
      return { submission: row, template: findTemplate(row.templateName.indexOf('Cash') >= 0 ? 'TPL-CASH' : 'TPL-WEEKLY'), reporter: users.find(function (item) { return item.display_name === row.reporterName; }) || users[1], fields: reportFields, values: { 'FLD-SUMMARY': 'Core delivery is stable. Two exceptions require management attention.', 'FLD-STATUS': 'AT_RISK', 'FLD-PROGRESS': '78', 'FLD-RISK': 'Delayed reconciliation from one operating unit.' }, attachments: [], reviews: row.status === 'REVIEWED' ? [{ decision: 'APPROVE', created_at: iso(-3), comment: 'Reviewed and accepted.' }] : [], actions: row.submission_id === 'RPT-1048' ? [actions[0]] : [] };
    }
    if (method === 'actions') return actions;
    if (method === 'action') {
      const action = actions.find(function (item) { return item.action_id === payload.actionId; }) || actions[0];
      return { action: action, assignee: findUser(action.assigned_to), creator: findUser(action.created_by), verifier: findUser(action.verifier_id), events: [{ event_type: 'ACTION_ASSIGNED', created_at: iso(-action.ageDays), comment: 'Assigned with automatic email notification.' }, { event_type: action.status, created_at: iso(-1), comment: action.status === 'OVERDUE' ? 'Escalation notice queued.' : 'Status updated by owner.' }] };
    }
    if (method === 'template') return { template: findTemplate(payload.templateId), fields: reportFields };
    if (method === 'audit') return audit;
    if (method === 'health') return { notifications: { SENT: 42, QUEUED: 2, FAILED: 0 }, mailQuotaRemaining: 1438, triggers: [{ handler: 'runHourlyAutomation', source: 'CLOCK' }, { handler: 'runDailyDigest', source: 'CLOCK' }], failed: [] };
    if (method === 'settings') return { settings: [{ key: 'ACKNOWLEDGEMENT_SLA_HOURS', value: '24' }, { key: 'DUE_SOON_HOURS', value: '24' }, { key: 'ESCALATION_LEVEL_2_HOURS', value: '72' }, { key: 'ESCALATION_LEVEL_3_HOURS', value: '168' }, { key: 'RETENTION_POLICY', value: 'Operational records retained for 7 years.' }], automationInstalled: ['Hourly reminders', 'Daily digest'] };
    if (method === 'createAction') {
      const assignee = findUser(payload.assignedTo);
      actions.unshift({ action_id: 'ACT-' + (210 + actions.length), instruction: payload.instruction, assigned_to: assignee.user_id, assigneeName: assignee.display_name, departmentName: (departments.find(function (item) { return item.department_id === assignee.department_id; }) || {}).name, priority: payload.priority, due_at: payload.dueAt, status: 'ASSIGNED', ageDays: 0, created_by: 'USR-CEO', verifier_id: payload.verifierId });
      return actions[0];
    }
    if (method === 'transitionAction') {
      const action = actions.find(function (item) { return item.action_id === payload.actionId; });
      if (action) action.status = payload.status;
      return action;
    }
    if (method === 'saveDepartment' || method === 'saveUser' || method === 'saveSettings' || method === 'saveAssignment' || method === 'generateObligations' || method === 'retryNotification' || method === 'reviewReport' || method === 'saveDraft' || method === 'submitReport') return { saved: true };
    if (method === 'saveTemplate') return { template: { version: 1 } };
    if (method === 'publishTemplate' || method === 'archiveTemplate') return { updated: true };
    throw new Error('Unsupported preview operation: ' + method);
  }

  function runner() {
    let onSuccess = function () {};
    let onFailure = function () {};
    return {
      withSuccessHandler: function (callback) { onSuccess = callback; return this; },
      withFailureHandler: function (callback) { onFailure = callback; return this; },
      api: function (method, payload) {
        setTimeout(function () {
          try { onSuccess({ ok: true, data: demo(method, payload) }); }
          catch (error) { onFailure(error); }
        }, 90);
      },
    };
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { configurable: true, get: runner });
}());
