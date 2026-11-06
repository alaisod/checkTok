const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const config = require('../config');

// Health & Version Check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: config.version,
    environment: config.env,
    storagePath: config.dataDir,
    timestamp: new Date().toISOString()
  });
});

router.get('/version', (req, res) => {
  res.json({
    name: 'checkTok',
    version: config.version,
    environment: config.env
  });
});

router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: config.version,
    environment: config.env,
    storagePath: config.dataDir,
    timestamp: new Date().toISOString()
  });
});

// RESTful Endpoints
router.get('/jobs', jobController.getJobs);
router.post('/jobs', jobController.createJob);
router.get('/jobs/:jobCode/submissions', jobController.getJobSubmissions);
router.post('/jobs/:jobCode/sync', jobController.syncLogs);
router.post('/jobs/:jobCode/close', jobController.closeJob);
router.post('/jobs/:jobCode/reopen', jobController.reopenJob);
router.post('/jobs/:jobCode/delete', jobController.deleteJob);
router.delete('/jobs/:jobCode', jobController.deleteJob);

// Action Dispatcher (สำหรับ Legacy Payload จาก cloud.js เช่น ?action=getJobs หรือ { action: 'submitLogs' })
router.get('/', (req, res) => {
  const action = req.query.action;
  if (action === 'getJobs') return jobController.getJobs(req, res);
  if (action === 'fetchSubmissions' || req.query.jobCode) return jobController.getJobSubmissions(req, res);
  return res.json({ message: 'checkTok API Server' });
});

router.post('/', jobController.handleActionDispatcher);

module.exports = router;
