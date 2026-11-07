const fs = require('fs');
const path = require('path');
const config = require('../config');
const MergeManager = require('../core/merge');

// ตรวจสอบและสร้างโฟลเดอร์ data
function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
  if (!fs.existsSync(config.jobsRegistryFile)) {
    fs.writeFileSync(config.jobsRegistryFile, JSON.stringify([], null, 2), 'utf8');
  }
}

function sanitizeId(id) {
  return String(id || '').replace(/[\/\\?%*:|"<>]/g, '_').trim().toUpperCase();
}

function getJobDir(jobId) {
  return path.join(config.dataDir, sanitizeId(jobId));
}

function getJobDbPath(jobId) {
  return path.join(getJobDir(jobId), 'db.json');
}

function getJobsRegistry() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(config.jobsRegistryFile, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveJobsRegistry(jobs) {
  ensureDataDir();
  fs.writeFileSync(config.jobsRegistryFile, JSON.stringify(jobs, null, 2), 'utf8');
}

/**
 * อ่าน DB File จาก ./data/{job-id}/db.json
 */
function getJobDb(jobId) {
  ensureDataDir();
  const dbPath = getJobDbPath(jobId);
  if (fs.existsSync(dbPath)) {
    try {
      return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      console.error(`Failed to read db.json for ${jobId}:`, e);
    }
  }
  return null;
}

/**
 * บันทึก DB File ลง ./data/{job-id}/db.json พร้อมไฟล์ CSV สรุป
 */
function saveJobDb(jobId, dbData) {
  ensureDataDir();
  const cleanId = sanitizeId(jobId);
  const dir = getJobDir(cleanId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const submissionsDir = path.join(dir, 'submissions');
  if (!fs.existsSync(submissionsDir)) {
    fs.mkdirSync(submissionsDir, { recursive: true });
  }

  // ใช้ Core Logic ใน src/core/merge คำนวณสรุปยอดสินค้ารวม
  const submissions = (dbData.submissions || []).map(sub => {
    const logs = Array.isArray(sub.logs) ? sub.logs : [];
    return {
      ...sub,
      staffName: sub.staffName || 'ผู้ช่วยนับ',
      totalUnits: logs.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      uniqueSkus: new Set(logs.map(item => item.barcode)).size
    };
  });
  dbData.submissions = submissions;

  const sources = submissions.map(sub => ({
    name: sub.staffName,
    logs: sub.logs || []
  }));

  const mergeResult = MergeManager.computeMerge(sources);
  const summaryList = (mergeResult.summaryList || []).map(item => ({
    barcode: item.barcode,
    totalQty: item.totalQty,
    contributors: item.sources || []
  }));
  const totalUnits = mergeResult.totalUnits || 0;

  dbData.jobId = cleanId;
  dbData.updatedAt = new Date().toISOString();
  dbData.stats = {
    totalUnits,
    uniqueBarcodes: summaryList.length,
    contributorsCount: submissions.length
  };
  dbData.summary = summaryList;

  // 1. บันทึก DB file: ./data/{job-id}/db.json
  const dbPath = getJobDbPath(cleanId);
  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');

  // 2. บันทึก submissions แยกรายบุคคล: ./data/{job-id}/submissions/{staff}.json
  submissions.forEach(sub => {
    if (sub.staffName) {
      const staffFile = path.join(submissionsDir, `${sanitizeId(sub.staffName)}.json`);
      fs.writeFileSync(staffFile, JSON.stringify(sub, null, 2), 'utf8');
    }
  });

  // 3. สร้างไฟล์ CSV สรุป: ./data/{job-id}/summary.csv (ใช้เฉพาะ 3 คอลัมน์: ลำดับ,บาร์โค้ด,จำนวน)
  try {
    let csv = '\uFEFF'; // BOM สำหรับเปิดใน Excel ภาษาไทยได้ทันที
    csv += 'ลำดับ,บาร์โค้ด,จำนวน\n';
    summaryList.forEach((item, idx) => {
      csv += `${idx + 1},"${item.barcode}",${item.totalQty}\n`;
    });
    fs.writeFileSync(path.join(dir, 'summary.csv'), csv, 'utf8');
  } catch (err) {
    console.error('CSV write error:', err);
  }

  // 4. อัปเดตใน jobs.json หลัก
  const registry = getJobsRegistry();
  const regIdx = registry.findIndex(j => (j.jobCode || j.code) === cleanId);
  const regItem = {
    code: cleanId,
    jobCode: cleanId,
    title: dbData.title || cleanId,
    creator: dbData.creator,
    createdBy: dbData.creator,
    createdAt: dbData.createdAt,
    status: dbData.status || 'OPEN',
    contributorsCount: submissions.length,
    totalUnits,
    updatedAt: dbData.updatedAt
  };

  if (regIdx >= 0) {
    registry[regIdx] = { ...registry[regIdx], ...regItem };
  } else {
    registry.unshift(regItem);
  }
  saveJobsRegistry(registry);

  return dbData;
}

/**
 * กลับมาเปิดรอบงานใหม่ (Reopen Job)
 */
function reopenJob(jobId) {
  ensureDataDir();
  const cleanId = sanitizeId(jobId);
  const db = getJobDb(cleanId);
  if (!db) {
    throw new Error(`ไม่พบข้อมูลรอบงาน "${cleanId}"`);
  }

  db.status = 'OPEN';
  db.reopenedAt = new Date().toISOString();
  delete db.closedAt;
  delete db.closedBy;

  saveJobDb(cleanId, db);
  return db;
}

/**
 * ลบรอบงานทิ้ง (Delete Job)
 */
function deleteJob(jobId) {
  ensureDataDir();
  const cleanId = sanitizeId(jobId);
  const dir = getJobDir(cleanId);

  // 1. ลบโฟลเดอร์ data/{job-id} และไฟล์ทั้งหมดในโฟลเดอร์
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2. ลบออกจาก jobs.json หลัก
  const registry = getJobsRegistry().filter(j => (j.jobCode || j.code) !== cleanId);
  saveJobsRegistry(registry);

  return true;
}

module.exports = {
  sanitizeId,
  getJobDir,
  getJobDbPath,
  getJobsRegistry,
  getJobDb,
  saveJobDb,
  reopenJob,
  deleteJob
};
