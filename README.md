# Accountability Hub

Accountability Hub is a deployable Google Apps Script MVP for structured management reporting and traceable follow-through. Management creates typed report templates without code, employees submit assigned reports, reviewers return or approve them, and significant findings become actions that are acknowledged, escalated, completed, and independently verified.

## Included MVP capabilities

- Google Workspace identity with server-side Admin, Executive, HOD, Employee, and Viewer scopes
- Departments, people, managers, and active/inactive access
- Spreadsheet-style template builder with 15 field types, required fields, options, validation, and immutable published versions
- Daily, weekly, monthly, and manual assignments with generated reporting obligations
- Draft, submit, clarification, resubmission, and review flows
- Private Drive evidence and secure URL evidence
- Report repository with role-scoped search and complete traceability
- Actions linked to source reports with acknowledgement, progress, completion, evidence, verification, reopening, and cancellation
- Separate action title/instructions, evidence-required policy, discussion threads, and explicit return-for-rework history
- Exception-first dashboards for reporting compliance, review backlog, and overdue actions
- Append-only audit events for business-state changes
- Idempotent notification outbox, retries, unacknowledged reminders, due-soon reminders, three escalation stages, and daily digests
- Admin health screen for triggers, mail quota, failed jobs, and manual retry
- Responsive desktop/mobile UI with keyboard-friendly native controls and status text

## Why Apps Script for notifications?

For this single-organization Google Workspace MVP, Apps Script is the best initial approach when its constraints are explicit. It keeps identity, Sheets, Drive, and email in one managed environment and avoids extra infrastructure during validation.

The safe pattern is the one implemented here:

- Use installable time-driven triggers, not `onEdit()`.
- Use one periodic sweep for many items, not one trigger per report or action.
- Persist an outbox before delivery so notification failures do not roll back valid work.
- Give every logical notification a deterministic event key so scheduled retries do not duplicate escalations.
- Monitor execution, mail quota, outbox failures, record volume, and latency.
- Keep the schema portable so a validated workflow can later move to a database/queue worker.

Move beyond Apps Script when pilot load approaches quotas, execution routinely nears six minutes, notification volume outgrows Workspace mail limits, external recipients/channels become material, or stronger queue/SLA guarantees are required. At that point, keep the product workflow and replace the scheduler/outbox delivery layer with Cloud Tasks/Cloud Run, Pub/Sub, or a comparable managed worker. n8n can consume optional webhooks, but it should not be required for transaction correctness.

## Deploy

### Vercel + MongoDB Atlas deployment

The repository includes a Vercel build that assembles the Apps Script HTML partials into a standalone frontend. On Vercel, the browser calls `api/rpc.js`, which uses the official MongoDB Node.js driver and the server-only `MONGODB_URI` environment variable. The connection string is never shipped to the browser or committed to Git.

Set `MONGODB_URI` and, optionally, `MONGODB_DATABASE` (defaults to `accountability_hub`) in every Vercel environment. The first successful API request creates indexes and inserts a small, clearly identified test dataset only when the database contains no users. Records created or edited in the UI are then persisted in Atlas.

The MongoDB deployment currently uses a test executive context and must not receive confidential production data until authentication is connected. Dashboard totals are calculated only from MongoDB records; the UI does not substitute hard-coded metric totals.

The deployed action loop supports:

1. Create an action from a report, with the issue context prefilled.
2. Assign title, instructions, owner, verifier, priority, deadline, and an evidence requirement.
3. Acknowledge, start, complete with a secure link or uploaded proof, verify, or return for rework.
4. Discuss the action in a timestamped thread and inspect its complete event timeline.
5. Run policy sweeps that mark missing reports and overdue actions, queue reminders, and escalate through manager, HOD, and executive levels.

Evidence uploaded through the Vercel UI is stored in MongoDB and served by a dedicated file endpoint. The MVP caps these files at 3 MB; use private object storage with authenticated, expiring links before storing sensitive production evidence.

### Connect the Apps Script notification worker to MongoDB

