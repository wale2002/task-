/** Configurable reporting templates, immutable versions, and assignments. */
function templateFields_(templateId) {
  return findAll_('TEMPLATE_FIELDS', function (field) { return field.template_id === templateId; })
    .sort(function (a, b) { return Number(a.position) - Number(b.position); });
}

function listTemplates_(context, payload) {
  let templates = findAll_('REPORT_TEMPLATES', function (row) {
    return row.organization_id === context.organizationId && canSeeDepartment_(context, row.department_id || context.departmentId);
  });
  if (payload.status) templates = templates.filter(function (row) { return row.status === payload.status; });
  return templates.sort(function (a, b) { return b.updated_at.localeCompare(a.updated_at); }).map(function (template) {
    return Object.assign({}, template, {
      fieldCount: templateFields_(template.template_id).length,
      assignmentCount: findAll_('REPORT_ASSIGNMENTS', function (assignment) { return assignment.template_id === template.template_id && asBool_(assignment.active); }).length,
    });
  });
}

function getTemplate_(context, payload) {
  const template = getById_('REPORT_TEMPLATES', payload.templateId);
  requireOrganization_(context, template);
  requireDepartmentScope_(context, template.department_id || context.departmentId);
  return {
    template: template,
    fields: templateFields_(template.template_id),
    assignments: findAll_('REPORT_ASSIGNMENTS', function (assignment) {
      return assignment.template_id === template.template_id && asBool_(assignment.active);
    }),
  };
}

function saveTemplate_(context, payload) {
  requireRole_(context, [ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.HOD]);
  const input = payload.template || {};
  const fields = payload.fields || [];
  const name = cleanText_(input.name, 160);
  const frequency = cleanText_(input.frequency, 20).toUpperCase();
  assert_(name, 'Template name is required.');
  assert_(FREQUENCIES.indexOf(frequency) !== -1, 'Invalid reporting frequency.');
  const departmentId = input.departmentId || input.department_id || context.departmentId;
  assert_(departmentId, 'Choose a department.');
  requireManagerScope_(context, departmentId);
  requireOrganization_(context, getById_('DEPARTMENTS', departmentId));
  validateTemplateFields_(fields);
  const dueRule = input.dueRule || parseJson_(input.due_rule_json, {});
  return withScriptLock_(function () {
    const timestamp = nowIso_();
    let previous = null;
    if (input.templateId || input.template_id) {
      previous = getById_('REPORT_TEMPLATES', input.templateId || input.template_id);
      requireOrganization_(context, previous);
      requireManagerScope_(context, previous.department_id);
      assert_(previous.status !== STATUS.TEMPLATE_ARCHIVED, 'Archived templates cannot be edited.');
    }
    const version = previous && previous.status === STATUS.TEMPLATE_ACTIVE ? Number(previous.version || 1) + 1 : Number((previous && previous.version) || 1);
    const template = insert_('REPORT_TEMPLATES', {
      organization_id: context.organizationId,
      source_template_id: previous ? (previous.source_template_id || previous.template_id) : '', name: name,
      description: cleanText_(input.description, 2000), department_id: departmentId,
      frequency: frequency, due_rule_json: serialize_(dueRule), version: version,
      status: STATUS.TEMPLATE_DRAFT, created_by: context.userId, created_at: timestamp, updated_at: timestamp,
    });
    const savedFields = insertMany_('TEMPLATE_FIELDS', fields.map(function (field, index) {
      return {
        template_id: template.template_id,
        field_name: cleanText_(field.fieldName || field.field_name, 120),
        field_type: cleanText_(field.fieldType || field.field_type, 30).toUpperCase(),
        required: field.required === true || asBool_(field.required),
        position: index + 1,
        options_json: serialize_(field.options || parseJson_(field.options_json, [])),
        validation_json: serialize_(field.validation || parseJson_(field.validation_json, {})),
        created_at: timestamp,
      };
    }));
    if (previous && previous.status === STATUS.TEMPLATE_DRAFT) update_('REPORT_TEMPLATES', previous.template_id, { status: STATUS.TEMPLATE_ARCHIVED, updated_at: timestamp });
    appendAudit_(context, 'TEMPLATE', template.template_id, previous ? 'TEMPLATE_VERSION_DRAFTED' : 'TEMPLATE_CREATED', previous || {}, template);
    return { template: template, fields: savedFields };
  });
}

