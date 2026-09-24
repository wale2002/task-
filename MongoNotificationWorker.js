/**
 * Optional Apps Script MailApp worker for the Vercel + MongoDB deployment.
 * Configure once with real pilot emails, then install the shared 15-minute trigger.
 */
function configureMongoNotificationWorker(workerUrl, secret, publicAppUrl) {
  assert_(/^https:\/\//i.test(cleanText_(workerUrl, 2000)), 'A secure worker URL is required.');
  assert_(cleanText_(secret, 500).length >= 24, 'Use a notification secret of at least 24 characters.');
  assert_(/^https:\/\//i.test(cleanText_(publicAppUrl, 2000)), 'A secure public app URL is required.');
  PropertiesService.getScriptProperties().setProperties({
    MONGODB_WORKER_URL: cleanText_(workerUrl, 2000),
    MONGODB_NOTIFICATION_SECRET: cleanText_(secret, 500),
    PUBLIC_APP_URL: cleanText_(publicAppUrl, 2000).replace(/\/$/, ''),
  });
  installMongoNotificationWorker();
  return { configured: true };
}

function installMongoNotificationWorker() {
  const props = PropertiesService.getScriptProperties();
  assert_(props.getProperty(APP.PROP_MONGODB_WORKER_URL), 'Configure MONGODB_WORKER_URL first.', 'NOT_CONFIGURED');
  assert_(props.getProperty(APP.PROP_MONGODB_NOTIFICATION_SECRET), 'Configure MONGODB_NOTIFICATION_SECRET first.', 'NOT_CONFIGURED');
  ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'processMongoNotifications'; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('processMongoNotifications').timeBased().everyMinutes(15).create();
  return { installed: true };
}

function mongoWorkerRequest_(body) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty(APP.PROP_MONGODB_WORKER_URL);
  const secret = props.getProperty(APP.PROP_MONGODB_NOTIFICATION_SECRET);
  assert_(url && secret, 'MongoDB notification worker is not configured.', 'NOT_CONFIGURED');
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + secret }, payload: JSON.stringify(body || {}),
  });
  const data = parseJson_(response.getContentText(), {});
  assert_(response.getResponseCode() >= 200 && response.getResponseCode() < 300 && data.ok, 'Notification API failed with HTTP ' + response.getResponseCode() + '.');
  return data.data;
}

function mongoNotificationContent_(job) {
  const payload = job.payload || {};
  const safe = function (value) { return String(value || '').replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); };
  const publicUrl = PropertiesService.getScriptProperties().getProperty(APP.PROP_PUBLIC_APP_URL) || '';
  const actionUrl = publicUrl + '/?action=' + encodeURIComponent(job.entityId || '') + '#actions';
  const reportUrl = publicUrl + '/?report=' + encodeURIComponent(job.entityId || '') + '#reports';
  const actionButton = '<a href="' + safe(actionUrl) + '" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 16px;border-radius:7px;text-decoration:none;font-weight:bold">' + (job.templateKey === 'ACTION_ASSIGNED' || job.templateKey === 'ACTION_UNACKNOWLEDGED' ? 'Acknowledge / view task' : 'View task') + '</a>';
  const reportButton = '<a href="' + safe(reportUrl) + '" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 16px;border-radius:7px;text-decoration:none;font-weight:bold">View report</a>';
  const templates = {
    ACTION_ASSIGNED: ['[ACTION REQUIRED] Task assigned — ' + safe(payload.title), '<p>' + safe(payload.assignedBy) + ' assigned you a task.</p><p><strong>' + safe(payload.title) + '</strong></p><p>' + safe(payload.description) + '</p><p>Priority: ' + safe(payload.priority) + '<br>Deadline: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>' + actionButton],
    ACTION_UNACKNOWLEDGED: ['Reminder: acknowledge task — ' + safe(payload.title), '<p>This task still needs your acknowledgement.</p><p><strong>' + safe(payload.title) + '</strong><br>Deadline: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>' + actionButton],
    ACTION_DUE_SOON: ['Task due soon — ' + safe(payload.title), '<p><strong>' + safe(payload.title) + '</strong> is due soon.</p><p>Deadline: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>' + actionButton],
    ACTION_OVERDUE: ['Overdue task (' + safe(payload.stage) + ') — ' + safe(payload.title), '<p><strong>' + safe(payload.title) + '</strong> is overdue.</p><p>Assignee: ' + safe(payload.assigneeName) + '<br>Priority: ' + safe(payload.priority) + '<br>Deadline: ' + safe(formatDateForMessage_(payload.dueAt)) + '</p>' + actionButton],
    ACTION_COMPLETED: ['Task ready for verification — ' + safe(payload.title), '<p>' + safe(payload.assigneeName) + ' marked <strong>' + safe(payload.title) + '</strong> complete.</p><p>' + safe(payload.comment) + '</p>' + actionButton],
    ACTION_VERIFIED: ['Task verified — ' + safe(payload.title), '<p>Your completed task was verified by ' + safe(payload.reviewerName) + '.</p>' + actionButton],
    ACTION_RETURNED_FOR_REWORK: ['Task returned for rework — ' + safe(payload.title), '<p>' + safe(payload.reviewerName) + ' returned this task for rework.</p><p>' + safe(payload.comment) + '</p>' + actionButton],
    ACTION_COMMENT_ADDED: ['New task comment — ' + safe(payload.title), '<p>' + safe(payload.authorName) + ' commented:</p><p>' + safe(payload.comment) + '</p>' + actionButton],
    REPORT_SUBMITTED: ['Report awaiting review — ' + safe(payload.templateName), '<p>' + safe(payload.submitterName) + ' submitted <strong>' + safe(payload.templateName) + '</strong>.</p>' + reportButton],
    REVIEWED: ['Report reviewed', '<p>Your report has been reviewed.</p>' + reportButton],
    CLARIFICATION_REQUIRED: ['Report returned for clarification', '<p>Your report needs clarification.</p><p>' + safe(payload.comment) + '</p>' + reportButton],
    REPORT_MISSING: ['Missing report — ' + safe(payload.templateName), '<p><strong>' + safe(payload.templateName) + '</strong> for ' + safe(payload.period) + ' was not submitted by the deadline.</p>' + reportButton],
  };
  const selected = templates[job.templateKey] || ['Accountability Hub notification', '<p>An item requires your attention.</p>' + actionButton];
  return { subject: selected[0], html: '<div style="font-family:Arial,sans-serif;color:#172033;max-width:620px"><p>Hello ' + safe(payload.recipientName || 'there') + ',</p>' + selected[1] + '<p style="font-size:12px;color:#667085">Automated by Accountability Hub.</p></div>' };
}

function processMongoNotifications() {
  mongoWorkerRequest_({ action: 'sweep' });
  const jobs = mongoWorkerRequest_({ action: 'claim', limit: APP.NOTIFICATION_BATCH_SIZE }) || [];
  jobs.forEach(function (job) {
    try {
      const content = mongoNotificationContent_(job);
      MailApp.sendEmail({ to: job.recipient, subject: content.subject, body: content.subject + '\n\nOpen Accountability Hub to respond.', htmlBody: content.html, name: APP.NAME });
      mongoWorkerRequest_({ action: 'complete', notificationId: job.notificationId, success: true });
    } catch (error) {
      mongoWorkerRequest_({ action: 'complete', notificationId: job.notificationId, success: false, error: cleanText_(error.message, 1000) });
    }
  });
  return jobs.length;
}
