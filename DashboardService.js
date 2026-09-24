/** Exception-first management dashboard. */
function getDashboard_(context, payload) {
  const departmentFilter = payload.departmentId || (context.role === ROLE.HOD ? context.departmentId : '');
  if (departmentFilter) requireDepartmentScope_(context, departmentFilter);
  const users = findAll_('USERS', function (user) {
    if (user.organization_id !== context.organizationId) return false;
    if (context.role === ROLE.EMPLOYEE) return user.user_id === context.userId;
    return !departmentFilter || user.department_id === departmentFilter;
  });
  const userIds = {};
  users.forEach(function (user) { userIds[user.user_id] = true; });
  const obligations = findAll_('REPORT_OBLIGATIONS', function (row) {
    return row.organization_id === context.organizationId && userIds[row.user_id];
  });
  const submissions = findAll_('REPORT_SUBMISSIONS', function (row) {
    return row.organization_id === context.organizationId && userIds[row.submitted_by];
  });
  const actions = findAll_('ACTIONS', function (row) {
    return row.organization_id === context.organizationId && userIds[row.assigned_to];
  });
  const openStatuses = [STATUS.ACTION_ASSIGNED, STATUS.ACTION_ACKNOWLEDGED, STATUS.ACTION_IN_PROGRESS, STATUS.ACTION_OVERDUE, STATUS.ACTION_COMPLETED];
  const cards = {
    expected: obligations.length,
    submitted: obligations.filter(function (row) { return row.status === STATUS.OBLIGATION_SUBMITTED; }).length,
    missing: obligations.filter(function (row) { return row.status === STATUS.OBLIGATION_MISSING; }).length,
    awaitingReview: submissions.filter(function (row) { return row.status === STATUS.REPORT_SUBMITTED; }).length,
    openActions: actions.filter(function (row) { return openStatuses.indexOf(row.status) !== -1; }).length,
    overdueActions: actions.filter(function (row) { return row.status === STATUS.ACTION_OVERDUE || (openStatuses.indexOf(row.status) !== -1 && new Date(row.due_at) < new Date()); }).length,
  };
  const departments = findAll_('DEPARTMENTS', function (department) {
    return department.organization_id === context.organizationId && (!departmentFilter || department.department_id === departmentFilter);
  });
  const compliance = departments.map(function (department) {
    const departmentUsers = users.filter(function (user) { return user.department_id === department.department_id; });
    const ids = {}; departmentUsers.forEach(function (user) { ids[user.user_id] = true; });
    const due = obligations.filter(function (row) { return ids[row.user_id]; });
    const submitted = due.filter(function (row) { return row.status === STATUS.OBLIGATION_SUBMITTED; }).length;
    return {
      departmentId: department.department_id, departmentName: department.name,
      expected: due.length, submitted: submitted, missing: due.filter(function (row) { return row.status === STATUS.OBLIGATION_MISSING; }).length,
      complianceRate: due.length ? Math.round(submitted / due.length * 100) : 100,
    };
  }).sort(function (a, b) { return a.complianceRate - b.complianceRate; });
  const attention = [];
  obligations.filter(function (row) { return row.status === STATUS.OBLIGATION_MISSING; }).slice(0, 10).forEach(function (row) {
    const user = getById_('USERS', row.user_id); const template = getById_('REPORT_TEMPLATES', row.template_id);
    attention.push({ type: 'MISSING_REPORT', id: row.obligation_id, title: template ? template.name : 'Report', owner: user ? user.display_name : 'Unknown', dueAt: row.due_at, severity: 'HIGH' });
  });
  submissions.filter(function (row) { return row.status === STATUS.REPORT_SUBMITTED; }).slice(0, 10).forEach(function (row) {
    const user = getById_('USERS', row.submitted_by); const template = getById_('REPORT_TEMPLATES', row.template_id);
    attention.push({ type: 'AWAITING_REVIEW', id: row.submission_id, title: template ? template.name : 'Report', owner: user ? user.display_name : 'Unknown', dueAt: row.submitted_at, severity: 'MEDIUM' });
  });
  actions.filter(function (row) { return row.status === STATUS.ACTION_OVERDUE || (openStatuses.indexOf(row.status) !== -1 && new Date(row.due_at) < new Date()); }).slice(0, 15).forEach(function (row) {
    const user = getById_('USERS', row.assigned_to);
    attention.push({ type: 'OVERDUE_ACTION', id: row.action_id, title: row.instruction, owner: user ? user.display_name : 'Unknown', dueAt: row.due_at, severity: row.priority });
  });
  return { cards: cards, compliance: compliance, attention: attention.sort(function (a, b) { return a.dueAt.localeCompare(b.dueAt); }).slice(0, 20) };
}
