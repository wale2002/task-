/** Reporting obligations, dynamic forms, submission, repository, and review. */
function assignmentUsers_(assignment, template) {
  return findAll_('USERS', function (user) {
    if (user.organization_id !== assignment.organization_id || !asBool_(user.active)) return false;
    if (assignment.target_type === 'USER') return user.user_id === assignment.target_id;
    if (assignment.target_type === 'DEPARTMENT') return user.department_id === assignment.target_id;
    if (assignment.target_type === 'ROLE') return user.role === assignment.target_id && (!template.department_id || user.department_id === template.department_id);
    return false;
  });
}

function generateObligationsForOrg_(organizationId, now) {
  const organization = getById_('ORGANIZATIONS', organizationId);
  if (!organization || organization.status !== 'ACTIVE') return [];
  const timezone = organization.timezone || APP.DEFAULT_TIMEZONE;
  const localDate = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  const templates = findAll_('REPORT_TEMPLATES', function (row) {
    return row.organization_id === organizationId && row.status === STATUS.TEMPLATE_ACTIVE && row.frequency !== 'MANUAL';
  });
  const existing = findAll_('REPORT_OBLIGATIONS', function (row) { return row.organization_id === organizationId; });
  const existingKeys = {};
  existing.forEach(function (row) { existingKeys[[row.template_id, row.user_id, row.period_start].join('|')] = true; });
  const inserts = [];
  templates.forEach(function (template) {
    const period = periodForDate_(template.frequency, parseJson_(template.due_rule_json, {}), now, timezone);
    findAll_('REPORT_ASSIGNMENTS', function (assignment) {
      return assignment.template_id === template.template_id && asBool_(assignment.active) &&
        (!assignment.effective_from || assignment.effective_from <= localDate) && (!assignment.effective_to || assignment.effective_to >= localDate);
    }).forEach(function (assignment) {
      assignmentUsers_(assignment, template).forEach(function (user) {
        const key = [template.template_id, user.user_id, period.start].join('|');
        if (existingKeys[key]) return;
        existingKeys[key] = true;
        inserts.push({
          organization_id: organizationId, template_id: template.template_id, user_id: user.user_id,
          period_start: period.start, period_end: period.end, due_at: period.dueAt,
          status: new Date(period.dueAt) > now ? STATUS.OBLIGATION_UPCOMING : STATUS.OBLIGATION_DUE,
          created_at: now.toISOString(), updated_at: now.toISOString(),
        });
      });
    });
  });
  return insertMany_('REPORT_OBLIGATIONS', inserts);
}

function generateObligationsNow_(context) {
  requireRole_(context, MANAGER_ROLES);
  return withScriptLock_(function () { return generateObligationsForOrg_(context.organizationId, new Date()); });
}

function listMyObligations_(context) {
  const now = new Date();
  const obligations = findAll_('REPORT_OBLIGATIONS', function (row) {
    return row.organization_id === context.organizationId && row.user_id === context.userId;
  }).map(function (obligation) {
    const template = getById_('REPORT_TEMPLATES', obligation.template_id);
    const latest = latestSubmissionForObligation_(obligation.obligation_id);
    return Object.assign({}, obligation, {
      templateName: template ? template.name : 'Archived template',
      frequency: template ? template.frequency : '',
      submissionId: latest ? latest.submission_id : '',
      submissionStatus: latest ? latest.status : '',
      bucket: latest && latest.status === STATUS.REPORT_CLARIFICATION ? 'RETURNED' :
        (latest && [STATUS.REPORT_SUBMITTED, STATUS.REPORT_REVIEWED].indexOf(latest.status) !== -1 ? 'SUBMITTED' :
          (new Date(obligation.due_at) <= now ? 'DUE' : 'UPCOMING')),
    });
  });
  return obligations.sort(function (a, b) { return a.due_at.localeCompare(b.due_at); });
}

function latestSubmissionForObligation_(obligationId) {
  return findAll_('REPORT_SUBMISSIONS', function (row) { return row.obligation_id === obligationId; })
    .sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); })[0] || null;
}

