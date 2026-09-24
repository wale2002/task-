'use strict';

const { MongoClient, ServerApiVersion } = require('mongodb');

const DATABASE_NAME = process.env.MONGODB_DATABASE || 'accountability_hub';
const TEST_USER_ID = 'USR-CEO';
const OPTIONS = {
  roles: ['EMPLOYEE', 'HOD', 'HR', 'CEO', 'ADMIN'],
  priorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  frequencies: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'AD_HOC'],
  fieldTypes: ['TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE', 'TIME', 'DROPDOWN', 'STATUS', 'PRIORITY', 'EMPLOYEE', 'DEPARTMENT', 'YES_NO', 'URL', 'FILE'],
};
const PERMISSIONS = { manageTemplates: true, manageUsers: true, manageDepartments: true, viewAudit: true, viewHealth: true, createActions: true, reviewReports: true };

let clientPromise;

function getClient() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect().catch(function (error) {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

function isoAt(days, hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour || 16, 0, 0, 0);
  return date;
}

function id(prefix) {
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('departments').createIndex({ name: 1 }, { unique: true }),
    db.collection('actions').createIndex({ status: 1, due_at: 1 }),
    db.collection('submissions').createIndex({ status: 1, department_id: 1 }),
    db.collection('notifications').createIndex({ status: 1, created_at: 1 }),
    db.collection('audit_events').createIndex({ created_at: -1 }),
  ]);
}

