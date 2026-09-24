'use strict';

const api = require('./rpc')._private;

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (req.method !== 'GET') return res.status(405).send('Method not allowed.');
  try {
    const fileId = String(req.query && req.query.id || '');
    if (!/^FILE-[A-Z0-9]+$/.test(fileId)) return res.status(400).send('Invalid file identifier.');
    const client = await api.getClient();
    const file = await client.db(api.databaseName).collection('files').findOne({ file_id: fileId });
    if (!file) return res.status(404).send('Evidence file not found.');
    const safeName = String(file.name || 'evidence').replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="' + safeName + '"');
    return res.status(200).send(file.data && file.data.buffer ? file.data.buffer : file.data);
  } catch (error) {
    console.error('File download failure:', error && error.message);
    return res.status(500).send('Unable to load evidence file.');
  }
};
