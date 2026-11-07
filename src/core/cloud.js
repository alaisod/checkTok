/**
 * Cloud Sync Module - Job-Centric Coordination Architecture
 * Manages Cloud Jobs (OPEN/CLOSED), multi-staff submissions, and aggregated summaries
 */
const CloudSync = (() => {
  const CLOUD_URL_KEY = 'stock_checker_cloud_api_url';
  const JOBS_REGISTRY_KEY = 'stock_checker_cloud_jobs_registry';
  const MOCK_STORAGE_PREFIX = 'stock_checker_mock_cloud_';

  function getApiUrl() {
    const saved = localStorage.getItem(CLOUD_URL_KEY);
    if (saved) return saved.trim();

    // หากเปิดผ่านเซิร์ฟเวอร์ (http/https) ให้เชื่อมต่อกับ /api ของโฮสต์อัตโนมัติ
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.protocol.startsWith('http')) {
      return `${window.location.origin}/api`;
    }
    return '';
  }

  function setApiUrl(url) {
    if (typeof url === 'string') {
      localStorage.setItem(CLOUD_URL_KEY, url.trim());
    }
  }

  function _loadJobs() {
    let jobs = [];
    try {
      jobs = JSON.parse(localStorage.getItem(JOBS_REGISTRY_KEY) || '[]');
    } catch (e) {
      jobs = [];
    }

    // Auto-discover jobs ที่มีการส่งยอดไว้ใน localStorage แต่ยังไม่ได้ลงทะเบียนใน Registry (กรณีส่งจาก Local Session เดิม)
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(MOCK_STORAGE_PREFIX)) {
          const code = key.replace(MOCK_STORAGE_PREFIX, '').trim().toUpperCase();
          if (code && !jobs.some(j => (j.jobCode || j.code) === code)) {
            const submissions = JSON.parse(localStorage.getItem(key) || '[]');
            const totalUnits = submissions.reduce((sum, sub) => {
              return sum + (sub.logs || []).reduce((subSum, item) => subSum + (Number(item.qty) || 0), 0);
            }, 0);
            const firstSub = submissions[0] || {};
            jobs.push({
              code,
              jobCode: code,
              title: code,
              creator: firstSub.staffName || 'ผู้ช่วยนับ',
              createdBy: firstSub.staffName || 'ผู้ช่วยนับ',
              createdAt: Date.now(),
              status: 'OPEN',
              contributorsCount: submissions.length,
              totalUnits
            });
          }
        }
      }
    } catch (err) {
      console.warn('Error auto-discovering jobs from localStorage:', err);
    }

    return jobs;
  }

  function _saveJobs(jobs) {
    localStorage.setItem(JOBS_REGISTRY_KEY, JSON.stringify(jobs));
  }

  /**
   * ดึงรายการงาน Cloud ทั้งหมด (OPEN ขึ้นก่อน ตามด้วยเวลาล่าสุด)
   * @returns {Promise<Array>}
   */
  async function getActiveJobs() {
    const apiUrl = getApiUrl();
    const isOnline = !('onLine' in navigator) || navigator.onLine;

    if (apiUrl && isOnline) {
      try {
        const url = new URL(apiUrl, (typeof window !== 'undefined' && window.location) ? window.location.href : 'http://localhost:3000');
        url.searchParams.set('action', 'getJobs');
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data) ? data : []);
          if (list.length > 0) {
            _saveJobs(list);
          }
          return list;
        }
      } catch (err) {
        console.warn('API getActiveJobs error, fallback to local store:', err);
      }
    }

    // Local / Simulation Registry
    const jobs = _loadJobs();
    const normalized = jobs.map(j => ({
      ...j,
      code: j.jobCode || j.code,
      jobCode: j.jobCode || j.code,
      creator: j.createdBy || j.creator,
      createdBy: j.createdBy || j.creator
    }));
    return normalized.sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (a.status !== 'OPEN' && b.status === 'OPEN') return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /**
   * คนแรกสร้างรอบงานกลางใหม่ (บังคับตั้งชื่อ เช่น COUNT-01)
   * @param {string} jobCode รหัสงาน เช่น COUNT-01
   * @param {string} creatorName ชื่อผู้เปิดงาน
   */
  async function createActiveJob(jobCode, creatorName) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    if (!trimmedCode) throw new Error('กรุณาระบุรหัสงาน (Job Code)');

    const creator = creatorName || StorageManager.getUsername() || 'หัวหน้างาน';
    const now = Date.now();

    const newJob = {
      code: trimmedCode,
      jobCode: trimmedCode,
      title: trimmedCode,
      creator,
      createdBy: creator,
      createdAt: now,
      status: 'OPEN',
      contributorsCount: 0,
      totalUnits: 0
    };

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'createJob', ...newJob })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.warn('API createJob error, saving locally:', err);
      }
    }

    // Save to Local Registry
    const jobs = _loadJobs();
    const existingIdx = jobs.findIndex(j => j.jobCode === trimmedCode);
    if (existingIdx >= 0) {
      jobs[existingIdx].status = 'OPEN';
      jobs[existingIdx].createdBy = creator;
    } else {
      jobs.unshift(newJob);
    }
    _saveJobs(jobs);

    return newJob;
  }

  /**
   * ส่งยอดหรืออัปเดตยอดของพนักงานเข้าสู่ Job
   * @param {string} jobCode รหัสงาน
   * @param {string} staffName ชื่อผู้ช่วยนับ
   * @param {Array} logs รายการนับของคนนี้
   * @param {string} [sessionName] ชื่อ Session ของเครื่องนี้ (optional)
   */
  async function submitLogsToJob(jobCode, staffName, logs, sessionName = null) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    if (!trimmedCode) throw new Error('กรุณาระบุรหัสงาน (Job Code)');

    const staff = (staffName || StorageManager.getUsername() || 'ผู้ช่วยนับ').trim();
    const logList = Array.isArray(logs) ? logs : [];

    // ตรวจสอบสถานะ Job (หากปิดรอบแล้ว ยังคงอนุญาตให้ซิงค์ยอดตามหลังได้)
    const jobs = _loadJobs();
    let job = jobs.find(j => (j.jobCode || j.code) === trimmedCode);
    const isClosed = job && job.status === 'CLOSED';

    // ถ้ารอบงานนี้ยังไม่เคยถูกสร้าง (เช่น ผู้ใช้เริ่มจาก Local Session แล้วกดส่งออกขึ้น Cloud เป็นคนแรก)
    // ให้ลงทะเบียนรอบงานกลางอัตโนมัติทันที เพื่อให้แสดงบนหน้า Home ของทุกคน
    if (!job) {
      job = {
        code: trimmedCode,
        jobCode: trimmedCode,
        title: trimmedCode,
        creator: staff,
        createdBy: staff,
        createdAt: Date.now(),
        status: 'OPEN',
        contributorsCount: 0,
        totalUnits: 0
      };
      jobs.push(job);
    }

    const currentSessionName = sessionName || (StorageManager.getActiveSession() || {}).name || '';

    const cleanLogs = logList.map((l, idx) => ({
      no: idx + 1,
      barcode: l.barcode,
      qty: Number(l.qty) || 0,
      time: l.updatedAt ? new Date(l.updatedAt).toLocaleTimeString('th-TH') : (l.time || '')
    }));

    const payload = {
      jobCode: trimmedCode,
      staffName: staff,
      sessionName: currentSessionName,
      submittedAt: new Date().toISOString(),
      logs: cleanLogs,
      totalUnits: cleanLogs.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      uniqueSkus: new Set(cleanLogs.map(item => item.barcode)).size
    };

    // 1. บันทึกเข้า Submissions ของ Job นี้ในเครื่องก่อนเสมอ (Offline-First)
    const key = MOCK_STORAGE_PREFIX + trimmedCode;
    const submissions = JSON.parse(localStorage.getItem(key) || '[]');
    const existingIdx = submissions.findIndex(s => s.staffName === staff);
    if (existingIdx >= 0) {
      submissions[existingIdx] = payload;
    } else {
      submissions.push(payload);
    }
    localStorage.setItem(key, JSON.stringify(submissions));

    // อัปเดตสถิติใน Jobs Registry บนเครื่อง
    const totalUnits = submissions.reduce((sum, sub) => {
      return sum + (sub.logs || []).reduce((subSum, item) => subSum + (Number(item.qty) || 0), 0);
    }, 0);

    job.contributorsCount = submissions.length;
    job.totalUnits = totalUnits;
    _saveJobs(jobs);

    // 2. หากออนไลน์ ให้ซิงค์ขึ้น Cloud เพื่อบันทึกเป็น ./data/{job-id}/db.json
    let syncedToCloud = false;
    let cloudError = null;
    let syncStatusText = 'บันทึกในเครื่อง (ออฟไลน์)';
    const apiUrl = getApiUrl();
    const isOnline = !('onLine' in navigator) || navigator.onLine;

    if (!isOnline) {
      cloudError = 'อุปกรณ์ออฟไลน์ (ไม่มีการเชื่อมต่ออินเทอร์เน็ต)';
      syncStatusText = 'บันทึกในเครื่องแล้ว (รอสัญญาณเน็ตเพื่อส่งขึ้น Cloud)';
    } else if (apiUrl) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submitLogs', ...payload })
        });
        if (res.ok) {
          syncedToCloud = true;
          syncStatusText = `ซิงค์เข้า Cloud (./data/${trimmedCode}/db.json) เรียบร้อย`;
        } else {
          cloudError = `เซิร์ฟเวอร์ตอบกลับรหัส ${res.status}`;
          syncStatusText = `บันทึกในเครื่องแล้ว (${cloudError})`;
        }
      } catch (err) {
        cloudError = err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
        syncStatusText = 'บันทึกในเครื่องแล้ว (เชื่อมต่อ Cloud ไม่สำเร็จ)';
      }
    } else {
      cloudError = 'ไม่ได้กำหนด Cloud API URL';
      syncStatusText = 'บันทึกในเครื่องแล้ว (Local Mode)';
    }

    const lateNotice = isClosed ? ' (ซิงค์ตามหลังรอบงานที่ปิดแล้ว)' : '';
    return {
      success: true,
      savedLocally: true,
      syncedToCloud,
      cloudError,
      isOnline,
      message: syncedToCloud
        ? `ส่งยอด ${logList.length} รายการเข้าสู่ Job "${trimmedCode}" สำเร็จ${lateNotice}`
        : `บันทึกยอด ${logList.length} รายการในเครื่องเรียบร้อยแล้ว (ยังไม่ได้ส่งขึ้น Cloud เนื่องจากออฟไลน์)`,
      totalUnits: job.totalUnits,
      job,
      isLate: isClosed,
      submission: {
        staffName: staff,
        uniqueSkus: new Set(logList.map(l => l.barcode)).size,
        totalUnits: logList.reduce((s, l) => s + (Number(l.qty) || 0), 0)
      }
    };
  }

  /**
   * ดึงรายการส่งงานทั้งหมดตาม Job Code
   */
  async function fetchSubmissions(jobCode) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    if (!trimmedCode) return [];

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        const url = new URL(apiUrl, (typeof window !== 'undefined' && window.location) ? window.location.href : 'http://localhost:3000');
        url.searchParams.set('action', 'fetchSubmissions');
        url.searchParams.set('jobCode', trimmedCode);
        const res = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const json = await res.json();
          const subs = Array.isArray(json.submissions) ? json.submissions : (Array.isArray(json) ? json : []);
          if (subs.length > 0) {
            // sync to mock storage as cache
            const key = MOCK_STORAGE_PREFIX + trimmedCode;
            localStorage.setItem(key, JSON.stringify(subs));
          }
          return subs;
        }
      } catch (err) {
        console.warn('API fetchSubmissions error:', err);
      }
    }

    const key = MOCK_STORAGE_PREFIX + trimmedCode;
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  /**
   * สรุปผลงานรวมทั้ง Job (คำนวณรวมสินค้าซ้ำ และยอดแยกตามรายชื่อพนักงาน)
   * @param {string} jobCode รหัสงาน
   */
  async function getJobSummary(jobCode) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    const submissions = await fetchSubmissions(trimmedCode);
    const jobs = _loadJobs();
    const foundJob = jobs.find(j => (j.jobCode || j.code) === trimmedCode);
    const job = {
      code: trimmedCode,
      jobCode: trimmedCode,
      creator: (foundJob && (foundJob.createdBy || foundJob.creator)) || 'ไม่ระบุ',
      createdBy: (foundJob && (foundJob.createdBy || foundJob.creator)) || 'ไม่ระบุ',
      createdAt: (foundJob && foundJob.createdAt) || Date.now(),
      status: (foundJob && foundJob.status) || 'OPEN'
    };

    // แปลง submissions ให้เข้ากับ MergeManager พร้อมคำนวณยอดรวมรายบุคคลให้ถูกต้องเสมอ
    const enrichedSubmissions = submissions.map(sub => {
      const logs = Array.isArray(sub.logs) ? sub.logs : [];
      const totalUnits = logs.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      const uniqueSkus = new Set(logs.map(item => item.barcode)).size;
      
      // รวมยอดสินค้าเฉพาะของคนนี้ (รายบาร์โค้ด)
      const staffItemsMap = new Map();
      logs.forEach(l => {
        if (!l || !l.barcode) return;
        const b = String(l.barcode).trim();
        const q = Number(l.qty) || 0;
        staffItemsMap.set(b, (staffItemsMap.get(b) || 0) + q);
      });
      const staffItems = Array.from(staffItemsMap.entries()).map(([barcode, qty]) => ({ barcode, qty }));

      return {
        ...sub,
        staffName: sub.staffName || 'ผู้ช่วยนับ',
        totalUnits: sub.totalUnits !== undefined && sub.totalUnits > 0 ? sub.totalUnits : totalUnits,
        uniqueSkus: sub.uniqueSkus !== undefined && sub.uniqueSkus > 0 ? sub.uniqueSkus : uniqueSkus,
        items: staffItems
      };
    });

    const sources = enrichedSubmissions.map(sub => ({
      name: sub.staffName,
      logs: sub.logs || []
    }));

    const computed = MergeManager.computeMerge(sources, `[สรุปยอด Job] ${trimmedCode}`);

    return {
      job,
      submissions: enrichedSubmissions,
      stats: {
        contributorsCount: enrichedSubmissions.length,
        uniqueBarcodes: computed.uniqueSkus || 0,
        totalUnits: computed.totalUnits || 0,
        overlapCount: computed.overlapCount || 0
      },
      mergedItems: (computed.summaryList || []).map(item => ({
        barcode: item.barcode,
        qty: item.totalQty,
        contributors: item.sources || [],
        rounds: item.rounds || 0
      })),
      computed
    };
  }

  /**
   * ปิดรอบงาน (Close Job) - ล็อกไม่ให้ส่งยอดเพิ่ม และสรุปรายงานขั้นสุดท้าย
   * @param {string} jobCode รหัสงาน
   * @param {string} closedByName ชื่อผู้สั่งปิดงาน
   */
  async function closeJob(jobCode, closedByName) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    const closer = closedByName || StorageManager.getUsername() || 'หัวหน้างาน';
    const jobs = _loadJobs();
    let target = jobs.find(j => (j.jobCode || j.code) === trimmedCode);
    if (!target) {
      target = {
        code: trimmedCode,
        jobCode: trimmedCode,
        title: trimmedCode,
        creator: closer,
        createdBy: closer,
        createdAt: Date.now(),
        status: 'CLOSED',
        closedBy: closer,
        closedAt: Date.now()
      };
      jobs.push(target);
    } else {
      target.code = trimmedCode;
      target.jobCode = trimmedCode;
      target.status = 'CLOSED';
      target.closedAt = Date.now();
      target.closedBy = closer;
    }
    _saveJobs(jobs);

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'closeJob', jobCode: trimmedCode, closedBy: closer })
        });
      } catch (e) {
        console.warn('API closeJob error:', e);
      }
    }

    return target;
  }

  /**
   * นำรอบงานที่ปิดแล้วกลับมาเปิดใหม่ (Reopen Job)
   * @param {string} jobCode รหัสงาน
   */
  async function reopenJob(jobCode) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    const jobs = _loadJobs();
    let target = jobs.find(j => (j.jobCode || j.code) === trimmedCode);
    if (target) {
      target.status = 'OPEN';
      target.reopenedAt = Date.now();
      delete target.closedAt;
      delete target.closedBy;
      _saveJobs(jobs);
    }

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reopenJob', jobCode: trimmedCode })
        });
      } catch (e) {
        console.warn('API reopenJob error:', e);
      }
    }

    return target;
  }

  /**
   * ลบรอบงานทิ้ง (Delete Job)
   * @param {string} jobCode รหัสงาน
   */
  async function deleteJob(jobCode) {
    const trimmedCode = (jobCode || '').trim().toUpperCase();
    
    // ลบออกจาก local registry
    const jobs = _loadJobs().filter(j => (j.jobCode || j.code) !== trimmedCode);
    _saveJobs(jobs);

    // ลบ submissions ใน localStorage
    try {
      localStorage.removeItem(MOCK_STORAGE_PREFIX + trimmedCode);
    } catch (e) {}

    const apiUrl = getApiUrl();
    if (apiUrl) {
      try {
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteJob', jobCode: trimmedCode })
        });
      } catch (e) {
        console.warn('API deleteJob error:', e);
      }
    }

    return true;
  }

  /**
   * ดึงเฉพาะรายการงานที่ปิดแล้ว (Closed Jobs)
   */
  async function getClosedJobs() {
    const allJobs = await getActiveJobs();
    return allJobs.filter(j => j.status === 'CLOSED');
  }

  return {
    getApiUrl,
    setApiUrl,
    getActiveJobs,
    getClosedJobs,
    createActiveJob,
    submitLogsToJob,
    submitJob: (jobCode, staff, session, logs) => submitLogsToJob(jobCode, staff, logs, session ? session.name : null),
    fetchSubmissions,
    getJobSummary,
    closeJob,
    reopenJob,
    deleteJob
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CloudSync;
}