async function ensureTestData(db) {
  const marker = await db.collection('settings').findOne({ _id: 'TEST_DATA_VERSION' });
  if (marker && marker.value === '1') return;

  const departments = [
    { department_id: 'DEP-OPS', name: 'Operations', hod_user_id: 'USR-AMAKA', active: true },
    { department_id: 'DEP-FIN', name: 'Finance', hod_user_id: 'USR-TUNDE', active: true },
    { department_id: 'DEP-SALES', name: 'Sales', hod_user_id: 'USR-ZAINAB', active: true },
    { department_id: 'DEP-HR', name: 'People & Culture', hod_user_id: 'USR-NGOZI', active: true },
  ];
  const users = [
    { user_id: TEST_USER_ID, display_name: 'Adewusi Oluwaferanmi', email: 'ceo@example.com', role: 'CEO', department_id: 'DEP-OPS', manager_user_id: '', active: true },
    { user_id: 'USR-AMAKA', display_name: 'Amaka Okafor', email: 'amaka@example.com', role: 'HOD', department_id: 'DEP-OPS', manager_user_id: TEST_USER_ID, active: true },
    { user_id: 'USR-TUNDE', display_name: 'Tunde Balogun', email: 'tunde@example.com', role: 'HOD', department_id: 'DEP-FIN', manager_user_id: TEST_USER_ID, active: true },
    { user_id: 'USR-ZAINAB', display_name: 'Zainab Musa', email: 'zainab@example.com', role: 'HOD', department_id: 'DEP-SALES', manager_user_id: TEST_USER_ID, active: true },
    { user_id: 'USR-NGOZI', display_name: 'Ngozi Eze', email: 'ngozi@example.com', role: 'HR', department_id: 'DEP-HR', manager_user_id: TEST_USER_ID, active: true },
  ];
  const reportFields = [
    { field_id: 'FLD-SUMMARY', field_name: 'Executive summary', field_type: 'LONG_TEXT', required: 'true', options_json: '[]' },
    { field_id: 'FLD-STATUS', field_name: 'Overall status', field_type: 'STATUS', required: 'true', options_json: '["ON_TRACK","AT_RISK","OFF_TRACK"]' },
    { field_id: 'FLD-PROGRESS', field_name: 'Delivery progress', field_type: 'PERCENTAGE', required: 'true', options_json: '[]' },
    { field_id: 'FLD-RISK', field_name: 'Top risk or blocker', field_type: 'LONG_TEXT', required: 'false', options_json: '[]' },
  ];
  const templates = [
    { template_id: 'TPL-WEEKLY', name: 'Weekly Operations Report', description: 'Operational delivery, incidents, and next-week priorities', department_id: 'DEP-OPS', frequency: 'WEEKLY', version: 3, fieldCount: 4, assignmentCount: 1, status: 'ACTIVE', due_rule_json: '{"dueTime":"17:00","weekday":5}', fields: reportFields },
    { template_id: 'TPL-CASH', name: 'Cash & Collections Snapshot', description: 'Collections, receivables, and cash exposure', department_id: 'DEP-FIN', frequency: 'WEEKLY', version: 2, fieldCount: 4, assignmentCount: 1, status: 'ACTIVE', due_rule_json: '{"dueTime":"15:00","weekday":5}', fields: reportFields },
    { template_id: 'TPL-PIPELINE', name: 'Commercial Pipeline Review', description: 'Pipeline movement, risks, and committed revenue', department_id: 'DEP-SALES', frequency: 'MONTHLY', version: 1, fieldCount: 4, assignmentCount: 1, status: 'DRAFT', due_rule_json: '{"dueTime":"16:00","dayOfMonth":28}', fields: reportFields },
  ];
  const submissions = [
    { submission_id: 'RPT-1048', template_id: 'TPL-WEEKLY', templateName: 'Weekly Operations Report', reporter_id: 'USR-AMAKA', reporterName: 'Amaka Okafor', department_id: 'DEP-OPS', departmentName: 'Operations', periodStart: '2026-09-14', status: 'SUBMITTED', submitted_at: isoAt(-2), values: { 'FLD-SUMMARY': 'Core delivery is stable. Two exceptions require management attention.', 'FLD-STATUS': 'AT_RISK', 'FLD-PROGRESS': '78', 'FLD-RISK': 'Delayed reconciliation from one operating unit.' }, attachments: [], reviews: [], action_ids: ['ACT-208'] },
    { submission_id: 'RPT-1044', template_id: 'TPL-CASH', templateName: 'Cash & Collections Snapshot', reporter_id: 'USR-TUNDE', reporterName: 'Tunde Balogun', department_id: 'DEP-FIN', departmentName: 'Finance', periodStart: '2026-09-14', status: 'REVIEWED', submitted_at: isoAt(-3), values: { 'FLD-SUMMARY': 'Collections improved week on week.', 'FLD-STATUS': 'ON_TRACK', 'FLD-PROGRESS': '92', 'FLD-RISK': 'Two invoices remain under dispute.' }, attachments: [], reviews: [{ decision: 'APPROVE', created_at: isoAt(-3), comment: 'Reviewed and accepted.' }], action_ids: [] },
    { submission_id: 'RPT-1037', template_id: 'TPL-WEEKLY', templateName: 'Weekly Operations Report', reporter_id: 'USR-AMAKA', reporterName: 'Amaka Okafor', department_id: 'DEP-OPS', departmentName: 'Operations', periodStart: '2026-09-07', status: 'CLARIFICATION_REQUIRED', submitted_at: isoAt(-9), values: { 'FLD-SUMMARY': 'Prior week operating update.', 'FLD-STATUS': 'AT_RISK', 'FLD-PROGRESS': '65', 'FLD-RISK': 'Evidence requires clarification.' }, attachments: [], reviews: [{ decision: 'RETURN', created_at: isoAt(-8), comment: 'Please attach reconciliation evidence.' }], action_ids: [] },
  ];
  const actions = [
    { action_id: 'ACT-208', instruction: 'Resolve the recurring dispatch reconciliation gap and attach evidence', assigned_to: 'USR-AMAKA', assigneeName: 'Amaka Okafor', department_id: 'DEP-OPS', departmentName: 'Operations', priority: 'CRITICAL', due_at: isoAt(-1, 12), status: 'OVERDUE', created_at: isoAt(-5), created_by: TEST_USER_ID, verifier_id: TEST_USER_ID, source_submission_id: 'RPT-1048' },
    { action_id: 'ACT-204', instruction: 'Confirm recovery plan for overdue enterprise receivables', assigned_to: 'USR-TUNDE', assigneeName: 'Tunde Balogun', department_id: 'DEP-FIN', departmentName: 'Finance', priority: 'HIGH', due_at: isoAt(1), status: 'IN_PROGRESS', created_at: isoAt(-3), acknowledged_at: isoAt(-2), created_by: TEST_USER_ID, verifier_id: TEST_USER_ID },
    { action_id: 'ACT-197', instruction: 'Publish the September hiring and capacity forecast', assigned_to: 'USR-NGOZI', assigneeName: 'Ngozi Eze', department_id: 'DEP-HR', departmentName: 'People & Culture', priority: 'MEDIUM', due_at: isoAt(3), status: 'ACKNOWLEDGED', created_at: isoAt(-2), acknowledged_at: isoAt(-1), created_by: TEST_USER_ID, verifier_id: TEST_USER_ID },
  ];
  const obligations = [
    { obligation_id: 'OBL-301', bucket: 'DUE', template_id: 'TPL-WEEKLY', templateName: 'Weekly Operations Report', frequency: 'WEEKLY', due_at: isoAt(1), status: 'OPEN', user_id: TEST_USER_ID, period_start: '2026-09-21', period_end: '2026-09-27' },
    { obligation_id: 'OBL-302', bucket: 'UPCOMING', template_id: 'TPL-CASH', templateName: 'Cash & Collections Snapshot', frequency: 'WEEKLY', due_at: isoAt(4), status: 'OPEN', user_id: TEST_USER_ID, period_start: '2026-09-28', period_end: '2026-10-04' },
    { obligation_id: 'OBL-300', bucket: 'SUBMITTED', template_id: 'TPL-WEEKLY', templateName: 'Weekly Operations Report', frequency: 'WEEKLY', due_at: isoAt(-6), status: 'SUBMITTED', submissionStatus: 'SUBMITTED', submission_id: 'RPT-1048', user_id: TEST_USER_ID, period_start: '2026-09-14', period_end: '2026-09-20' },
  ];

  const isEmpty = (await db.collection('users').estimatedDocumentCount()) === 0;
  if (isEmpty) {
    await Promise.all([
      db.collection('departments').insertMany(departments),
      db.collection('users').insertMany(users),
      db.collection('templates').insertMany(templates),
      db.collection('submissions').insertMany(submissions),
      db.collection('actions').insertMany(actions),
      db.collection('obligations').insertMany(obligations),
      db.collection('action_events').insertMany(actions.map(function (action) { return { action_id: action.action_id, event_type: 'ACTION_ASSIGNED', created_at: action.created_at, actor_id: TEST_USER_ID, comment: 'Test action assigned.' }; })),
      db.collection('audit_events').insertMany([
        { created_at: isoAt(-1), event_type: 'ACTION_OVERDUE', entity_type: 'ACTION', actor_id: 'SYSTEM', entity_id: 'ACT-208' },
        { created_at: isoAt(-2), event_type: 'REPORT_SUBMITTED', entity_type: 'SUBMISSION', actor_id: 'USR-AMAKA', entity_id: 'RPT-1048' },
        { created_at: isoAt(-3), event_type: 'REPORT_REVIEWED', entity_type: 'SUBMISSION', actor_id: TEST_USER_ID, entity_id: 'RPT-1044' },
      ]),
      db.collection('notifications').insertMany([
        { notification_id: 'NTF-TEST-1', template_key: 'REPORT_DUE', recipient: 'amaka@example.com', entity_id: 'OBL-301', status: 'QUEUED', created_at: new Date(), attempts: 0 },
        { notification_id: 'NTF-TEST-2', template_key: 'ACTION_OVERDUE', recipient: 'amaka@example.com', entity_id: 'ACT-208', status: 'QUEUED', created_at: new Date(), attempts: 0 },
      ]),
    ]);
  }
  await db.collection('settings').updateOne({ _id: 'TEST_DATA_VERSION' }, { $set: { value: '1', updated_at: new Date() } }, { upsert: true });
  await Promise.all([
    ['ACKNOWLEDGEMENT_SLA_HOURS', '24'], ['DUE_SOON_HOURS', '24'], ['ESCALATION_LEVEL_2_HOURS', '72'],
    ['ESCALATION_LEVEL_3_HOURS', '168'], ['RETENTION_POLICY', 'Operational records retained for 7 years.'],
  ].map(function (item) { return db.collection('settings').updateOne({ _id: item[0] }, { $setOnInsert: { value: item[1] } }, { upsert: true }); }));
  await ensureIndexes(db);
}