function authorizeObligation_(context, obligation, write) {
  requireOrganization_(context, obligation);
  if (obligation.user_id === context.userId) return;
  assert_(!write && MANAGER_ROLES.concat([ROLE.VIEWER]).indexOf(context.role) !== -1, 'You cannot access this report.', 'FORBIDDEN');
  const owner = getById_('USERS', obligation.user_id);
  requireDepartmentScope_(context, owner && owner.department_id);
}

function getReportForm_(context, payload) {
  const obligation = getById_('REPORT_OBLIGATIONS', payload.obligationId);
  authorizeObligation_(context, obligation, false);
  const template = getById_('REPORT_TEMPLATES', obligation.template_id);
  assert_(template, 'The assigned template no longer exists.', 'NOT_FOUND');
  const submission = latestSubmissionForObligation_(obligation.obligation_id);
  const values = {};
  if (submission) findAll_('REPORT_VALUES', function (row) { return row.submission_id === submission.submission_id; })
    .forEach(function (row) { values[row.field_id] = parseJson_(row.value_json, row.value_json); });
  return {
    obligation: obligation, template: template, fields: templateFields_(template.template_id),
    submission: submission, values: values,
    attachments: submission ? findAll_('REPORT_ATTACHMENTS', function (row) { return row.submission_id === submission.submission_id; }) : [],
    reviews: submission ? findAll_('REPORT_REVIEWS', function (row) { return row.submission_id === submission.submission_id; }) : [],
  };
}

function prepareSubmission_(context, payload, finalSubmit) {
  const obligation = getById_('REPORT_OBLIGATIONS', payload.obligationId);
  authorizeObligation_(context, obligation, true);
  const template = getById_('REPORT_TEMPLATES', obligation.template_id);
  assert_(template, 'Template not found.', 'NOT_FOUND');
  const fields = templateFields_(template.template_id);
  const values = payload.values || {};
  if (finalSubmit) {
    const errors = fields.map(function (field) { return validateFieldValue_(field, values[field.field_id]); }).filter(Boolean);
    assert_(!errors.length, errors.join(' '));
  }
  const latest = latestSubmissionForObligation_(obligation.obligation_id);
  if (latest && [STATUS.REPORT_SUBMITTED, STATUS.REPORT_REVIEWED].indexOf(latest.status) !== -1) {
    assert_(false, 'This report has already been submitted.', 'INVALID_STATE');
  }
  return { obligation: obligation, template: template, fields: fields, values: values, latest: latest };
}

function saveDraft_(context, payload) {
  return saveSubmission_(context, payload, false);
}

function submitReport_(context, payload) {
  return saveSubmission_(context, payload, true);
}

function saveSubmission_(context, payload, finalSubmit) {
  return withScriptLock_(function () {
    const prepared = prepareSubmission_(context, payload, finalSubmit);
    const timestamp = nowIso_();
    let submission = prepared.latest;
    if (!submission || submission.status === STATUS.REPORT_CLARIFICATION) {
      submission = insert_('REPORT_SUBMISSIONS', {
        organization_id: context.organizationId, obligation_id: prepared.obligation.obligation_id,
        template_id: prepared.template.template_id, template_version: prepared.template.version,
        submitted_by: context.userId, status: STATUS.REPORT_DRAFT,
        submitted_at: '', reviewed_at: '', created_at: timestamp, updated_at: timestamp,
      });
    }
    assert_(submission.status === STATUS.REPORT_DRAFT, 'This report is not editable.', 'INVALID_STATE');
    prepared.fields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(prepared.values, field.field_id)) return;
      const existing = findOne_('REPORT_VALUES', function (row) { return row.submission_id === submission.submission_id && row.field_id === field.field_id; });
      const patch = { value_json: serialize_(prepared.values[field.field_id]), updated_at: timestamp };
      if (existing) update_('REPORT_VALUES', existing.report_value_id, patch);
      else insert_('REPORT_VALUES', Object.assign({
        submission_id: submission.submission_id, field_id: field.field_id, created_at: timestamp,
      }, patch));
    });
    (payload.attachments || []).forEach(function (attachment) { saveAttachment_(context, submission, attachment); });
    if (finalSubmit) {
      const before = submission;
      submission = update_('REPORT_SUBMISSIONS', submission.submission_id, {
        status: STATUS.REPORT_SUBMITTED, submitted_at: timestamp, updated_at: timestamp,
      });
      update_('REPORT_OBLIGATIONS', prepared.obligation.obligation_id, { status: STATUS.OBLIGATION_SUBMITTED, updated_at: timestamp });
      appendAudit_(context, 'REPORT', submission.submission_id, 'REPORT_SUBMITTED', before, submission);
      queueReviewerNotifications_(context, prepared.template, submission);
    } else {
      submission = update_('REPORT_SUBMISSIONS', submission.submission_id, { updated_at: timestamp });
      appendAudit_(context, 'REPORT', submission.submission_id, 'REPORT_DRAFT_SAVED', {}, { obligationId: prepared.obligation.obligation_id });
    }
    return submission;
  });
}

