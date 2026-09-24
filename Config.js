/** Global configuration and data dictionary. */
const APP = Object.freeze({
  NAME: 'Accountability Hub',
  VERSION: '1.0.0',
  PROP_SPREADSHEET_ID: 'DATA_SPREADSHEET_ID',
  PROP_EVIDENCE_FOLDER_ID: 'EVIDENCE_FOLDER_ID',
  PROP_CHAT_WEBHOOK: 'GOOGLE_CHAT_WEBHOOK_URL',
  PROP_ALLOW_DEV_IDENTITY: 'ALLOW_DEV_IDENTITY_OVERRIDE',
  PROP_DEV_EMAIL: 'DEV_USER_EMAIL',
  DEFAULT_TIMEZONE: 'Africa/Lagos',
  LOCK_TIMEOUT_MS: 30000,
  MAX_ATTACHMENT_BYTES: 5 * 1024 * 1024,
  MAX_NOTIFICATION_ATTEMPTS: 4,
  NOTIFICATION_BATCH_SIZE: 40,
  OBLIGATION_LOOKAHEAD_DAYS: 35,
});

const ROLE = Object.freeze({
  ADMIN: 'ADMIN',
  EXECUTIVE: 'EXECUTIVE',
  HOD: 'HOD',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'VIEWER',
});

const ROLE_VALUES = Object.freeze(Object.keys(ROLE).map(function (key) { return ROLE[key]; }));
const MANAGER_ROLES = Object.freeze([ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.HOD]);

const STATUS = Object.freeze({
  TEMPLATE_DRAFT: 'DRAFT',
  TEMPLATE_ACTIVE: 'ACTIVE',
  TEMPLATE_ARCHIVED: 'ARCHIVED',
  OBLIGATION_UPCOMING: 'UPCOMING',
  OBLIGATION_DUE: 'DUE',
  OBLIGATION_MISSING: 'MISSING',
  OBLIGATION_SUBMITTED: 'SUBMITTED',
  REPORT_DRAFT: 'DRAFT',
  REPORT_SUBMITTED: 'SUBMITTED',
  REPORT_CLARIFICATION: 'CLARIFICATION_REQUIRED',
  REPORT_REVIEWED: 'REVIEWED',
  ACTION_ASSIGNED: 'ASSIGNED',
  ACTION_ACKNOWLEDGED: 'ACKNOWLEDGED',
  ACTION_IN_PROGRESS: 'IN_PROGRESS',
  ACTION_COMPLETED: 'COMPLETED',
  ACTION_OVERDUE: 'OVERDUE',
  ACTION_VERIFIED: 'VERIFIED',
  ACTION_CANCELLED: 'CANCELLED',
});

const FIELD_TYPES = Object.freeze([
  'TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PERCENTAGE', 'DATE', 'TIME',
  'YES_NO', 'DROPDOWN', 'EMPLOYEE', 'DEPARTMENT', 'STATUS', 'PRIORITY', 'URL', 'FILE'
]);

const PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'MANUAL']);

