/** Pure business rules kept free of Apps Script services where practical. */
function transitionAllowed_(fromStatus, toStatus) {
  const transitions = {};
  transitions[STATUS.ACTION_ASSIGNED] = [STATUS.ACTION_ACKNOWLEDGED, STATUS.ACTION_OVERDUE, STATUS.ACTION_CANCELLED];
  transitions[STATUS.ACTION_ACKNOWLEDGED] = [STATUS.ACTION_IN_PROGRESS, STATUS.ACTION_COMPLETED, STATUS.ACTION_OVERDUE, STATUS.ACTION_CANCELLED];
  transitions[STATUS.ACTION_IN_PROGRESS] = [STATUS.ACTION_COMPLETED, STATUS.ACTION_OVERDUE, STATUS.ACTION_CANCELLED];
  transitions[STATUS.ACTION_OVERDUE] = [STATUS.ACTION_ACKNOWLEDGED, STATUS.ACTION_IN_PROGRESS, STATUS.ACTION_COMPLETED, STATUS.ACTION_CANCELLED];
  transitions[STATUS.ACTION_COMPLETED] = [STATUS.ACTION_VERIFIED, STATUS.ACTION_IN_PROGRESS];
  transitions[STATUS.ACTION_VERIFIED] = [];
  transitions[STATUS.ACTION_CANCELLED] = [];
  return Boolean(transitions[fromStatus] && transitions[fromStatus].indexOf(toStatus) !== -1);
}

function notificationEventKey_(entityType, entityId, eventType, stage, recipient) {
  return [entityType, entityId, eventType, stage || 'ONCE', normalizeEmail_(recipient)].join(':');
}

function validateFieldValue_(field, value) {
  const type = field.field_type;
  const empty = value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length);
  if (asBool_(field.required) && empty) return field.field_name + ' is required.';
  if (empty) return '';
  if (['NUMBER', 'CURRENCY', 'PERCENTAGE'].indexOf(type) !== -1 && !Number.isFinite(Number(value))) return field.field_name + ' must be a number.';
  if (type === 'PERCENTAGE' && (Number(value) < 0 || Number(value) > 100)) return field.field_name + ' must be between 0 and 100.';
  if (type === 'URL' && !/^https:\/\//i.test(String(value))) return field.field_name + ' must be a secure https URL.';
  if (type === 'YES_NO' && ['YES', 'NO', true, false].indexOf(value) === -1) return field.field_name + ' must be Yes or No.';
  if (type === 'DROPDOWN') {
    const options = parseJson_(field.options_json, []);
    if (options.length && options.indexOf(value) === -1) return field.field_name + ' contains an invalid option.';
  }
  const validation = parseJson_(field.validation_json, {});
  if (validation.maxLength && String(value).length > Number(validation.maxLength)) return field.field_name + ' is too long.';
  if (validation.min !== undefined && Number(value) < Number(validation.min)) return field.field_name + ' is below the minimum.';
  if (validation.max !== undefined && Number(value) > Number(validation.max)) return field.field_name + ' exceeds the maximum.';
  return '';
}

function validateTemplateFields_(fields) {
  assert_(Array.isArray(fields) && fields.length > 0, 'Add at least one template field.');
  const names = {};
  fields.forEach(function (field, index) {
    const name = cleanText_(field.fieldName || field.field_name, 120);
    assert_(name, 'Field ' + (index + 1) + ' needs a name.');
    const key = name.toLowerCase();
    assert_(!names[key], 'Field names must be unique.');
    names[key] = true;
    const type = cleanText_(field.fieldType || field.field_type, 30).toUpperCase();
    assert_(FIELD_TYPES.indexOf(type) !== -1, 'Unsupported field type: ' + type);
    const options = field.options || parseJson_(field.options_json, []);
    if (type === 'DROPDOWN') assert_(Array.isArray(options) && options.length > 0, name + ' needs dropdown options.');
  });
}

function escalationStage_(dueAt, now, level2Hours, level3Hours) {
  const overdueHours = (now.getTime() - new Date(dueAt).getTime()) / 3600000;
  if (overdueHours < 0) return '';
  if (overdueHours >= Number(level3Hours || 168)) return 'LEVEL_3';
  if (overdueHours >= Number(level2Hours || 72)) return 'LEVEL_2';
  return 'LEVEL_1';
}

function periodForDate_(frequency, dueRule, date, timezone) {
  const local = Utilities.formatDate(date, timezone, 'yyyy-MM-dd');
  const parts = local.split('-').map(Number);
  const base = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
  let start = new Date(base);
  let end = new Date(base);
  let due = new Date(base);
  const time = String((dueRule || {}).dueTime || '17:00').split(':').map(Number);
  if (frequency === 'WEEKLY') {
    const day = (base.getUTCDay() + 6) % 7;
    start.setUTCDate(base.getUTCDate() - day);
    end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    due = new Date(start); due.setUTCDate(start.getUTCDate() + Math.min(6, Math.max(0, Number(dueRule.weekday || 5) - 1)));
  } else if (frequency === 'MONTHLY') {
    start = new Date(Date.UTC(parts[0], parts[1] - 1, 1, 12));
    end = new Date(Date.UTC(parts[0], parts[1], 0, 12));
    const dayOfMonth = Math.min(end.getUTCDate(), Math.max(1, Number(dueRule.dayOfMonth || end.getUTCDate())));
    due = new Date(Date.UTC(parts[0], parts[1] - 1, dayOfMonth, 12));
  }
  const dueDateString = Utilities.formatDate(due, 'UTC', 'yyyy-MM-dd');
  return {
    start: Utilities.formatDate(start, 'UTC', 'yyyy-MM-dd'),
    end: Utilities.formatDate(end, 'UTC', 'yyyy-MM-dd'),
    dueAt: localDateTimeToIso_(dueDateString, time[0] || 17, time[1] || 0, timezone),
  };
}

function localDateTimeToIso_(dateString, hour, minute, timezone) {
  const guess = new Date(dateString + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00Z');
  const offset = Utilities.formatDate(guess, timezone, 'Z');
  const sign = offset[0] === '-' ? -1 : 1;
  const offsetMinutes = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
  return new Date(guess.getTime() - offsetMinutes * 60000).toISOString();
}