function publishTemplate_(context, payload) {
  const template = getById_('REPORT_TEMPLATES', payload.templateId);
  requireOrganization_(context, template);
  requireManagerScope_(context, template.department_id);
  assert_(template.status === STATUS.TEMPLATE_DRAFT, 'Only draft templates can be published.');
  return withScriptLock_(function () {
    validateTemplateFields_(templateFields_(template.template_id));
    const previousActive = findAll_('REPORT_TEMPLATES', function (row) {
      if (row.organization_id !== context.organizationId || row.status !== STATUS.TEMPLATE_ACTIVE || row.template_id === template.template_id) return false;
      if (template.source_template_id) {
        return row.template_id === template.source_template_id || row.source_template_id === template.source_template_id;
      }
      return row.department_id === template.department_id && row.name === template.name;
    }).sort(function (a, b) { return Number(b.version) - Number(a.version); })[0];
    if (previousActive) {
      update_('REPORT_TEMPLATES', previousActive.template_id, { status: STATUS.TEMPLATE_ARCHIVED, updated_at: nowIso_() });
      findAll_('REPORT_ASSIGNMENTS', function (assignment) { return assignment.template_id === previousActive.template_id && asBool_(assignment.active); })
        .forEach(function (assignment) { update_('REPORT_ASSIGNMENTS', assignment.assignment_id, { template_id: template.template_id }); });
    }
    const updated = update_('REPORT_TEMPLATES', template.template_id, { status: STATUS.TEMPLATE_ACTIVE, updated_at: nowIso_() });
    appendAudit_(context, 'TEMPLATE', updated.template_id, 'TEMPLATE_PUBLISHED', template, updated);
    return updated;
  });
}

function archiveTemplate_(context, payload) {
  const template = getById_('REPORT_TEMPLATES', payload.templateId);
  requireOrganization_(context, template);
  requireManagerScope_(context, template.department_id);
  return withScriptLock_(function () {
    const updated = update_('REPORT_TEMPLATES', template.template_id, { status: STATUS.TEMPLATE_ARCHIVED, updated_at: nowIso_() });
    findAll_('REPORT_ASSIGNMENTS', function (assignment) { return assignment.template_id === template.template_id && asBool_(assignment.active); })
      .forEach(function (assignment) { update_('REPORT_ASSIGNMENTS', assignment.assignment_id, { active: false }); });
    appendAudit_(context, 'TEMPLATE', updated.template_id, 'TEMPLATE_ARCHIVED', template, updated);
    return updated;
  });
}

function listAssignments_(context, payload) {
  const template = getById_('REPORT_TEMPLATES', payload.templateId);
  requireOrganization_(context, template);
  requireDepartmentScope_(context, template.department_id);
  return findAll_('REPORT_ASSIGNMENTS', function (row) { return row.template_id === template.template_id && asBool_(row.active); });
}

function saveAssignment_(context, payload) {
  const template = getById_('REPORT_TEMPLATES', payload.templateId);
  requireOrganization_(context, template);
  requireManagerScope_(context, template.department_id);
  assert_(template.status === STATUS.TEMPLATE_ACTIVE, 'Publish the template before assigning it.');
  const targetType = cleanText_(payload.targetType, 20).toUpperCase();
  assert_(['DEPARTMENT', 'USER', 'ROLE'].indexOf(targetType) !== -1, 'Invalid assignment target.');
  const targetId = cleanText_(payload.targetId, 160);
  assert_(targetId, 'Assignment target is required.');
  if (targetType === 'DEPARTMENT') {
    const department = getById_('DEPARTMENTS', targetId);
    requireOrganization_(context, department);
    if (context.role === ROLE.HOD) assert_(department.department_id === context.departmentId, 'HOD assignments must remain within the authorized department.', 'FORBIDDEN');
  }
  if (targetType === 'USER') {
    const user = getById_('USERS', targetId);
    requireOrganization_(context, user);
    if (context.role === ROLE.HOD) assert_(user.department_id === context.departmentId, 'HOD assignments must remain within the authorized department.', 'FORBIDDEN');
  }
  if (targetType === 'ROLE') assert_(ROLE_VALUES.indexOf(targetId) !== -1, 'Invalid target role.');
  return withScriptLock_(function () {
    const duplicate = findOne_('REPORT_ASSIGNMENTS', function (row) {
      return row.template_id === template.template_id && row.target_type === targetType && row.target_id === targetId && asBool_(row.active);
    });
    assert_(!duplicate, 'This assignment already exists.');
    const created = insert_('REPORT_ASSIGNMENTS', {
      organization_id: context.organizationId, template_id: template.template_id,
      target_type: targetType, target_id: targetId,
      effective_from: payload.effectiveFrom || Utilities.formatDate(new Date(), context.timezone, 'yyyy-MM-dd'),
      effective_to: payload.effectiveTo || '', active: true, created_by: context.userId, created_at: nowIso_(),
    });
    appendAudit_(context, 'ASSIGNMENT', created.assignment_id, 'ASSIGNMENT_CREATED', {}, created);
    return created;
  });
}
