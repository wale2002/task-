/** Idempotent notification outbox, retries, reminders, escalations, and digests. */
function queueNotification_(context, eventKey, recipient, channel, templateKey, payload) {
  recipient = normalizeEmail_(recipient);
  if (channel === 'EMAIL') assert_(isEmail_(recipient), 'Notification recipient is invalid.');
  const duplicate = findOne_('NOTIFICATION_OUTBOX', function (row) {
    return row.organization_id === context.organizationId && row.event_key === eventKey;
  });
  if (duplicate) return duplicate;
  return insert_('NOTIFICATION_OUTBOX', {
    organization_id: context.organizationId, event_key: eventKey, recipient: recipient,
    channel: channel, template_key: templateKey, payload_json: serialize_(payload || {}),
    status: 'PENDING', attempt_count: 0, next_attempt_at: nowIso_(), claimed_at: '', sent_at: '', last_error: '',
    created_at: nowIso_(), updated_at: nowIso_(),
  });
}

function notificationContent_(templateKey, payload) {
  const appUrl = ScriptApp.getService().getUrl() || '';
  const safe = function (value) { return String(value || '').replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); };
  const templates = {
    REPORT_SUBMITTED: ['Report awaiting review', '<p><strong>' + safe(payload.templateName) + '</strong> was submitted by ' + safe(payload.submitterName) + '.</p>'],
    REPORT_RETURNED: ['Report returned for clarification', '<p>Your report was returned by ' + safe(payload.reviewerName) + '.</p><p><strong>Reason:</strong> ' + safe(payload.comment) + '</p>'],
    REPORT_REVIEWED: ['Report reviewed', '<p>Your report has been reviewed by ' + safe(payload.reviewerName) + '.</p>'],
    ACTION_ASSIGNED: ['[ACTION REQUIRED] Task assigned - ' + safe(payload.title || payload.priority), '<p>' + safe(payload.assignedBy) + ' assigned you an action.</p><p><strong>' + safe(payload.title || payload.instruction) + '</strong></p><p>' + safe(payload.description || '') + '</p><p>Priority: ' + safe(payload.priority) + '<br>Due: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>'],
    ACTION_COMPLETED: ['Action ready for verification', '<p>' + safe(payload.assigneeName) + ' marked an action complete.</p><p><strong>' + safe(payload.instruction) + '</strong></p><p>' + safe(payload.comment) + '</p>'],
    ACTION_VERIFIED: ['Action verified', '<p>Your completed action was verified by ' + safe(payload.reviewerName) + '.</p>'],
    ACTION_IN_PROGRESS: ['Action returned to in progress', '<p>' + safe(payload.reviewerName) + ' returned the action to In Progress.</p><p>' + safe(payload.comment) + '</p>'],
    ACTION_RETURNED_FOR_REWORK: ['Action returned for rework', '<p>' + safe(payload.reviewerName) + ' returned the action for rework.</p><p>' + safe(payload.comment) + '</p>'],
    ACTION_CANCELLED: ['Action cancelled', '<p>' + safe(payload.reviewerName) + ' cancelled the action.</p><p>' + safe(payload.comment) + '</p>'],
    ACTION_COMMENT_ADDED: ['New action comment', '<p>' + safe(payload.authorName) + ' added a comment to <strong>' + safe(payload.title) + '</strong>.</p><p>' + safe(payload.comment) + '</p>'],
    ACTION_UNACKNOWLEDGED: ['Reminder: acknowledge your action', '<p>Please acknowledge this action:</p><p><strong>' + safe(payload.instruction) + '</strong></p><p>Due: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>'],
    ACTION_DUE_SOON: ['Action due soon', '<p>Your action is due soon:</p><p><strong>' + safe(payload.instruction) + '</strong></p><p>Due: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>'],
    ACTION_OVERDUE: ['Overdue action - ' + safe(payload.stage), '<p>This action is overdue:</p><p><strong>' + safe(payload.instruction) + '</strong></p><p>Assignee: ' + safe(payload.assigneeName) + '<br>Due: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>'],
    DAILY_DIGEST: ['Daily accountability digest', '<p><strong>' + safe(payload.missingReports) + '</strong> missing reports, <strong>' + safe(payload.awaitingReview) + '</strong> awaiting review, and <strong>' + safe(payload.overdueActions) + '</strong> overdue actions require attention.</p>'],
  };
  const selected = templates[templateKey] || ['Accountability Hub notification', '<p>An item requires your attention.</p>'];
  const deepLink = payload.actionId ? appUrl + '?action=' + encodeURIComponent(payload.actionId) + '#actions' : (payload.submissionId ? appUrl + '?report=' + encodeURIComponent(payload.submissionId) + '#reports' : appUrl);
  const buttonLabel = templateKey === 'ACTION_ASSIGNED' || templateKey === 'ACTION_UNACKNOWLEDGED' ? 'Acknowledge / view task' : 'Open ' + APP.NAME;
  return {
    subject: selected[0],
    html: '<div style="font-family:Arial,sans-serif;color:#172033;max-width:620px"><p>Hello ' + safe(payload.recipientName || 'there') + ',</p>' + selected[1] + (appUrl ? '<p><a href="' + safe(deepLink) + '" style="background:#1f5eff;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">' + safe(buttonLabel) + '</a></p>' : '') + '<p style="font-size:12px;color:#667085">This is an automated operational notification.</p></div>',
  };
}