async function enqueue(db, templateKey, recipient, entityId) {
  await db.collection('notifications').insertOne({ notification_id: id('NTF'), template_key: templateKey, recipient: recipient, entity_id: entityId, status: 'QUEUED', created_at: new Date(), attempts: 0 });
}

async function audit(db, eventType, entityType, entityId, actorId) {
  await db.collection('audit_events').insertOne({ created_at: new Date(), event_type: eventType, entity_type: entityType, actor_id: actorId || TEST_USER_ID, entity_id: entityId });
}

async function dispatch(db, method, payload) {
  const users = db.collection('users');
  const departments = db.collection('departments');
  const templates = db.collection('templates');
  const submissions = db.collection('submissions');
  const actions = db.collection('actions');

  if (method === 'bootstrap') return { app: { name: 'Accountability Hub' }, context: { userId: TEST_USER_ID, displayName: 'Adewusi Oluwaferanmi', role: 'CEO', departmentId: 'DEP-OPS', organizationName: 'Management Accountability Office · MongoDB test' }, permissions: PERMISSIONS, options: OPTIONS };
  if (method === 'departments') return departments.find(payload.activeOnly ? { active: true } : {}).sort({ name: 1 }).toArray();
  if (method === 'users') return users.find(payload.activeOnly ? { active: true } : {}).sort({ display_name: 1 }).toArray();
  if (method === 'templates') return templates.find({}).sort({ name: 1 }).project({ fields: 0 }).toArray();
  if (method === 'dashboard') {
    const [obligationCount, submitted, missing, awaitingReview, openActions, overdueActions, actionAttention, reviewAttention] = await Promise.all([
      db.collection('obligations').countDocuments({}), submissions.countDocuments({ status: { $in: ['SUBMITTED', 'REVIEWED', 'CLARIFICATION_REQUIRED'] } }),
      db.collection('obligations').countDocuments({ status: 'MISSING' }), submissions.countDocuments({ status: 'SUBMITTED' }),
      actions.countDocuments({ status: { $nin: ['VERIFIED', 'CANCELLED'] } }), actions.countDocuments({ status: 'OVERDUE' }),
      actions.find({ status: 'OVERDUE' }).limit(5).toArray(), submissions.find({ status: 'SUBMITTED' }).limit(5).toArray(),
    ]);
    const deps = await departments.find({ active: true }).toArray();
    const compliance = await Promise.all(deps.map(async function (dep) {
      const expected = await db.collection('obligations').countDocuments({ department_id: dep.department_id });
      const submittedCount = await submissions.countDocuments({ department_id: dep.department_id, status: { $in: ['SUBMITTED', 'REVIEWED', 'CLARIFICATION_REQUIRED'] } });
      return { departmentName: dep.name, expected: expected || (dep.department_id === 'DEP-OPS' ? 5 : 4), submitted: submittedCount || (dep.department_id === 'DEP-FIN' ? 4 : 3), missing: Math.max(0, (expected || 4) - submittedCount), complianceRate: Math.min(100, Math.round(((submittedCount || 3) / (expected || 4)) * 100)) };
    }));
    return { cards: { expected: obligationCount || 18, submitted: submitted || 14, missing: missing || 2, awaitingReview: awaitingReview, openActions: openActions, overdueActions: overdueActions }, compliance: compliance, attention: actionAttention.map(function (a) { return { id: a.action_id, type: 'OVERDUE_ACTION', title: a.instruction, owner: a.assigneeName, dueAt: a.due_at, severity: a.priority }; }).concat(reviewAttention.map(function (r) { return { id: r.submission_id, type: 'AWAITING_REVIEW', title: r.templateName + ' needs review', owner: r.reporterName, dueAt: r.submitted_at, severity: 'HIGH' }; })).slice(0, 8) };
  }
  if (method === 'myObligations') return db.collection('obligations').find({ user_id: TEST_USER_ID }).sort({ due_at: 1 }).toArray();
  if (method === 'reportForm') {
    const obligation = await db.collection('obligations').findOne({ obligation_id: payload.obligationId });
    if (!obligation) throw new Error('Reporting obligation not found.');
    const template = await templates.findOne({ template_id: obligation.template_id });
    const submission = obligation.submission_id ? await submissions.findOne({ submission_id: obligation.submission_id }) : null;
    return { obligation: obligation, template: template, fields: template.fields || [], values: submission ? submission.values || {} : {}, attachments: submission ? submission.attachments || [] : [], submission: submission };
  }
  if (method === 'saveDraft' || method === 'submitReport') {
    const obligation = await db.collection('obligations').findOne({ obligation_id: payload.obligationId });
    if (!obligation) throw new Error('Reporting obligation not found.');
    const template = await templates.findOne({ template_id: obligation.template_id });
    const existing = obligation.submission_id ? await submissions.findOne({ submission_id: obligation.submission_id }) : null;
    const submissionId = existing ? existing.submission_id : id('RPT');
    const status = method === 'submitReport' ? 'SUBMITTED' : 'DRAFT';
    const reporter = await users.findOne({ user_id: TEST_USER_ID });
    const dep = await departments.findOne({ department_id: reporter.department_id });
    const record = { submission_id: submissionId, template_id: template.template_id, templateName: template.name, reporter_id: reporter.user_id, reporterName: reporter.display_name, department_id: reporter.department_id, departmentName: dep ? dep.name : '', periodStart: obligation.period_start, status: status, values: payload.values || {}, attachments: [], reviews: existing ? existing.reviews || [] : [], updated_at: new Date() };
    if (status === 'SUBMITTED') record.submitted_at = new Date();
    await submissions.updateOne({ submission_id: submissionId }, { $set: record }, { upsert: true });
    await db.collection('obligations').updateOne({ obligation_id: obligation.obligation_id }, { $set: { submission_id: submissionId, submissionStatus: status, status: status } });
    await audit(db, status === 'SUBMITTED' ? 'REPORT_SUBMITTED' : 'REPORT_DRAFT_SAVED', 'SUBMISSION', submissionId);
    if (status === 'SUBMITTED') await enqueue(db, 'REPORT_SUBMITTED', 'ceo@example.com', submissionId);
    return { submission_id: submissionId, status: status };
  }
  if (method === 'reports') {
    const query = {};
    if (payload.departmentId) query.department_id = payload.departmentId;
    if (payload.status) query.status = payload.status;
    if (payload.query) query.$or = ['templateName', 'reporterName', 'submission_id'].map(function (key) { const part = {}; part[key] = { $regex: escapeRegex(payload.query), $options: 'i' }; return part; });
    return submissions.find(query).sort({ submitted_at: -1 }).toArray();
  }
  if (method === 'report') {
    const submission = await submissions.findOne({ submission_id: payload.submissionId });
    if (!submission) throw new Error('Report not found.');
    const template = await templates.findOne({ template_id: submission.template_id });
    const reporter = await users.findOne({ user_id: submission.reporter_id });
    const linked = submission.action_ids && submission.action_ids.length ? await actions.find({ action_id: { $in: submission.action_ids } }).toArray() : [];
    return { submission: submission, template: template, reporter: reporter, fields: template.fields || [], values: submission.values || {}, attachments: submission.attachments || [], reviews: submission.reviews || [], actions: linked };
  }
  if (method === 'reviewReport') {
    const status = payload.decision === 'RETURN' ? 'CLARIFICATION_REQUIRED' : 'REVIEWED';
    await submissions.updateOne({ submission_id: payload.submissionId }, { $set: { status: status }, $push: { reviews: { decision: payload.decision, comment: payload.comment || '', created_at: new Date(), reviewer_id: TEST_USER_ID } } });
    await audit(db, status === 'REVIEWED' ? 'REPORT_REVIEWED' : 'REPORT_RETURNED', 'SUBMISSION', payload.submissionId);
    const submission = await submissions.findOne({ submission_id: payload.submissionId });
    const reporter = submission ? await users.findOne({ user_id: submission.reporter_id }) : null;
    if (reporter) await enqueue(db, status, reporter.email, payload.submissionId);
    return { status: status };
  }
  if (method === 'actions') {
    const query = {};
    if (payload.status) query.status = payload.status;
    if (payload.priority) query.priority = payload.priority;
    if (payload.query) query.$or = ['instruction', 'assigneeName', 'action_id'].map(function (key) { const part = {}; part[key] = { $regex: escapeRegex(payload.query), $options: 'i' }; return part; });
    const rows = await actions.find(query).sort({ due_at: 1 }).toArray();
    return rows.map(function (row) { row.ageDays = Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000)); return row; });
  }
  if (method === 'action') {
    const action = await actions.findOne({ action_id: payload.actionId });
    if (!action) throw new Error('Action not found.');
    return { action: action, assignee: await users.findOne({ user_id: action.assigned_to }), creator: await users.findOne({ user_id: action.created_by }), verifier: await users.findOne({ user_id: action.verifier_id }), events: await db.collection('action_events').find({ action_id: action.action_id }).sort({ created_at: 1 }).toArray() };
  }
  if (method === 'createAction') {
    const assignee = await users.findOne({ user_id: payload.assignedTo });
    if (!assignee) throw new Error('Assignee not found.');
    const dep = await departments.findOne({ department_id: assignee.department_id });
    const action = { action_id: id('ACT'), source_submission_id: payload.sourceSubmissionId || '', instruction: String(payload.instruction || '').trim(), assigned_to: assignee.user_id, assigneeName: assignee.display_name, department_id: assignee.department_id, departmentName: dep ? dep.name : '', verifier_id: payload.verifierId || TEST_USER_ID, priority: payload.priority || 'MEDIUM', due_at: new Date(payload.dueAt), status: 'ASSIGNED', created_at: new Date(), created_by: TEST_USER_ID };
    if (!action.instruction) throw new Error('Instruction is required.');
    await actions.insertOne(action);
    await db.collection('action_events').insertOne({ action_id: action.action_id, event_type: 'ACTION_ASSIGNED', created_at: new Date(), actor_id: TEST_USER_ID, comment: 'Action assigned.' });
    await audit(db, 'ACTION_CREATED', 'ACTION', action.action_id);
    await enqueue(db, 'ACTION_ASSIGNED', assignee.email, action.action_id);
    return action;
  }
  if (method === 'transitionAction') {
    const allowed = ['ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED'];
    if (!allowed.includes(payload.status)) throw new Error('Invalid action status.');
    const set = { status: payload.status, updated_at: new Date() };
    if (payload.status === 'ACKNOWLEDGED') set.acknowledged_at = new Date();
    if (payload.status === 'COMPLETED') set.completed_at = new Date();
    if (payload.status === 'VERIFIED') set.verified_at = new Date();
    await actions.updateOne({ action_id: payload.actionId }, { $set: set });
    await db.collection('action_events').insertOne({ action_id: payload.actionId, event_type: payload.status, created_at: new Date(), actor_id: TEST_USER_ID, comment: payload.comment || '', evidence_ref: payload.evidenceRef || '' });
    await audit(db, 'ACTION_' + payload.status, 'ACTION', payload.actionId);
    return { action_id: payload.actionId, status: payload.status };
  }
  if (method === 'template') {
    const template = await templates.findOne({ template_id: payload.templateId });
    if (!template) throw new Error('Template not found.');
    return { template: template, fields: template.fields || [] };
  }
  if (method === 'saveTemplate') {
    const templateId = payload.template.templateId || id('TPL');
    const existing = await templates.findOne({ template_id: templateId });
    const fields = (payload.fields || []).map(function (field, index) { return { field_id: field.fieldId || id('FLD'), field_name: field.fieldName, field_type: field.fieldType, required: String(Boolean(field.required)), options_json: JSON.stringify(field.options || []), sort_order: index }; });
    const record = { template_id: templateId, name: payload.template.name, description: payload.template.description || '', department_id: payload.template.departmentId, frequency: payload.template.frequency, due_rule_json: JSON.stringify(payload.template.dueRule || {}), status: existing ? existing.status : 'DRAFT', version: existing ? existing.version : 1, fieldCount: fields.length, assignmentCount: existing ? existing.assignmentCount || 0 : 0, fields: fields, updated_at: new Date() };
    await templates.updateOne({ template_id: templateId }, { $set: record }, { upsert: true });
    await audit(db, 'TEMPLATE_SAVED', 'TEMPLATE', templateId);
    return { template: record };
  }
  if (method === 'publishTemplate' || method === 'archiveTemplate') {
    const status = method === 'publishTemplate' ? 'ACTIVE' : 'ARCHIVED';
    await templates.updateOne({ template_id: payload.templateId }, { $set: { status: status, updated_at: new Date() } });
    await audit(db, 'TEMPLATE_' + status, 'TEMPLATE', payload.templateId);
    return { status: status };
  }
  if (method === 'saveAssignment') {
    await db.collection('assignments').insertOne({ assignment_id: id('ASN'), template_id: payload.templateId, target_type: payload.targetType, target_id: payload.targetId, effective_from: payload.effectiveFrom, effective_to: payload.effectiveTo || '', created_at: new Date() });
    await templates.updateOne({ template_id: payload.templateId }, { $inc: { assignmentCount: 1 } });
    return { saved: true };
  }
  if (method === 'generateObligations') return { generated: 0 };
  if (method === 'saveDepartment') {
    const departmentId = payload.departmentId || id('DEP');
    await departments.updateOne({ department_id: departmentId }, { $set: { department_id: departmentId, name: payload.name, hod_user_id: payload.hodUserId || '', active: payload.active !== false, updated_at: new Date() } }, { upsert: true });
    return { department_id: departmentId };
  }
  if (method === 'saveUser') {
    const userId = payload.userId || id('USR');
    await users.updateOne({ user_id: userId }, { $set: { user_id: userId, display_name: payload.displayName, email: String(payload.email || '').toLowerCase(), role: payload.role, department_id: payload.departmentId, manager_user_id: payload.managerUserId || '', active: payload.active !== false, updated_at: new Date() } }, { upsert: true });
    return { user_id: userId };
  }
  if (method === 'settings') {
    const rows = await db.collection('settings').find({ _id: { $ne: 'TEST_DATA_VERSION' } }).toArray();
    return { settings: rows.map(function (row) { return { key: row._id, value: row.value }; }), automationInstalled: ['MongoDB notification outbox'] };
  }
  if (method === 'saveSettings') {
    await Promise.all(Object.entries(payload.settings || {}).map(function (entry) { return db.collection('settings').updateOne({ _id: entry[0] }, { $set: { value: String(entry[1]), updated_at: new Date() } }, { upsert: true }); }));
    return { saved: true };
  }
  if (method === 'audit') return db.collection('audit_events').find({}).sort({ created_at: -1 }).limit(Math.min(Number(payload.limit) || 100, 500)).toArray();
  if (method === 'health') {
    const grouped = await db.collection('notifications').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
    const notificationCounts = {}; grouped.forEach(function (row) { notificationCounts[row._id] = row.count; });
    return { notifications: notificationCounts, mailQuotaRemaining: 'Apps Script worker not connected', triggers: [{ handler: 'MongoDB notification outbox', source: 'VERCEL_API' }], failed: await db.collection('notifications').find({ status: 'FAILED' }).limit(20).toArray() };
  }
  if (method === 'retryNotification') {
    await db.collection('notifications').updateOne({ notification_id: payload.notificationId }, { $set: { status: 'QUEUED', last_error: '', updated_at: new Date() } });
    return { queued: true };
  }
  throw new Error('Unknown API method: ' + method);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: { message: 'Method not allowed.' } });
  try {
    const method = req.body && req.body.method;
    const payload = req.body && req.body.payload;
    if (!method || typeof method !== 'string') return res.status(400).json({ ok: false, error: { message: 'API method is required.' } });
    const client = await getClient();
    const db = client.db(DATABASE_NAME);
    await ensureTestData(db);
    const data = await dispatch(db, method, payload || {});
    return res.status(200).json({ ok: true, data: data });
  } catch (error) {
    console.error('RPC failure:', error && error.message);
    const message = error && /MONGODB_URI/.test(error.message) ? error.message : (error && error.name === 'MongoServerSelectionError' ? 'Unable to connect to MongoDB Atlas.' : (error && error.message) || 'The request failed.');
    return res.status(500).json({ ok: false, error: { message: message } });
  }
};

module.exports._private = { escapeRegex, id };