function saveAttachment_(context, submission, attachment) {
  const label = cleanText_(attachment.label || attachment.name || 'Evidence', 200);
  if (attachment.url) {
    assert_(/^https:\/\//i.test(attachment.url), 'Evidence links must use https.');
    return insert_('REPORT_ATTACHMENTS', {
      submission_id: submission.submission_id, drive_file_id: '', url: cleanText_(attachment.url, 2000),
      label: label, mime_type: '', created_by: context.userId, created_at: nowIso_(),
    });
  }
  assert_(attachment.base64 && attachment.name && attachment.mimeType, 'File evidence is incomplete.');
  const bytes = Utilities.base64Decode(attachment.base64);
  assert_(bytes.length <= APP.MAX_ATTACHMENT_BYTES, 'Each evidence file must be 5 MB or smaller.');
  const folderId = PropertiesService.getScriptProperties().getProperty(APP.PROP_EVIDENCE_FOLDER_ID);
  assert_(folderId, 'Evidence storage is not configured.', 'NOT_CONFIGURED');
  const blob = Utilities.newBlob(bytes, cleanText_(attachment.mimeType, 120), cleanText_(attachment.name, 180));
  const file = Drive.Files.create({ name: cleanText_(attachment.name, 180), parents: [folderId] }, blob, { fields: 'id,webViewLink,mimeType' });
  return insert_('REPORT_ATTACHMENTS', {
    submission_id: submission.submission_id, drive_file_id: file.id, url: file.webViewLink || '',
    label: label, mime_type: file.mimeType || attachment.mimeType, created_by: context.userId, created_at: nowIso_(),
  });
}

function queueReviewerNotifications_(context, template, submission) {
  let recipients = [];
  const department = getById_('DEPARTMENTS', template.department_id);
  if (department && department.hod_user_id) recipients.push(getById_('USERS', department.hod_user_id));
  if (!recipients.length) recipients = findAll_('USERS', function (user) {
    return user.organization_id === context.organizationId && asBool_(user.active) && [ROLE.ADMIN, ROLE.EXECUTIVE].indexOf(user.role) !== -1;
  });
  recipients.filter(Boolean).forEach(function (user) {
    queueNotification_(context, notificationEventKey_('REPORT', submission.submission_id, 'SUBMITTED', 'ONCE', user.email), user.email, 'EMAIL', 'REPORT_SUBMITTED', {
      recipientName: user.display_name, templateName: template.name, submissionId: submission.submission_id,
      submitterName: context.displayName, dueAt: '',
    });
  });
}

function listReports_(context, payload) {
  let submissions = findAll_('REPORT_SUBMISSIONS', function (row) { return row.organization_id === context.organizationId; });
  submissions = submissions.filter(function (submission) {
    const owner = getById_('USERS', submission.submitted_by);
    if (context.role === ROLE.EMPLOYEE) return submission.submitted_by === context.userId;
    if (context.role === ROLE.HOD) return owner && owner.department_id === context.departmentId;
    return true;
  });
  if (payload.status) submissions = submissions.filter(function (row) { return row.status === payload.status; });
  if (payload.templateId) submissions = submissions.filter(function (row) { return row.template_id === payload.templateId; });
  if (payload.departmentId) submissions = submissions.filter(function (row) {
    const owner = getById_('USERS', row.submitted_by); return owner && owner.department_id === payload.departmentId;
  });
  if (payload.reporterId) submissions = submissions.filter(function (row) { return row.submitted_by === payload.reporterId; });
  const query = cleanText_(payload.query, 160).toLowerCase();
  return submissions.map(function (submission) {
    const owner = getById_('USERS', submission.submitted_by);
    const template = getById_('REPORT_TEMPLATES', submission.template_id);
    const obligation = getById_('REPORT_OBLIGATIONS', submission.obligation_id);
    const department = owner ? getById_('DEPARTMENTS', owner.department_id) : null;
    return Object.assign({}, submission, {
      reporterName: owner ? owner.display_name : 'Unknown', reporterEmail: owner ? owner.email : '',
      departmentId: owner ? owner.department_id : '', departmentName: department ? department.name : '',
      templateName: template ? template.name : 'Archived template', periodStart: obligation ? obligation.period_start : '',
      dueAt: obligation ? obligation.due_at : '',
    });
  }).filter(function (row) {
    return !query || [row.reporterName, row.reporterEmail, row.departmentName, row.templateName, row.submission_id].join(' ').toLowerCase().indexOf(query) !== -1;
  }).sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); }).slice(0, 500);
}

