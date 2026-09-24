'use strict';

const api = require('./rpc')._private;

function authorized(req) {
  const configured = process.env.MONGODB_NOTIFICATION_SECRET;
  if (!configured) return false;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const suppliedBytes = Buffer.from(supplied);
  const configuredBytes = Buffer.from(configured);
  if (suppliedBytes.length !== configuredBytes.length) return false;
  return require('node:crypto').timingSafeEqual(suppliedBytes, configuredBytes);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Worker authorization failed.' });
  try {
    const client = await api.getClient();
    const db = client.db(api.databaseName);
    await api.ensureTestData(db);
    const action = String(req.body && req.body.action || 'claim');
    if (action === 'sweep') return res.status(200).json({ ok: true, data: await api.automationSweep(db) });
    if (action === 'complete') {
      const job = await db.collection('notifications').findOne({ notification_id: String(req.body.notificationId || '') });
      if (!job) return res.status(404).json({ ok: false, error: 'Notification not found.' });
      if (req.body.success) {
        await db.collection('notifications').updateOne({ notification_id: job.notification_id }, { $set: { status: 'SENT', sent_at: new Date(), updated_at: new Date(), last_error: '', claimed_at: null } });
      } else {
        const attempts = Number(job.attempts || 0) + 1;
        const terminal = attempts >= 4;
        const delayMinutes = [5, 30, 120, 360][Math.min(attempts - 1, 3)];
        await db.collection('notifications').updateOne({ notification_id: job.notification_id }, { $set: { status: terminal ? 'FAILED' : 'RETRY', attempts: attempts, next_attempt_at: new Date(Date.now() + delayMinutes * 60000), updated_at: new Date(), last_error: String(req.body.error || 'Delivery failed.').slice(0, 1000), claimed_at: null } });
      }
      return res.status(200).json({ ok: true });
    }
    const limit = Math.max(1, Math.min(Number(req.body && req.body.limit) || 20, 40));
    const jobs = [];
    for (let index = 0; index < limit; index += 1) {
      const now = new Date();
      const result = await db.collection('notifications').findOneAndUpdate({
        $or: [
          { status: 'QUEUED' },
          { status: 'RETRY', next_attempt_at: { $lte: now } },
          { status: 'PROCESSING', claimed_at: { $lte: new Date(Date.now() - 10 * 60000) } },
        ],
      }, { $set: { status: 'PROCESSING', claimed_at: now, updated_at: now } }, { sort: { created_at: 1 }, returnDocument: 'after' });
      const job = result && (result.value || result);
      if (!job || !job.notification_id) break;
      jobs.push({ notificationId: job.notification_id, templateKey: job.template_key, recipient: job.recipient, entityId: job.entity_id, payload: job.payload || {} });
    }
    return res.status(200).json({ ok: true, data: jobs });
  } catch (error) {
    console.error('Notification worker failure:', error && error.message);
    return res.status(500).json({ ok: false, error: 'Notification worker failed.' });
  }
};