The repository includes `MongoNotificationWorker.js`. It claims queued jobs from the protected Vercel endpoint, sends them with `MailApp`, and reports success or retry state. This keeps Apps Script as the email transport while MongoDB remains the workflow database.

1. Add a strong random `MONGODB_NOTIFICATION_SECRET` to the Vercel project. Do not commit it.
2. Push this repository to an Apps Script project with `clasp` or copy the root Apps Script files into the editor.
3. Replace all pilot placeholder addresses with real approved Workspace users.
4. Run the following once in Apps Script, using the same secret:

```javascript
configureMongoNotificationWorker(
  'https://YOUR-APP.vercel.app/api/notification-worker',
  'THE-SAME-SECRET-STORED-IN-VERCEL',
  'https://YOUR-APP.vercel.app'
);
```

That function stores the values in Script Properties and installs one shared 15-minute trigger. Run `processMongoNotifications()` manually once and inspect the execution log before enabling a pilot. Assignment and acknowledgement reminders include a direct portal link; the link still relies on the application identity layer, which must be completed before production use.

### Apps Script production app

### 1. Create the Apps Script project

Create a standalone Apps Script project under a controlled organizational owner. In its associated Google Cloud project, enable the Google Drive API. The manifest already declares the Advanced Drive service and the narrow OAuth scopes used by the application.

You can copy the source files in the Apps Script editor, or use clasp:

```bash
npm install
cp .clasp.example.json .clasp.json
# Put the Apps Script project ID in .clasp.json
npx clasp login
npx clasp push
```

On PowerShell, use `Copy-Item .clasp.example.json .clasp.json` instead of `cp`.

### 2. Initialize storage and automation

From the Apps Script editor, run this once as the controlled deployment owner:

```javascript
setupApplication({
  organizationName: 'Example Company',
  domain: 'example.com',
  timezone: 'Africa/Lagos',
  adminName: 'System Administrator'
});
```

This idempotently creates the backing spreadsheet, normalized sheets, private evidence folder, first Admin user, baseline policy, one 15-minute scheduler trigger, and one daily digest trigger. Keep the generated spreadsheet and folder private from ordinary application users.

### 3. Complete the identity spike

Deploy the project as a web app with:

- Execute as: **the user deploying the web app**
- Access: **users in the Workspace domain**

Before a production pilot, test the deployed URL with one real account for every intended role. Confirm that `Session.getActiveUser().getEmail()` resolves the correct person and that cross-department reads fail. The app denies access when identity is blank; do not weaken that gate.

If the Workspace configuration cannot disclose the accessing identity under execute-as-owner behavior, switch to execute-as-user and adjust backing-file permissions as part of the technical spike. Do not launch the pilot until this is proven.

### 4. Add people and templates

1. Open **Administration** and create departments.
2. Add approved users and assign roles, departments, and managers.
3. Assign a HOD to each department.
4. Open **Template builder**, create and publish a real reporting format.
5. Assign it to a department, user, or role. Current obligations are generated immediately; the scheduler maintains subsequent periods.

### 5. Optional Google Chat

Email is mandatory. To enable the optional Chat delivery adapter, add `GOOGLE_CHAT_WEBHOOK_URL` in **Project Settings -> Script Properties**. Never place the webhook in client HTML or a spreadsheet. The current UI queues email events; Chat can be selected from service code for chosen event types after Workspace configuration is approved.

## Local checks

Node.js is enough for the zero-runtime-dependency checks:

```bash
npm test
npm run check
```

`npm test` exercises the action state machine, typed-field validation, deterministic notification keys, escalation stages, and template validation. `npm run check` parses every server file, the browser script, and the Apps Script manifest.

## Pilot gate

Do not treat a successful deployment as a successful pilot. Before launch, agree the retention policy and notification wording, baseline reporting performance, and approve real templates and escalation SLAs. Pilot with two or three departments, then require:

- all P0 workflows operational;
- no critical security defects or unexplained record loss;
- no overdue action that should have escalated but did not;
- notification delivery or deterministic terminal failure at or above the agreed target;
- measurable improvement in reporting compliance and management visibility.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, notification behavior, security controls, and the migration path.
