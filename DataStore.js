/** Google Sheets persistence with immutable identifiers and batched row access. */
function getDataSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.PROP_SPREADSHEET_ID);
  assert_(id, 'Application storage is not configured. Run setupApplication() as the deployment owner.', 'NOT_CONFIGURED');
  return SpreadsheetApp.openById(id);
}

function ensureSheets_(spreadsheet) {
  Object.keys(SHEETS).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = SHEETS[name];
    const current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    const matches = headers.length === current.length && headers.every(function (header, index) { return current[index] === header; });
    if (!matches) {
      assert_(sheet.getLastRow() <= 1, 'Schema mismatch in populated sheet ' + name + '. Migrate it before continuing.', 'SCHEMA_MISMATCH');
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E9EEF5');
      sheet.autoResizeColumns(1, headers.length);
    }
  });
}

function table_(sheetName) {
  const headers = SHEETS[sheetName];
  assert_(headers, 'Unknown table: ' + sheetName, 'INTERNAL_ERROR');
  const sheet = getDataSpreadsheet_().getSheetByName(sheetName);
  assert_(sheet, 'Missing storage sheet: ' + sheetName, 'NOT_CONFIGURED');
  return { sheet: sheet, headers: headers };
}

function decodeCell_(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 1 && value[0] === "'" && /^[=+\-@]/.test(value[1])) return value.slice(1);
  return value;
}

function encodeCell_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') value = JSON.stringify(value);
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function rows_(sheetName) {
  const table = table_(sheetName);
  const lastRow = table.sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = table.sheet.getRange(2, 1, lastRow - 1, table.headers.length).getValues();
  return values.map(function (row, offset) {
    const result = { _row: offset + 2 };
    table.headers.forEach(function (header, index) { result[header] = decodeCell_(row[index]); });
    return result;
  });
}

function findAll_(sheetName, predicate) {
  return rows_(sheetName).filter(predicate || function () { return true; });
}

function findOne_(sheetName, predicate) {
  const all = rows_(sheetName);
  for (let i = 0; i < all.length; i += 1) if (predicate(all[i])) return all[i];
  return null;
}

function getById_(sheetName, id) {
  const idField = ID_FIELD[sheetName];
  return findOne_(sheetName, function (record) { return record[idField] === id; });
}

function prepareRecord_(sheetName, input, existing) {
  const headers = SHEETS[sheetName];
  const idField = ID_FIELD[sheetName];
  const record = {};
  headers.forEach(function (header) {
    if (Object.prototype.hasOwnProperty.call(input, header)) record[header] = input[header];
    else if (existing && Object.prototype.hasOwnProperty.call(existing, header)) record[header] = existing[header];
    else record[header] = '';
  });
  if (idField && !record[idField]) record[idField] = newId_(sheetName);
  return record;
}

function insert_(sheetName, input) {
  const table = table_(sheetName);
  const record = prepareRecord_(sheetName, input, null);
  table.sheet.appendRow(table.headers.map(function (header) { return encodeCell_(record[header]); }));
  SpreadsheetApp.flush();
  return record;
}

function insertMany_(sheetName, inputs) {
  if (!inputs || !inputs.length) return [];
  const table = table_(sheetName);
  const records = inputs.map(function (input) { return prepareRecord_(sheetName, input, null); });
  const values = records.map(function (record) {
    return table.headers.map(function (header) { return encodeCell_(record[header]); });
  });
  table.sheet.getRange(table.sheet.getLastRow() + 1, 1, values.length, table.headers.length).setValues(values);
  SpreadsheetApp.flush();
  return records;
}

function update_(sheetName, id, patch) {
  const table = table_(sheetName);
  const existing = getById_(sheetName, id);
  assert_(existing, sheetName + ' record not found: ' + id, 'NOT_FOUND');
  const record = prepareRecord_(sheetName, patch || {}, existing);
  table.sheet.getRange(existing._row, 1, 1, table.headers.length)
    .setValues([table.headers.map(function (header) { return encodeCell_(record[header]); })]);
  SpreadsheetApp.flush();
  return record;
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  assert_(lock.tryLock(APP.LOCK_TIMEOUT_MS), 'The system is busy. Please retry.', 'BUSY');
  try { return callback(); } finally { lock.releaseLock(); }
}

function getSetting_(organizationId, key, fallback) {
  const row = findOne_('SETTINGS', function (item) {
    return item.organization_id === organizationId && item.key === key;
  });
  return row ? row.value : fallback;
}

function setSetting_(context, key, value) {
  const existing = findOne_('SETTINGS', function (item) {
    return item.organization_id === context.organizationId && item.key === key;
  });
  const patch = { value: cleanText_(value, 5000), updated_by: context.userId, updated_at: nowIso_() };
  if (existing) return update_('SETTINGS', existing.setting_id, patch);
  return insert_('SETTINGS', Object.assign({
    organization_id: context.organizationId, key: cleanText_(key, 100)
  }, patch));
}

function appendAudit_(context, entityType, entityId, eventType, before, after) {
  return insert_('AUDIT_EVENTS', {
    organization_id: context.organizationId,
    actor_id: context.userId || 'SYSTEM',
    entity_type: entityType,
    entity_id: entityId,
    event_type: eventType,
    before_json: serialize_(before || {}),
    after_json: serialize_(after || {}),
    created_at: nowIso_(),
  });
}
