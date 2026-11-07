const storageService = require('../services/storageService');

/**
 * ดึงรายการ Jobs ทั้งหมด
 */
function getJobs(req, res) {
  try {
    const jobs = storageService.getJobsRegistry();
    return res.json({ success: true, jobs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * ดึงรายการ Submissions ของ Job
 */
function getJobSubmissions(req, res) {
  try {
    const jobCode = req.params.jobCode || req.query.jobCode;
    if (!jobCode) {
      return res.status(400).json({ error: 'Missing jobCode' });
    }

    const db = storageService.getJobDb(jobCode);
    const submissions = db ? (db.submissions || []) : [];
    return res.json({ success: true, submissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * สร้าง Job ใหม่
 */
function createJob(req, res) {
  try {
    const body = req.body || {};
    const jobId = storageService.sanitizeId(body.code || body.jobCode);
    if (!jobId) {
      return res.status(400).json({ error: 'Job code is required' });
    }

    let db = storageService.getJobDb(jobId);
    const now = Date.now();

    if (!db) {
      db = {
        jobId,
        title: body.title || jobId,
        creator: body.creator || body.createdBy || 'หัวหน้างาน',
        createdAt: now,
        status: 'OPEN',
        submissions: [],
        stats: { totalUnits: 0, uniqueBarcodes: 0, contributorsCount: 0 }
      };
    } else {
      db.status = 'OPEN';
    }

    storageService.saveJobDb(jobId, db);
    return res.json({ success: true, job: db });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * ซิงค์ยอดนับขึ้น Cloud -> บันทึกลง ./data/{job-id}/db.json
 */
function syncLogs(req, res) {
  try {
    const body = req.body || {};
    const jobId = storageService.sanitizeId(body.jobCode);
    const staffName = (body.staffName || 'ผู้ช่วยนับ').trim();

    if (!jobId) {
      return res.status(400).json({ error: 'Job code is required' });
    }

    let db = storageService.getJobDb(jobId);
    if (!db) {
      db = {
        jobId,
        title: jobId,
        creator: staffName,
        createdAt: Date.now(),
        status: 'OPEN',
        submissions: [],
        stats: { totalUnits: 0, uniqueBarcodes: 0, contributorsCount: 0 }
      };
    }

    const isClosed = db.status === 'CLOSED';

    const logs = Array.isArray(body.logs) ? body.logs : [];
    const submission = {
      staffName,
      sessionName: body.sessionName || '',
      submittedAt: body.submittedAt || new Date().toISOString(),
      logs,
      totalUnits: logs.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      uniqueSkus: new Set(logs.map(item => item.barcode)).size,
      isLate: isClosed // ระบุว่าเป็นยอดที่ซิงค์ตามหลังรอบงานที่ปิดแล้ว
    };

    // อัปเดตหรือเพิ่ม submission ของพนักงานคนนี้
    const existingIdx = (db.submissions || []).findIndex(s => s.staffName === staffName);
    if (existingIdx >= 0) {
      db.submissions[existingIdx] = submission;
    } else {
      db.submissions.push(submission);
    }

    const updatedDb = storageService.saveJobDb(jobId, db);

    return res.json({
      success: true,
      message: isClosed
        ? `ซิงค์ยอดตามหลังเข้าสู่ ./data/${jobId}/db.json สำเร็จ (รอบงานนี้ปิดแล้ว)`
        : `ซิงค์ยอดเข้าสู่ ./data/${jobId}/db.json สำเร็จ`,
      dbPath: `data/${jobId}/db.json`,
      totalUnits: updatedDb.stats.totalUnits,
      isLate: isClosed,
      job: updatedDb
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * ปิดรอบงาน
 */
function closeJob(req, res) {
  try {
    const body = req.body || {};
    const jobId = storageService.sanitizeId(body.jobCode || req.params.jobCode);
    if (!jobId) {
      return res.status(400).json({ error: 'Job code is required' });
    }

    let db = storageService.getJobDb(jobId);
    if (db) {
      db.status = 'CLOSED';
      db.closedBy = body.closedBy || 'หัวหน้างาน';
      db.closedAt = Date.now();
      storageService.saveJobDb(jobId, db);
    }

    return res.json({ success: true, jobCode: jobId, status: 'CLOSED' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * นำรอบงานที่ปิดแล้วกลับมาเปิดใหม่ (Reopen Job)
 */
function reopenJob(req, res) {
  try {
    const body = req.body || {};
    const jobId = storageService.sanitizeId(body.jobCode || req.params.jobCode);
    if (!jobId) {
      return res.status(400).json({ error: 'Job code is required' });
    }

    const updatedDb = storageService.reopenJob(jobId);
    return res.json({
      success: true,
      message: `กลับมาเปิดรอบงาน "${jobId}" เรียบร้อยแล้ว`,
      job: updatedDb
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * ลบรอบงานทิ้ง (Delete Job)
 */
function deleteJob(req, res) {
  try {
    const body = req.body || {};
    const jobId = storageService.sanitizeId(body.jobCode || req.params.jobCode);
    if (!jobId) {
      return res.status(400).json({ error: 'Job code is required' });
    }

    storageService.deleteJob(jobId);
    return res.json({
      success: true,
      message: `ลบรอบงาน "${jobId}" และข้อมูลทั้งหมดเรียบร้อยแล้ว`,
      jobCode: jobId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Router Dispatcher รองรับทั้ง REST และ Action Payload
 */
function handleActionDispatcher(req, res) {
  const action = req.body.action || req.query.action;
  if (action === 'createJob') return createJob(req, res);
  if (action === 'submitLogs' || action === 'sync') return syncLogs(req, res);
  if (action === 'closeJob') return closeJob(req, res);
  if (action === 'reopenJob') return reopenJob(req, res);
  if (action === 'deleteJob') return deleteJob(req, res);
  return res.status(400).json({ error: `Unknown action: ${action}` });
}

module.exports = {
  getJobs,
  getJobSubmissions,
  createJob,
  syncLogs,
  closeJob,
  reopenJob,
  deleteJob,
  handleActionDispatcher
};
