# Architecture

## Operating model

The application implements the product loop:

`Report -> Review -> Decision -> Action -> Acknowledgement -> Follow-up -> Escalation -> Completion -> Verification`

It is a Google Apps Script web app. Apps Script HTML Service supplies the responsive UI; Google Sheets stores normalized operational records; Drive stores private evidence; Apps Script time triggers generate obligations and process reminders; and MailApp is the mandatory delivery channel. Google Chat can be enabled with a webhook stored in Script Properties.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `Code.js` | Web entry point, allow-listed RPC router, first-time setup, shared triggers |
| `Security.js` | Google identity resolution, active-user checks, roles, row scopes |
| `DataStore.js` | Sheet schema, stable IDs, batch mapping, formula-injection protection, locks |
| `TemplateService.js` | Typed templates, immutable published versions, assignments |
| `ReportService.js` | Obligations, dynamic reports, evidence, repository, review |
| `ActionService.js` | Action state machine, acknowledgement, completion, verification |
| `NotificationService.js` | Persistent outbox, deduplication, retries, reminders, escalation, digest |
| `DashboardService.js` | Exception-first MD/HOD/employee metrics and attention queues |
| `AdminService.js` | Departments, users, policy, audit visibility, system health |

## Notification design

Core actions write their business record, audit event, and outbox record in the same locked mutation. Delivery happens later. A failed email therefore cannot undo a valid submission or action update.

Each logical delivery has a deterministic `event_key`, including entity, event, escalation stage, and recipient. Re-running the 15-minute scheduler is safe because the outbox rejects logical duplicates. Jobs are claimed before sending, stale claims recover after 10 minutes, and transient failures use bounded exponential backoff.

There are only two time triggers for the project:

1. `scheduledSweep` every 15 minutes for obligations, due/overdue evaluation, escalations, and outbox delivery.
2. `dailyDigest` once daily for management summaries.

There is deliberately no `onEdit()` business logic and no trigger per task.

## Security boundaries

- Identity fails closed if `Session.getActiveUser().getEmail()` is unavailable.
- Every RPC call resolves the user again and enforces organization, department, role, and ownership scope server-side.
- The web client never supplies an authoritative role.
- Backing sheets are an implementation detail and should not be shared with ordinary users.
- Drive evidence is created inside the app-controlled folder and is never made public automatically.
- Spreadsheet-bound text beginning with `=`, `+`, `-`, or `@` is prefixed to prevent formula execution.
- Audit rows are append-only through application services.
- Optional Chat credentials belong in Script Properties, never HTML or a sheet.

## Scale and migration

All entities use immutable IDs. Template fields and report values use a schema/value pattern rather than one physical sheet per template. Service boundaries do not depend on row numbers, which makes a later migration to a relational database possible without redesigning the validated workflow.
