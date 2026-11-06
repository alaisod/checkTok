/**
 * Multi-User Session Merge Manager Module
 * Computes, aggregates, and merges inventory sessions from multiple staff devices (Offline & Cloud)
 */
const MergeManager = (() => {
  /**
   * อ่านไฟล์ JSON หลายไฟล์แบบอะซิงโครนัส
   * @param {FileList|File[]} files 
   * @returns {Promise<Array<{ filename: string, data: object }>>}
   */
  async function readJsonFiles(files) {
    const fileList = Array.from(files);
    const readPromises = fileList.map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = JSON.parse(e.target.result);
            resolve({
              filename: file.name,
              data: parsed
            });
          } catch (err) {
            reject(new Error(`ไฟล์ "${file.name}" ไม่ใช่ JSON ที่ถูกต้อง: ${err.message}`));
          }
        };
        reader.onerror = () => reject(new Error(`เกิดข้อผิดพลาดในการอ่านไฟล์ "${file.name}"`));
        reader.readAsText(file);
      });
    });

    return Promise.all(readPromises);
  }

  /**
   * ตรวจสอบโครงสร้างไฟล์ว่าเข้ากันได้กับ checkTok หรือไม่
   * @param {object} data 
   * @returns {boolean}
   */
  function isValidStockData(data) {
    if (!data || typeof data !== 'object') return false;
    // รูปแบบ session.json ของแอป
    if (Array.isArray(data.logs)) return true;
    if (data.session && Array.isArray(data.logs)) return true;
    return false;
  }

  /**
   * คำนวณและประมวลผลรวมยอดบาร์โค้ดจากหลายแหล่งข้อมูล (Pre-merge computation)
   * @param {Array<{ name: string, logs: Array }>} sourcesList 
   * @param {string} customMasterName 
   */
  function computeMerge(sourcesList, customMasterName = '') {
    const mergedMap = new Map();
    const sourceSummaries = [];
    const combinedFlatLogs = [];
    let grandTotalUnits = 0;

    sourcesList.forEach((src, srcIdx) => {
      const sourceName = src.name || `ผู้ช่วยนับคนที่ ${srcIdx + 1}`;
      let srcUnits = 0;
      const logs = Array.isArray(src.logs) ? src.logs : [];

      logs.forEach(log => {
        const code = String(log.barcode || '').trim();
        if (!code) return;
        const qty = Number(log.qty) || 0;
        srcUnits += qty;
        grandTotalUnits += qty;

        if (!mergedMap.has(code)) {
          mergedMap.set(code, {
            barcode: code,
            totalQty: 0,
            rounds: 0,
            sources: [] // เก็บประวัติแต่ละแหล่งข้อมูล
          });
        }

        const item = mergedMap.get(code);
        item.totalQty += qty;
        item.rounds += 1;
        item.sources.push({
          source: sourceName,
          qty: qty,
          time: log.time || log.updatedAt || new Date().toISOString()
        });

        combinedFlatLogs.push({
          barcode: code,
          qty: qty,
          source: sourceName,
          time: log.time || log.updatedAt || new Date().toISOString()
        });
      });

      sourceSummaries.push({
        name: sourceName,
        skuCount: logs.length,
        totalUnits: srcUnits
      });
    });

    const summaryList = Array.from(mergedMap.values());
    const overlapCount = summaryList.filter(item => {
      // นับว่ามีบาร์โค้ดนี้มาจากมากกว่า 1 แหล่งข้อมูลหรือไม่
      const uniqueSources = new Set(item.sources.map(s => s.source));
      return uniqueSources.size > 1;
    }).length;

    const defaultName = customMasterName.trim() || `[รวมสต๊อก] ${sourcesList.length} แหล่ง (${new Date().toLocaleDateString('th-TH')})`;

    return {
      masterSessionName: defaultName,
      sourcesCount: sourcesList.length,
      sourcesSummaries: sourceSummaries,
      uniqueSkus: summaryList.length,
      totalUnits: grandTotalUnits,
      overlapCount: overlapCount,
      summaryList: summaryList,
      combinedFlatLogs: combinedFlatLogs
    };
  }

  /**
   * ยืนยันการรวมข้อมูล: สร้าง Master Session ใหม่ใน StorageManager
   * @param {object} computedResult ผลลัพธ์จาก computeMerge
   * @returns {object} Session ที่สร้างขึ้นใหม่
   */
  function commitMerge(computedResult) {
    if (!computedResult || !computedResult.summaryList || computedResult.summaryList.length === 0) {
      throw new Error('ไม่มีข้อมูลรายการสินค้าที่จะรวม');
    }

    // 1. สร้าง Session รอบใหม่สำหรับ Master
    const newSession = StorageManager.createSession(computedResult.masterSessionName);

    // 2. ดึง Logs เก่าทั้งหมดใน storage แล้ว append logs รวมของ session นี้
    // บันทึกรายการแบบสรุปยอดต่อบาร์โค้ดเพื่อให้นับง่าย
    const allLogs = JSON.parse(localStorage.getItem('stock_checker_logs') || '[]');
    const now = Date.now();

    computedResult.summaryList.forEach((item, idx) => {
      allLogs.unshift({
        id: 'log_m_' + now + '_' + idx + '_' + Math.random().toString(36).substr(2, 4),
        sessionId: newSession.id,
        barcode: item.barcode,
        qty: item.totalQty,
        createdAt: now - (idx * 100),
        updatedAt: now - (idx * 100)
      });
    });

    localStorage.setItem('stock_checker_logs', JSON.stringify(allLogs));
    StorageManager.setActiveSessionId(newSession.id);

    return newSession;
  }

  /**
   * ดึงข้อมูล Session ปัจจุบันของเครื่อง Master ออกมาเป็น Source Object
   */
  function getLocalMasterSource() {
    const active = StorageManager.getActiveSession();
    if (!active) return null;
    const logs = StorageManager.getLogs(active.id);
    const username = StorageManager.getUsername() || 'หัวหน้างาน';
    return {
      name: `เครื่อง Master (${username}) - ${active.name}`,
      session: active,
      logs: logs.map(l => ({
        barcode: l.barcode,
        qty: l.qty,
        time: l.updatedAt ? new Date(l.updatedAt).toLocaleTimeString('th-TH') : ''
      }))
    };
  }

  return {
    readJsonFiles,
    isValidStockData,
    computeMerge,
    commitMerge,
    getLocalMasterSource
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MergeManager;
}
