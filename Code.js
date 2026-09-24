/** Web entry point and allow-listed RPC controller. */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.appName = APP.NAME;
  template.appVersion = APP.VERSION;
  return template.evaluate()
    .setTitle(APP.NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function api(method, payload) {
  const routes = {
    bootstrap: apiBootstrap_,
    dashboard: getDashboard_,
    departments: listDepartments_,
    saveDepartment: saveDepartment_,
    users: listUsers_,
    saveUser: saveUser_,
    templates: listTemplates_,
    template: getTemplate_,
    saveTemplate: saveTemplate_,
    publishTemplate: publishTemplate_,
    archiveTemplate: archiveTemplate_,
    assignments: listAssignments_,
    saveAssignment: saveAssignment_,
    generateObligations: generateObligationsNow_,
    myObligations: listMyObligations_,
    reportForm: getReportForm_,
    saveDraft: saveDraft_,
    submitReport: submitReport_,
    reports: listReports_,
    report: getReportDetails_,
    reviewReport: reviewReport_,
    createAction: createAction_,
    actions: listActions_,
    action: getActionDetails_,
    transitionAction: transitionAction_,
    audit: listAudit_,
    health: getSystemHealth_,
    retryNotification: retryNotification_,
    settings: getSettings_,
    saveSettings: saveSettings_,
  };
  try {
    assert_(routes[method], 'Unknown API method.', 'NOT_FOUND');
    const context = getContext_();
    const result = routes[method](context, payload || {});
    return { ok: true, data: result, meta: { version: APP.VERSION, generatedAt: nowIso_() } };
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {
      ok: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.code ? error.message : 'The request could not be completed.',
      },
    };
  }
}

function apiBootstrap_(context) {
  return {
    app: { name: APP.NAME, version: APP.VERSION },
    context: publicContext_(context),
    permissions: {
      manageUsers: context.role === ROLE.ADMIN,
      manageDepartments: context.role === ROLE.ADMIN,
      manageTemplates: [ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.HOD].indexOf(context.role) !== -1,
      reviewReports: MANAGER_ROLES.indexOf(context.role) !== -1,
      createActions: MANAGER_ROLES.indexOf(context.role) !== -1,
      viewAudit: [ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.HOD, ROLE.VIEWER].indexOf(context.role) !== -1,
      viewHealth: context.role === ROLE.ADMIN,
    },
    options: { roles: ROLE_VALUES, fieldTypes: FIELD_TYPES, priorities: PRIORITIES, frequencies: FREQUENCIES },
  };
}

/** One-time, idempotent bootstrap. Run as the controlled deployment owner. */
function setupApplication(options) {
  options = options || {};
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail());
  assert_(email, 'A Google Workspace identity is required for setup.', 'IDENTITY_UNAVAILABLE');
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(APP.PROP_SPREADSHEET_ID);
  let spreadsheet;
  if (spreadsheetId) spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  else {
    spreadsheet = SpreadsheetApp.create((options.organizationName || 'Accountability Hub') + ' - Data');
    spreadsheetId = spreadsheet.getId();
    props.setProperty(APP.PROP_SPREADSHEET_ID, spreadsheetId);
  }
  ensureSheets_(spreadsheet);

  let organization = rows_('ORGANIZATIONS')[0];
  const timestamp = nowIso_();
  if (!organization) {
    organization = insert_('ORGANIZATIONS', {
      name: cleanText_(options.organizationName || 'My Organization', 160),
      domain: cleanText_(options.domain || email.split('@')[1], 160),
      timezone: cleanText_(options.timezone || APP.DEFAULT_TIMEZONE, 80),
      status: 'ACTIVE', created_at: timestamp, updated_at: timestamp,
    });
  }

  let user = findOne_('USERS', function (row) { return normalizeEmail_(row.email) === email; });
  if (!user) {
    user = insert_('USERS', {
      organization_id: organization.organization_id, email: email,
      display_name: cleanText_(options.adminName || email.split('@')[0], 160),
      role: ROLE.ADMIN, active: true, created_at: timestamp, updated_at: timestamp,
    });
  }

  if (!props.getProperty(APP.PROP_EVIDENCE_FOLDER_ID)) {
    const folder = Drive.Files.create({
      name: (options.organizationName || organization.name) + ' - Accountability Evidence',
      mimeType: 'application/vnd.google-apps.folder',
    }, null, { fields: 'id' });
    props.setProperty(APP.PROP_EVIDENCE_FOLDER_ID, folder.id);
  }

  const context = getSystemContext_(organization.organization_id);
  context.userId = user.user_id;
  [
    ['ACKNOWLEDGEMENT_SLA_HOURS', '24'], ['DUE_SOON_HOURS', '24'],
    ['ESCALATION_LEVEL_2_HOURS', '72'], ['ESCALATION_LEVEL_3_HOURS', '168'],
    ['DAILY_DIGEST_ENABLED', 'true'], ['RETENTION_POLICY', 'TO_BE_CONFIRMED_BEFORE_PILOT'],
  ].forEach(function (entry) {
    if (getSetting_(organization.organization_id, entry[0], null) === null) setSetting_(context, entry[0], entry[1]);
  });
  installAutomation();
  return { spreadsheetId: spreadsheetId, organizationId: organization.organization_id, adminEmail: email };
}

/** Install only the two shared application triggers; never one trigger per task/report. */
function installAutomation() {
  ['scheduledSweep', 'dailyDigest'].forEach(function (handler) {
    ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === handler; })
      .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  });
  ScriptApp.newTrigger('scheduledSweep').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(7).everyDays(1).create();
  return { installed: true };
}