const SHEETS = Object.freeze({
  ORGANIZATIONS: ['organization_id', 'name', 'domain', 'timezone', 'status', 'created_at', 'updated_at'],
  USERS: ['user_id', 'organization_id', 'email', 'display_name', 'department_id', 'role', 'manager_user_id', 'active', 'created_at', 'updated_at'],
  DEPARTMENTS: ['department_id', 'organization_id', 'name', 'hod_user_id', 'active', 'created_at', 'updated_at'],
  REPORT_TEMPLATES: ['template_id', 'organization_id', 'source_template_id', 'name', 'description', 'department_id', 'frequency', 'due_rule_json', 'version', 'status', 'created_by', 'created_at', 'updated_at'],
  TEMPLATE_FIELDS: ['field_id', 'template_id', 'field_name', 'field_type', 'required', 'position', 'options_json', 'validation_json', 'created_at'],
  REPORT_ASSIGNMENTS: ['assignment_id', 'organization_id', 'template_id', 'target_type', 'target_id', 'effective_from', 'effective_to', 'active', 'created_by', 'created_at'],
  REPORT_OBLIGATIONS: ['obligation_id', 'organization_id', 'template_id', 'user_id', 'period_start', 'period_end', 'due_at', 'status', 'created_at', 'updated_at'],
  REPORT_SUBMISSIONS: ['submission_id', 'organization_id', 'obligation_id', 'template_id', 'template_version', 'submitted_by', 'status', 'submitted_at', 'reviewed_at', 'created_at', 'updated_at'],
  REPORT_VALUES: ['report_value_id', 'submission_id', 'field_id', 'value_json', 'created_at', 'updated_at'],
  REPORT_ATTACHMENTS: ['attachment_id', 'submission_id', 'drive_file_id', 'url', 'label', 'mime_type', 'created_by', 'created_at'],
  REPORT_REVIEWS: ['review_id', 'submission_id', 'reviewer_id', 'decision', 'comment', 'created_at'],
  ACTIONS: ['action_id', 'organization_id', 'source_submission_id', 'created_by', 'assigned_to', 'verifier_id', 'instruction', 'priority', 'due_at', 'status', 'acknowledged_at', 'completed_at', 'verified_at', 'completion_comment', 'created_at', 'updated_at'],
  ACTION_EVENTS: ['action_event_id', 'action_id', 'event_type', 'actor_id', 'comment', 'evidence_ref', 'created_at'],
  NOTIFICATION_OUTBOX: ['notification_id', 'organization_id', 'event_key', 'recipient', 'channel', 'template_key', 'payload_json', 'status', 'attempt_count', 'next_attempt_at', 'claimed_at', 'sent_at', 'last_error', 'created_at', 'updated_at'],
  AUDIT_EVENTS: ['audit_id', 'organization_id', 'actor_id', 'entity_type', 'entity_id', 'event_type', 'before_json', 'after_json', 'created_at'],
  SETTINGS: ['setting_id', 'organization_id', 'key', 'value', 'updated_by', 'updated_at'],
});

const ID_FIELD = Object.freeze({
  ORGANIZATIONS: 'organization_id', USERS: 'user_id', DEPARTMENTS: 'department_id',
  REPORT_TEMPLATES: 'template_id', TEMPLATE_FIELDS: 'field_id', REPORT_ASSIGNMENTS: 'assignment_id',
  REPORT_OBLIGATIONS: 'obligation_id', REPORT_SUBMISSIONS: 'submission_id', REPORT_VALUES: 'report_value_id',
  REPORT_ATTACHMENTS: 'attachment_id', REPORT_REVIEWS: 'review_id', ACTIONS: 'action_id',
  ACTION_EVENTS: 'action_event_id', NOTIFICATION_OUTBOX: 'notification_id', AUDIT_EVENTS: 'audit_id',
  SETTINGS: 'setting_id',
});

const ID_PREFIX = Object.freeze({
  ORGANIZATIONS: 'org', USERS: 'usr', DEPARTMENTS: 'dep', REPORT_TEMPLATES: 'tpl',
  TEMPLATE_FIELDS: 'fld', REPORT_ASSIGNMENTS: 'asg', REPORT_OBLIGATIONS: 'obl',
  REPORT_SUBMISSIONS: 'sub', REPORT_VALUES: 'val', REPORT_ATTACHMENTS: 'att',
  REPORT_REVIEWS: 'rev', ACTIONS: 'act', ACTION_EVENTS: 'aev',
  NOTIFICATION_OUTBOX: 'ntf', AUDIT_EVENTS: 'aud', SETTINGS: 'set',
});

function nowIso_() {
  return new Date().toISOString();
}

function newId_(sheetName) {
  return (ID_PREFIX[sheetName] || 'id') + '_' + Utilities.getUuid().replace(/-/g, '');
}

function parseJson_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

function asBool_(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function assert_(condition, message, code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code || 'VALIDATION_ERROR';
    throw error;
  }
}

function cleanText_(value, maxLength) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function normalizeEmail_(value) {
  return cleanText_(value, 254).toLowerCase();
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(value));
}

function serialize_(value) {
  return value === undefined ? '' : JSON.stringify(value);
}