function formatDateForMessage_(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : Utilities.formatDate(date, APP.DEFAULT_TIMEZONE, 'dd MMM yyyy, HH:mm z');
}

function claimNotifications_() {
  return withScriptLock_(function () {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 10 * 60000);
    const eligible = findAll_('NOTIFICATION_OUTBOX', function (row) {
      if (['PENDING', 'RETRY'].indexOf(row.status) !== -1) return !row.next_attempt_at || new Date(row.next_attempt_at) <= now;
      return row.status === 'PROCESSING' && row.claimed_at && new Date(row.claimed_at) < staleBefore;
    }).slice(0, APP.NOTIFICATION_BATCH_SIZE);
    eligible.forEach(function (row) {
      update_('NOTIFICATION_OUTBOX', row.notification_id, { status: 'PROCESSING', claimed_at: now.toISOString(), updated_at: now.toISOString() });
    });
    return eligible;
  });
}

function processNotificationOutbox() {
  const jobs = claimNotifications_();
  jobs.forEach(function (job) {
    const payload = parseJson_(job.payload_json, {});
    try {
      const content = notificationContent_(job.template_key, payload);
      if (job.channel === 'EMAIL') MailApp.sendEmail({ to: job.recipient, subject: content.subject, body: content.subject + '\n\nOpen ' + APP.NAME + ' to review this item.', htmlBody: content.html, name: APP.NAME });
      else if (job.channel === 'CHAT') sendChatNotification_(content, payload);
      else throw new Error('Unsupported notification channel: ' + job.channel);
      withScriptLock_(function () {
        update_('NOTIFICATION_OUTBOX', job.notification_id, { status: 'SENT', sent_at: nowIso_(), claimed_at: '', last_error: '', updated_at: nowIso_() });
      });
    } catch (error) {
      const attempts = Number(job.attempt_count || 0) + 1;
      const terminal = attempts >= APP.MAX_NOTIFICATION_ATTEMPTS;
      const delays = [5, 30, 120, 360];
      const next = new Date(Date.now() + delays[Math.min(attempts - 1, delays.length - 1)] * 60000).toISOString();
      withScriptLock_(function () {
        update_('NOTIFICATION_OUTBOX', job.notification_id, {
          status: terminal ? 'FAILED' : 'RETRY', attempt_count: attempts, next_attempt_at: next,
          claimed_at: '', last_error: cleanText_(error.message, 1000), updated_at: nowIso_(),
        });
      });
    }
  });
  return jobs.length;
}

function sendChatNotification_(content) {
  const webhook = PropertiesService.getScriptProperties().getProperty(APP.PROP_CHAT_WEBHOOK);
  assert_(webhook, 'Google Chat webhook is not configured.', 'NOT_CONFIGURED');
  const response = UrlFetchApp.fetch(webhook, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ text: content.subject }),
  });
  assert_(response.getResponseCode() >= 200 && response.getResponseCode() < 300, 'Google Chat delivery failed: HTTP ' + response.getResponseCode());
}

function scheduledSweep() {
  const organizations = findAll_('ORGANIZATIONS', function (row) { return row.status === 'ACTIVE'; });
  organizations.forEach(function (organization) {
    withScriptLock_(function () {
      const context = getSystemContext_(organization.organization_id);
      const now = new Date();
      generateObligationsForOrg_(organization.organization_id, now);
      updateObligationStatuses_(context, now);
      evaluateActions_(context, now);
    });
  });
  return processNotificationOutbox();
}

function updateObligationStatuses_(context, now) {
  findAll_('REPORT_OBLIGATIONS', function (row) { return row.organization_id === context.organizationId; }).forEach(function (obligation) {
    if (obligation.status === STATUS.OBLIGATION_SUBMITTED) return;
    const target = new Date(obligation.due_at) < now ? STATUS.OBLIGATION_MISSING : STATUS.OBLIGATION_UPCOMING;
    if (obligation.status !== target) update_('REPORT_OBLIGATIONS', obligation.obligation_id, { status: target, updated_at: now.toISOString() });
  });
}

