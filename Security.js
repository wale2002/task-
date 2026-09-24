/** Identity, RBAC, and row-scope guards. */
function resolveEmail_() {
  let email = normalizeEmail_(Session.getActiveUser().getEmail());
  const props = PropertiesService.getScriptProperties();
  if (!email && props.getProperty(APP.PROP_ALLOW_DEV_IDENTITY) === 'true') {
    email = normalizeEmail_(props.getProperty(APP.PROP_DEV_EMAIL));
  }
  assert_(email, 'Your Google Workspace identity could not be established. Access is denied.', 'IDENTITY_UNAVAILABLE');
  return email;
}

function getContext_() {
  const email = resolveEmail_();
  const user = findOne_('USERS', function (row) { return normalizeEmail_(row.email) === email; });
  assert_(user && asBool_(user.active), 'Your account is not approved or is inactive.', 'FORBIDDEN');
  const organization = getById_('ORGANIZATIONS', user.organization_id);
  assert_(organization && organization.status === 'ACTIVE', 'Organization is inactive.', 'FORBIDDEN');
  return {
    userId: user.user_id,
    organizationId: user.organization_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    departmentId: user.department_id || '',
    managerUserId: user.manager_user_id || '',
    timezone: organization.timezone || APP.DEFAULT_TIMEZONE,
    organizationName: organization.name,
  };
}

function getSystemContext_(organizationId) {
  const organization = getById_('ORGANIZATIONS', organizationId);
  assert_(organization, 'Organization not found.', 'NOT_FOUND');
  return {
    userId: 'SYSTEM', organizationId: organizationId, email: '', displayName: 'System',
    role: ROLE.ADMIN, departmentId: '', managerUserId: '',
    timezone: organization.timezone || APP.DEFAULT_TIMEZONE,
    organizationName: organization.name,
  };
}

function requireRole_(context, roles) {
  assert_(roles.indexOf(context.role) !== -1, 'You are not authorized to perform this action.', 'FORBIDDEN');
}

function requireOrganization_(context, record) {
  assert_(record && record.organization_id === context.organizationId, 'Record is outside your organization.', 'FORBIDDEN');
}

function canSeeDepartment_(context, departmentId) {
  if ([ROLE.ADMIN, ROLE.EXECUTIVE, ROLE.VIEWER].indexOf(context.role) !== -1) return true;
  return Boolean(departmentId) && departmentId === context.departmentId;
}

function requireDepartmentScope_(context, departmentId) {
  assert_(canSeeDepartment_(context, departmentId), 'Record is outside your authorized department.', 'FORBIDDEN');
}

function canManageDepartment_(context, departmentId) {
  return [ROLE.ADMIN, ROLE.EXECUTIVE].indexOf(context.role) !== -1 ||
    (context.role === ROLE.HOD && context.departmentId === departmentId);
}

function requireManagerScope_(context, departmentId) {
  assert_(canManageDepartment_(context, departmentId), 'Manager scope is required.', 'FORBIDDEN');
}

function publicContext_(context) {
  return {
    userId: context.userId, email: context.email, displayName: context.displayName,
    role: context.role, departmentId: context.departmentId,
    organizationId: context.organizationId, organizationName: context.organizationName,
    timezone: context.timezone,
  };
}