function getReportDetails_(context, payload) {
  const submission = getById_('REPORT_SUBMISSIONS', payload.submissionId);
  requireOrganization_(context, submission);
  const obligation = getById_('REPORT_OBLIGATIONS', submission.obligation_id);
  authorizeObligation_(context, obligation, false);
  const template = getById_('REPORT_TEMPLATES', submission.template_id);
  const fields = templateFields_(submission.template_id);
  const values = {};
  findAll_('REPORT_VALUES', function (row) { return row.submission_id === submission.submission_id; })
    .forEach(function (row) { values[row.field_id] = parseJson_(row.value_json, row.value_json); });
  return {
    submission: submission, obligation: obligation, template: template, fields: fields, values: values,
    reporter: getById_('USERS', submission.submitted_by),
    attachments: findAll_('REPORT_ATTACHMENTS', function (row) { return row.submission_id === submission.submission_id; }),
    reviews: findAll_('REPORT_REVIEWS', function (row) { return row.submission_id === submission.submission_id; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }),
    actions: findAll_('ACTIONS', function (row) { return row.source_submission_id === submission.submission_id; }),
    audit: findAll_('AUDIT_EVENTS', function (row) { return row.entity_id === submission.submission_id; }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }),
  };
}

function reviewReport_(context, payload) {
  requireRole_(context, MANAGER_ROLES);
  const submission = getById_('REPORT_SUBMISSIONS', payload.submissionId);
  requireOrganization_(context, submission);
  const reporter = getById_('USERS', submission.submitted_by);
  requireManagerScope_(context, reporter.department_id);
  assert_(submission.status === STATUS.REPORT_SUBMITTED, 'Only submitted reports can be reviewed.', 'INVALID_STATE');
  const decision = cleanText_(payload.decision, 30).toUpperCase();
  assert_(['APPROVE', 'RETURN'].indexOf(decision) !== -1, 'Invalid review decision.');
  const comment = cleanText_(payload.comment, 4000);
  if (decision === 'RETURN') assert_(comment, 'A return reason is required.');
  return withScriptLock_(function () {
    const timestamp = nowIso_();
    const status = decision === 'APPROVE' ? STATUS.REPORT_REVIEWED : STATUS.REPORT_CLARIFICATION;
    const updated = update_('REPORT_SUBMISSIONS', submission.submission_id, { status: status, reviewed_at: timestamp, updated_at: timestamp });
    if (decision === 'RETURN') update_('REPORT_OBLIGATIONS', submission.obligation_id, { status: STATUS.OBLIGATION_DUE, updated_at: timestamp });
    insert_('REPORT_REVIEWS', {
      submission_id: submission.submission_id, reviewer_id: context.userId, decision: decision, comment: comment, created_at: timestamp,
    });
    appendAudit_(context, 'REPORT', submission.submission_id, decision === 'APPROVE' ? 'REPORT_REVIEWED' : 'REPORT_RETURNED', submission, updated);
    queueNotification_(context, notificationEventKey_('REPORT', submission.submission_id, decision, 'ONCE', reporter.email), reporter.email, 'EMAIL', decision === 'APPROVE' ? 'REPORT_REVIEWED' : 'REPORT_RETURNED', {
      recipientName: reporter.display_name, submissionId: submission.submission_id, reviewerName: context.displayName, comment: comment,
    });
    return updated;
  });
}