function evaluateActions_(context, now) {
  const ackHours = Number(getSetting_(context.organizationId, 'ACKNOWLEDGEMENT_SLA_HOURS', 24));
  const dueSoonHours = Number(getSetting_(context.organizationId, 'DUE_SOON_HOURS', 24));
  const level2 = Number(getSetting_(context.organizationId, 'ESCALATION_LEVEL_2_HOURS', 72));
  const level3 = Number(getSetting_(context.organizationId, 'ESCALATION_LEVEL_3_HOURS', 168));
  findAll_('ACTIONS', function (row) {
    return row.organization_id === context.organizationId && [STATUS.ACTION_COMPLETED, STATUS.ACTION_VERIFIED, STATUS.ACTION_CANCELLED].indexOf(row.status) === -1;
  }).forEach(function (action) {
    const assignee = getById_('USERS', action.assigned_to);
    if (!assignee || !asBool_(assignee.active)) return;
    const ageHours = (now.getTime() - new Date(action.created_at).getTime()) / 3600000;
    if (!action.acknowledged_at && ageHours >= ackHours) {
      queueNotification_(context, notificationEventKey_('ACTION', action.action_id, 'UNACKNOWLEDGED', ackHours + 'H', assignee.email), assignee.email, 'EMAIL', 'ACTION_UNACKNOWLEDGED', {
        recipientName: assignee.display_name, actionId: action.action_id, instruction: action.instruction, dueAt: action.due_at,
      });
    }
    const untilDueHours = (new Date(action.due_at).getTime() - now.getTime()) / 3600000;
    if (untilDueHours >= 0 && untilDueHours <= dueSoonHours) {
      queueNotification_(context, notificationEventKey_('ACTION', action.action_id, 'DUE_SOON', dueSoonHours + 'H', assignee.email), assignee.email, 'EMAIL', 'ACTION_DUE_SOON', {
        recipientName: assignee.display_name, actionId: action.action_id, instruction: action.instruction, dueAt: action.due_at,
      });
    }
    const stage = escalationStage_(action.due_at, now, level2, level3);
    if (!stage) return;
    if (action.status !== STATUS.ACTION_OVERDUE) {
      const updated = update_('ACTIONS', action.action_id, { status: STATUS.ACTION_OVERDUE, updated_at: now.toISOString() });
      insert_('ACTION_EVENTS', { action_id: action.action_id, event_type: 'OVERDUE', actor_id: 'SYSTEM', comment: 'Deadline passed.', evidence_ref: '', created_at: now.toISOString() });
      appendAudit_(context, 'ACTION', action.action_id, 'ACTION_OVERDUE', action, updated);
    }
    escalationRecipients_(context, assignee, stage).forEach(function (recipient) {
      queueNotification_(context, notificationEventKey_('ACTION', action.action_id, 'OVERDUE', stage, recipient.email), recipient.email, 'EMAIL', 'ACTION_OVERDUE', {
        recipientName: recipient.display_name, actionId: action.action_id, instruction: action.instruction,
        assigneeName: assignee.display_name, dueAt: action.due_at, stage: stage.replace('_', ' '),
      });
    });
  });
}

function escalationRecipients_(context, assignee, stage) {
  const ids = {};
  const recipients = [];
  function add(user) { if (user && asBool_(user.active) && !ids[user.user_id]) { ids[user.user_id] = true; recipients.push(user); } }
  add(assignee);
  if (assignee.manager_user_id) add(getById_('USERS', assignee.manager_user_id));
  if (stage === 'LEVEL_2' || stage === 'LEVEL_3') {
    const department = getById_('DEPARTMENTS', assignee.department_id);
    if (department && department.hod_user_id) add(getById_('USERS', department.hod_user_id));
  }
  if (stage === 'LEVEL_3') findAll_('USERS', function (user) {
    return user.organization_id === context.organizationId && [ROLE.ADMIN, ROLE.EXECUTIVE].indexOf(user.role) !== -1;
  }).forEach(add);
  return recipients;
}

function dailyDigest() {
  findAll_('ORGANIZATIONS', function (row) { return row.status === 'ACTIVE'; }).forEach(function (organization) {
    withScriptLock_(function () {
      const context = getSystemContext_(organization.organization_id);
      if (String(getSetting_(organization.organization_id, 'DAILY_DIGEST_ENABLED', 'true')) !== 'true') return;
      const dashboard = getDashboard_(context, {});
      findAll_('USERS', function (user) {
        return user.organization_id === organization.organization_id && asBool_(user.active) && MANAGER_ROLES.indexOf(user.role) !== -1;
      }).forEach(function (user) {
        const day = Utilities.formatDate(new Date(), context.timezone, 'yyyy-MM-dd');
        queueNotification_(context, notificationEventKey_('DIGEST', organization.organization_id, 'DAILY', day, user.email), user.email, 'EMAIL', 'DAILY_DIGEST', {
          recipientName: user.display_name, missingReports: dashboard.cards.missing,
          awaitingReview: dashboard.cards.awaitingReview, overdueActions: dashboard.cards.overdueActions,
        });
      });
    });
  });
  return processNotificationOutbox();
}
