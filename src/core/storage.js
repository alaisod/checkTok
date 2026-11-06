/**
 * Storage Manager Module
 * Manages Sessions, Logs, Auto-Save & JSON Backup/Restore
 */
const StorageManager = (() => {
  const SESSIONS_KEY = 'stock_checker_sessions';
  const LOGS_KEY = 'stock_checker_logs';
  const ACTIVE_SESSION_KEY = 'stock_checker_active_session_id';
  const USERNAME_KEY = 'stock_checker_username';

  function _load(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Failed to load ${key}:`, e);
      return fallback;
    }
  }

  function _save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast('พื้นที่จัดเก็บบนอุปกรณ์เต็ม กรุณาลบข้อมูลที่ไม่จำเป็น', 'error');
      } else {
        alert('พื้นที่จัดเก็บบนอุปกรณ์เต็ม กรุณาลบข้อมูลที่ไม่จำเป็น');
      }
    }
  }

  return {
    getUsername() {
      const name = localStorage.getItem(USERNAME_KEY);
      return name ? name.trim() : '';
    },

    setUsername(name) {
      if (typeof name === 'string') {
        localStorage.setItem(USERNAME_KEY, name.trim());
      }
    },

    getSessions() {
      return _load(SESSIONS_KEY, []);
    },

    getActiveSessionId() {
      let activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
      const sessions = this.getSessions();
      if (!activeId || !sessions.some(s => s.id === activeId)) {
        if (sessions.length > 0) {
          activeId = sessions[0].id;
          localStorage.setItem(ACTIVE_SESSION_KEY, activeId);
        } else {
          // สร้าง Session เริ่มต้นให้อัตโนมัติถ้ายังไม่มี
          const defaultSession = this.createSession('ตรวจนับสินค้า - เริ่มต้น');
          return defaultSession.id;
        }
      }
      return activeId;
    },

    getActiveSession() {
      const activeId = this.getActiveSessionId();
      const sessions = this.getSessions();
      return sessions.find(s => s.id === activeId) || null;
    },

    setActiveSessionId(id) {
      localStorage.setItem(ACTIVE_SESSION_KEY, id);
    },

    createSession(name, jobCode = null) {
      const sessions = this.getSessions();
      const newSession = {
        id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: name.trim() || 'Session ' + new Date().toLocaleDateString('th-TH'),
        jobCode: jobCode ? String(jobCode).trim().toUpperCase() : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      sessions.unshift(newSession);
      _save(SESSIONS_KEY, sessions);
      this.setActiveSessionId(newSession.id);
      return newSession;
    },

    setSessionJobCode(sessionId, jobCode) {
      const sessions = this.getSessions();
      const s = sessions.find(item => item.id === sessionId);
      if (s) {
        s.jobCode = jobCode ? String(jobCode).trim().toUpperCase() : null;
        s.updatedAt = Date.now();
        _save(SESSIONS_KEY, sessions);
      }
    },

    updateSessionName(id, newName) {
      const sessions = this.getSessions();
      const target = sessions.find(s => s.id === id);
      if (target) {
        target.name = newName.trim();
        target.updatedAt = Date.now();
        _save(SESSIONS_KEY, sessions);
      }
    },

    deleteSession(id) {
      let sessions = this.getSessions();
      sessions = sessions.filter(s => s.id !== id);
      _save(SESSIONS_KEY, sessions);

      // ลบ Logs ของ session นั้นด้วย
      let logs = _load(LOGS_KEY, []);
      logs = logs.filter(l => l.sessionId !== id);
      _save(LOGS_KEY, logs);

      if (localStorage.getItem(ACTIVE_SESSION_KEY) === id) {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    },

    getLogs(sessionId) {
      const allLogs = _load(LOGS_KEY, []);
      // กรองเฉพาะ session นี้ และเรียงจากล่าสุดไปเก่า (Desc by createdAt/updatedAt)
      return allLogs.filter(l => l.sessionId === sessionId);
    },

    /**
     * กฎข้อที่ 2 และ 3:
     * - สินค้า barcode เดียวกัน ยิงต่อเนื่อง ให้ +qty (อัปเดตแถวล่าสุด)
     * - สินค้า barcode เดียวกัน แต่ไม่ต่อเนื่อง เช่น A->B->C->A จะไม่ +qty เดิม แต่จะขึ้นรายการแถวใหม่
     */
    addScan(sessionId, barcode) {
      const trimmedBarcode = barcode.trim();
      if (!trimmedBarcode) return null;

      let allLogs = _load(LOGS_KEY, []);
      const sessionLogs = allLogs.filter(l => l.sessionId === sessionId);
      const lastItem = sessionLogs.length > 0 ? sessionLogs[0] : null;

      let resultItem = null;
      let isConsecutive = false;

      if (lastItem && lastItem.barcode === trimmedBarcode) {
        // บาร์โค้ดเดียวกันยิงต่อเนื่อง -> +qty
        lastItem.qty += 1;
        lastItem.updatedAt = Date.now();
        resultItem = lastItem;
        isConsecutive = true;
      } else {
        // บาร์โค้ดไม่ตรงกับอันล่าสุด -> สร้างแถวใหม่ใน logs
        resultItem = {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sessionId: sessionId,
          barcode: trimmedBarcode,
          qty: 1,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        // ใส่ไว้หน้าสุดของ allLogs (หรือหน้าสุดของ session)
        allLogs.unshift(resultItem);
        isConsecutive = false;
      }

      _save(LOGS_KEY, allLogs);

      // อัปเดต updatedAt ของ Session
      const sessions = this.getSessions();
      const s = sessions.find(item => item.id === sessionId);
      if (s) {
        s.updatedAt = Date.now();
        _save(SESSIONS_KEY, sessions);
      }

      return { isConsecutive, item: resultItem };
    },

    updateLastItemQty(sessionId, newQty) {
      let allLogs = _load(LOGS_KEY, []);
      const index = allLogs.findIndex(l => l.sessionId === sessionId);
      if (index !== -1) {
        if (newQty <= 0) {
          allLogs.splice(index, 1); // ถ้าแก้เป็น 0 หรือติดลบ ให้ลบแถวออก
        } else {
          allLogs[index].qty = Math.floor(newQty);
          allLogs[index].updatedAt = Date.now();
        }
        _save(LOGS_KEY, allLogs);
        return allLogs[index] || null;
      }
      return null;
    },

    deleteLastItem(sessionId) {
      let allLogs = _load(LOGS_KEY, []);
      const index = allLogs.findIndex(l => l.sessionId === sessionId);
      if (index !== -1) {
        const deleted = allLogs.splice(index, 1)[0];
        _save(LOGS_KEY, allLogs);
        return deleted;
      }
      return null;
    },

    deleteLog(logId) {
      let allLogs = _load(LOGS_KEY, []);
      const index = allLogs.findIndex(l => l.id === logId);
      if (index !== -1) {
        const deleted = allLogs.splice(index, 1)[0];
        _save(LOGS_KEY, allLogs);
        return deleted;
      }
      return null;
    },

    // เตรียมก้อนข้อมูลสำหรับ Backup เป็นไฟล์ .json โดย logs[] เหลือเฉพาะ { no, barcode, qty, time }
    exportSessionBackup(sessionId) {
      const session = this.getSessions().find(s => s.id === sessionId);
      if (!session) return null;
      const logs = this.getLogs(sessionId);

      // เรียงจากลำดับแรกที่ยิง -> ล่าสุด (Chronological ASC: 1 -> N)
      const chronologicalLogs = [...logs].reverse();
      const simplifiedLogs = chronologicalLogs.map((log, idx) => {
        const d = new Date(log.updatedAt || log.createdAt || Date.now());
        const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

        return {
          no: idx + 1,
          barcode: String(log.barcode),
          qty: Number(log.qty),
          time: timeStr
        };
      });

      return {
        app: 'checkTok',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        session: session,
        logs: simplifiedLogs
      };
    },

    // โหลดข้อมูลจากไฟล์ .json เข้ามาในระบบ (รองรับทั้งแบบ { no, barcode, qty, time } และโครงสร้างเดิม)
    importSessionBackup(data) {
      if (!data || !data.session || !Array.isArray(data.logs)) {
        throw new Error('รูปแบบไฟล์ Backup ไม่ถูกต้อง');
      }

      let sessions = this.getSessions();
      let allLogs = _load(LOGS_KEY, []);

      // สร้าง ID ใหม่เพื่อป้องกันการชนกับของเดิม
      const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const importedSession = {
        ...data.session,
        id: newSessionId,
        name: data.session.name + ' (นำเข้า)',
        updatedAt: Date.now()
      };

      // logs ในระบบภายในเก็บแบบล่าสุดอยู่บน (Desc)
      // หากไฟล์ backup เรียง 1 -> N ให้กลับด้านเพื่อให้ลำดับในระบบถูกต้อง
      const rawLogs = [...data.logs];
      if (rawLogs.length > 1 && rawLogs[0].no === 1) {
        rawLogs.reverse();
      }

      const importedLogs = rawLogs.map(log => {
        let timestamp = Date.now();
        if (log.time) {
          const parsed = new Date(log.time).getTime();
          if (!isNaN(parsed)) timestamp = parsed;
        } else if (log.updatedAt || log.createdAt) {
          timestamp = log.updatedAt || log.createdAt;
        }

        return {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          sessionId: newSessionId,
          barcode: String(log.barcode || ''),
          qty: Number(log.qty) || 1,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      });

      sessions.unshift(importedSession);
      allLogs = [...importedLogs, ...allLogs];

      _save(SESSIONS_KEY, sessions);
      _save(LOGS_KEY, allLogs);
      this.setActiveSessionId(newSessionId);

      return importedSession;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
