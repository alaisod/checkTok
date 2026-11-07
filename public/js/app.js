/**
 * Main Application Controller for checkTok SPA
 * Flow handling, UI Rendering, Virtual Numpad, and Hot Refresh
 */

// ==========================================
// Defensive SoundManager Polyfill
// ป้องกันข้อผิดพลาดกรณีเครื่อง Client ยังแคช sound.js ตัวเก่าไว้ใน Service Worker / Safari
// ==========================================
(function ensureSoundManager() {
  if (typeof window === 'undefined') return;
  window.SoundManager = window.SoundManager || {};
  const sm = window.SoundManager;
  const noop = () => {};

  if (typeof sm.playSuccess !== 'function') sm.playSuccess = noop;
  if (typeof sm.playEdit !== 'function') sm.playEdit = noop;
  if (typeof sm.playWarning !== 'function') sm.playWarning = noop;

  if (typeof sm.playBeepError !== 'function') {
    sm.playBeepError = function() {
      try {
        if (typeof sm.playWarning === 'function' && sm.playWarning !== noop) {
          sm.playWarning();
        } else if (navigator.vibrate) {
          navigator.vibrate([100, 60, 120]);
        }
      } catch (_) {}
    };
  }
  if (typeof sm.playError !== 'function') sm.playError = sm.playBeepError;
  if (typeof sm.playbeepError !== 'function') sm.playbeepError = sm.playBeepError;
})();

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const sessionTitleEl = document.getElementById('sessionTitle');
  const onlineStatusEl = document.getElementById('onlineStatus');
  const lastItemStatusText = document.getElementById('lastItemStatusText');
  const barcodeForm = document.getElementById('barcodeForm');
  const barcodeInput = document.getElementById('barcodeInput');
  const logsTableBody = document.getElementById('logsTableBody');
  const emptyLogsEl = document.getElementById('emptyLogs');

  // Modals
  const numpadModal = document.getElementById('numpadModal');
  const numpadBarcodeLabel = document.getElementById('numpadBarcodeLabel');
  const numpadDisplayVal = document.getElementById('numpadDisplayVal');
  const numpadGrid = document.getElementById('numpadGrid');
  const btnNumpadSave = document.getElementById('btnNumpadSave');
  const btnNumpadCancel = document.getElementById('btnNumpadCancel');
  const btnNumpadDeleteRow = document.getElementById('btnNumpadDeleteRow');

  const summaryModal = document.getElementById('summaryModal');
  const exportModal = document.getElementById('exportModal');
  const sessionModal = document.getElementById('sessionModal');

  // Home View & Navigation Elements
  const homeView = document.getElementById('homeView');
  const scannerView = document.getElementById('scannerView');
  const btnHomeUserBadge = document.getElementById('btnHomeUserBadge');
  const homeUserNameLabel = document.getElementById('homeUserNameLabel');
  const btnHomeThemeToggle = document.getElementById('btnHomeThemeToggle');
  const homeActiveJobHero = document.getElementById('homeActiveJobHero');
  const btnHomeStartNewJob = document.getElementById('btnHomeStartNewJob');
  const btnHomeStartNewJobText = document.getElementById('btnHomeStartNewJobText');
  const btnHomeMergeSessions = document.getElementById('btnHomeMergeSessions');
  const btnMenuOpenMerge = document.getElementById('btnMenuOpenMerge');
  const homeRecentThreeList = document.getElementById('homeRecentThreeList');
  const homeSessionCountBadge = document.getElementById('homeSessionCountBadge');
  const btnBackToHome = document.getElementById('btnBackToHome');
  const sessionCloudBadge = document.getElementById('sessionCloudBadge');
  const btnQuickSyncCloud = document.getElementById('btnQuickSyncCloud');

  // Modal: Create Cloud Job
  const modalCreateCloudJob = document.getElementById('modalCreateCloudJob');
  const createCloudJobForm = document.getElementById('createCloudJobForm');
  const inputCreateJobCode = document.getElementById('inputCreateJobCode');
  const inputCreateJobCreator = document.getElementById('inputCreateJobCreator');
  const createJobErrorMsg = document.getElementById('createJobErrorMsg');
  const btnCancelCreateCloudJob = document.getElementById('btnCancelCreateCloudJob');

  // Modal: Job Summary & Close Job
  const modalJobSummary = document.getElementById('modalJobSummary');
  const jobSummaryModalTitle = document.getElementById('jobSummaryModalTitle');
  const jobSummaryModalSub = document.getElementById('jobSummaryModalSub');
  const jobStatContributors = document.getElementById('jobStatContributors');
  const jobStatSkus = document.getElementById('jobStatSkus');
  const jobStatTotalUnits = document.getElementById('jobStatTotalUnits');
  const jobStatStatusBadge = document.getElementById('jobStatStatusBadge');
  const jobContributorsList = document.getElementById('jobContributorsList');
  const jobItemsTableBody = document.getElementById('jobItemsTableBody');
  const btnCloseJobSummary = document.getElementById('btnCloseJobSummary');
  const btnExportJobReportPdf = document.getElementById('btnExportJobReportPdf');
  const btnCloseActiveJob = document.getElementById('btnCloseActiveJob');
  const btnReopenJob = document.getElementById('btnReopenJob');
  const btnDeleteJob = document.getElementById('btnDeleteJob');

  // Closed Jobs Archive Elements
  const btnHomeClosedJobs = document.getElementById('btnHomeClosedJobs');
  const homeClosedJobsCount = document.getElementById('homeClosedJobsCount');
  const btnMenuClosedJobs = document.getElementById('btnMenuClosedJobs');
  const modalClosedJobsArchive = document.getElementById('modalClosedJobsArchive');
  const btnCloseClosedJobsArchive = document.getElementById('btnCloseClosedJobsArchive');
  const archiveClosedJobsBadge = document.getElementById('archiveClosedJobsBadge');
  const closedJobsListContainer = document.getElementById('closedJobsListContainer');

  let currentActiveSummaryJobCode = null;
  let currentActiveSummaryData = null;

  // Enforced User Modal Elements
  const modalUserName = document.getElementById('modalUserName');
  const userNameForm = document.getElementById('userNameForm');
  const inputUserName = document.getElementById('inputUserName');
  const userNameErrorMsg = document.getElementById('userNameErrorMsg');
  const btnSaveUserName = document.getElementById('btnSaveUserName');
  const btnCancelUserName = document.getElementById('btnCancelUserName');

  // Hot Refresh Elements
  const hotRefreshToast = document.getElementById('hotRefreshToast');
  const btnHotRefresh = document.getElementById('btnHotRefresh');

  let currentNumpadValue = '';
  let currentOriginalQty = 0;
  let waitingWorker = null;
  let pendingActionAfterUserName = null;

  // ==========================================
  // Modern Toast & Custom Dialog System (Tosh)
  // ==========================================
  const toastContainer = document.getElementById('toastContainer');
  const modalConfirmDialog = document.getElementById('modalConfirmDialog');
  const confirmIconWrap = document.getElementById('confirmIconWrap');
  const confirmDialogTitle = document.getElementById('confirmDialogTitle');
  const confirmDialogMessage = document.getElementById('confirmDialogMessage');
  const btnConfirmCancel = document.getElementById('btnConfirmCancel');
  const btnConfirmOk = document.getElementById('btnConfirmOk');

  let activeConfirmResolver = null;

  function showToast(message, type = 'info', title = null, duration = 3000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;

    let iconSvg = '';
    let defaultTitle = '';
    if (type === 'success') {
      defaultTitle = title || 'สำเร็จ';
      iconSvg = `
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      `;
    } else if (type === 'error') {
      defaultTitle = title || 'ข้อผิดพลาด';
      iconSvg = `
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
    } else if (type === 'warning') {
      defaultTitle = title || 'แจ้งเตือน';
      iconSvg = `
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      `;
    } else {
      defaultTitle = title || 'ข้อมูล';
      iconSvg = `
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      `;
    }

    toast.innerHTML = `
      <div class="toast-icon-circle">${iconSvg}</div>
      <div class="toast-body">
        <div class="toast-title">${escapeHtml(defaultTitle)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
      </div>
      <button class="toast-close-btn" aria-label="ปิด">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    const dismiss = () => {
      toast.classList.add('toast-hide');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    };

    toast.addEventListener('click', dismiss);
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });

    toastContainer.appendChild(toast);
    setTimeout(dismiss, duration);
  }

  function showConfirm({ title = 'ยืนยันการดำเนินการ', message = '', confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', isDanger = false }) {
    return new Promise((resolve) => {
      if (!modalConfirmDialog) {
        resolve(confirm(message));
        return;
      }

      if (confirmDialogTitle) confirmDialogTitle.textContent = title;
      if (confirmDialogMessage) confirmDialogMessage.textContent = message;
      if (btnConfirmOk) {
        btnConfirmOk.textContent = confirmText;
        if (isDanger) {
          btnConfirmOk.classList.add('danger');
        } else {
          btnConfirmOk.classList.remove('danger');
        }
      }
      if (btnConfirmCancel) {
        btnConfirmCancel.textContent = cancelText;
      }

      if (confirmIconWrap) {
        if (isDanger) {
          confirmIconWrap.className = 'confirm-icon-circle danger';
          confirmIconWrap.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28" height="28">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          `;
        } else {
          confirmIconWrap.className = 'confirm-icon-circle warning';
          confirmIconWrap.innerHTML = `
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="28" height="28">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          `;
        }
      }

      activeConfirmResolver = resolve;
      modalConfirmDialog.classList.add('open');
    });
  }

  function closeConfirmDialog(result) {
    if (modalConfirmDialog) modalConfirmDialog.classList.remove('open');
    if (typeof activeConfirmResolver === 'function') {
      const cb = activeConfirmResolver;
      activeConfirmResolver = null;
      cb(result);
    }
    keepFocus();
  }

  if (btnConfirmOk) {
    btnConfirmOk.addEventListener('click', () => closeConfirmDialog(true));
  }
  if (btnConfirmCancel) {
    btnConfirmCancel.addEventListener('click', () => closeConfirmDialog(false));
  }
  if (modalConfirmDialog) {
    modalConfirmDialog.addEventListener('click', (e) => {
      if (e.target === modalConfirmDialog) closeConfirmDialog(false);
    });
  }

  // Globally expose
  window.showToast = showToast;
  window.showConfirm = showConfirm;

  // ==========================================
  // 0. Clean Theme Management (Light / Dark)
  // ==========================================
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const metaThemeColor = document.getElementById('metaThemeColor');
  const initialTheme = localStorage.getItem('stock_checker_theme') || 'light';
  applyTheme(initialTheme);

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#141417' : '#ffffff');
    }
    const themeSvgSun = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    `;
    const themeSvgMoon = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="20" height="20">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    `;

    [btnThemeToggle, btnHomeThemeToggle].forEach((btn) => {
      if (!btn) return;
      if (theme === 'dark') {
        btn.innerHTML = themeSvgSun;
        btn.title = 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)';
      } else {
        btn.innerHTML = themeSvgMoon;
        btn.title = 'เปลี่ยนเป็นโหมดมืด (Dark Mode)';
      }
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('stock_checker_theme', nextTheme);
    applyTheme(nextTheme);
  }

  if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);
  if (btnHomeThemeToggle) btnHomeThemeToggle.addEventListener('click', toggleTheme);

  // ==========================================
  // Dynamic App Version Sync (ดึงจาก server/version.json โดยตรง ไม่ hardcode)
  // ==========================================
  const homeVersionTag = document.getElementById('homeVersionTag') || document.querySelector('.home-version-tag');
  const VERSION_STORAGE_KEY = 'checktok_app_version';

  function applyVersionDisplay(ver) {
    if (!homeVersionTag || !ver) return;
    homeVersionTag.textContent = `ver. ${ver}`;
  }

  async function syncAppVersion() {
    // 1. นำเวอร์ชันที่เคยแคชไว้มาแสดงผลทันที (Instant render & Offline 100%)
    const cached = localStorage.getItem(VERSION_STORAGE_KEY);
    if (cached) {
      applyVersionDisplay(cached);
    }

    // 2. ดึงเวอร์ชันล่าสุดจริงจากระบบ (Direct API / version.json)
    try {
      let fetchedVersion = null;

      // ลองดึงจาก /api/version ก่อน
      try {
        const apiRes = await fetch('/api/version', { cache: 'no-cache' });
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data && data.version) fetchedVersion = data.version;
        }
      } catch (_) {}

      // ถ้าไม่สำเร็จ ลองดึงจาก version.json (กรณี Static / Cache Fallback)
      if (!fetchedVersion) {
        try {
          const jsonRes = await fetch('./version.json', { cache: 'no-cache' });
          if (jsonRes.ok) {
            const data = await jsonRes.json();
            if (data && data.version) fetchedVersion = data.version;
          }
        } catch (_) {}
      }

      if (fetchedVersion) {
        applyVersionDisplay(fetchedVersion);
        localStorage.setItem(VERSION_STORAGE_KEY, fetchedVersion);
      }
    } catch (err) {
      console.warn('Unable to sync dynamic version:', err);
    }
  }

  // ซิงค์เวอร์ชันทันทีเมื่อเริ่มต้นแอป
  syncAppVersion();

  // ==========================================
  // 1. Service Worker & Hot Refresh Setup (Supported on http/https only)
  // ==========================================
  const isHttpProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if ('serviceWorker' in navigator && isHttpProtocol) {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      // ตรวจสอบเมื่อมีการอัปเดต Service Worker
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // ตรวจพบโค้ดเวอร์ชันใหม่
              waitingWorker = newWorker;
              if (hotRefreshToast) hotRefreshToast.classList.add('show');
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('SW registration error:', err);
    });

    // รับสัญญาณเมื่อ Controller เปลี่ยนแปลง
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // ตรวจสอบอัปเดตเพิ่มเติมเมื่อสลับแท็บกลับมา
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        syncAppVersion();
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update();
        });
      }
    });
  }

  if (btnHotRefresh) {
    btnHotRefresh.addEventListener('click', () => {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  }

  // ==========================================
  // 2. Online / Offline Status
  // ==========================================
  let lastOnlineState = navigator.onLine;
  function updateOnlineStatus(notify = false) {
    const isOnline = navigator.onLine;
    if (onlineStatusEl) {
      if (isOnline) {
        onlineStatusEl.classList.remove('offline');
        onlineStatusEl.title = 'ออนไลน์ (เชื่อมต่อเน็ต)';
      } else {
        onlineStatusEl.classList.add('offline');
        onlineStatusEl.title = 'ออฟไลน์ 100% (ใช้งานได้ตามปกติในเครื่อง)';
      }
    }

    if (notify && isOnline !== lastOnlineState) {
      if (isOnline) {
        showToast('🌐 สัญญาณเน็ตกลับมาแล้ว (ออนไลน์ พร้อมซิงค์ Cloud)', 'info');
      } else {
        showToast('📡 อุปกรณ์ออฟไลน์ (ใช้งานนับสินค้าในเครื่องได้ปกติ 100%)', 'warning');
      }
      lastOnlineState = isOnline;
    }
  }
  window.addEventListener('online', () => {
    updateOnlineStatus(true);
    syncAppVersion();
  });
  window.addEventListener('offline', () => updateOnlineStatus(true));
  updateOnlineStatus(false);

  // ==========================================
  // 3. User Identity & View Navigation Helpers
  // ==========================================
  function updateUserNameUI() {
    const currentName = StorageManager.getUsername();
    if (homeUserNameLabel) {
      homeUserNameLabel.textContent = currentName || 'ยังไม่ระบุชื่อ';
    }
  }

  function openUserNameModal(isEnforced = true) {
    if (!modalUserName) return;
    if (userNameErrorMsg) userNameErrorMsg.style.display = 'none';
    if (inputUserName) {
      inputUserName.value = StorageManager.getUsername();
      inputUserName.classList.remove('has-error');
    }
    if (btnCancelUserName) {
      btnCancelUserName.style.display = isEnforced ? 'none' : 'block';
    }
    modalUserName.classList.add('open');
    setTimeout(() => {
      if (inputUserName) inputUserName.focus();
    }, 120);
  }

  function closeUserNameModal() {
    if (modalUserName) {
      modalUserName.classList.remove('open');
    }
  }

  function ensureUserIdentity(callback) {
    const currentName = StorageManager.getUsername();
    if (currentName) {
      if (typeof callback === 'function') callback();
      return;
    }
    pendingActionAfterUserName = callback;
    openUserNameModal(true); // บังคับให้ตั้งชื่อ ไม่แสดงปุ่มยกเลิก
  }

  function showHomeView() {
    if (scannerView) scannerView.style.display = 'none';
    if (homeView) homeView.style.display = 'flex';
    updateUserNameUI();
    renderHomeSessions();
    loadActiveCloudJobs();
  }

  function showScannerView(sessionId) {
    if (sessionId) {
      StorageManager.setActiveSessionId(sessionId);
    }
    if (homeView) homeView.style.display = 'none';
    if (scannerView) scannerView.style.display = 'flex';
    render();
    setTimeout(keepFocus, 100);
  }

  async function loadActiveCloudJobs() {
    if (!homeActiveJobHero) return;

    try {
      const jobs = await CloudSync.getActiveJobs();
      const activeJob = jobs.find(j => j.status === 'OPEN');
      const closedJobs = jobs.filter(j => j.status === 'CLOSED');

      // อัปเดตตัวนับงานที่ปิดแล้วบนหน้าแรก
      if (homeClosedJobsCount) {
        homeClosedJobsCount.textContent = closedJobs.length;
      }
      if (btnHomeClosedJobs) {
        btnHomeClosedJobs.style.display = closedJobs.length > 0 ? 'inline-block' : 'none';
      }

      if (activeJob) {
        homeActiveJobHero.style.display = 'block';
        homeActiveJobHero.innerHTML = `
          <div class="active-job-spotlight">
            <div class="spotlight-top">
              <div class="spotlight-badge">
                <span class="live-dot-pulse"></span>
                <span>รอบงานกลางที่กำลังนับ (ACTIVE JOB)</span>
              </div>
              <span class="spotlight-code">${escapeHtml(activeJob.code)}</span>
            </div>
            <div class="spotlight-meta">
              <span>ผู้เปิดรอบ: <b>${escapeHtml(activeJob.creator || 'ไม่ระบุ')}</b></span>
              <span>•</span>
              <span>ส่งยอดแล้ว <b>${activeJob.contributorsCount || 0}</b> คน</span>
              <span>•</span>
              <span>รวม <b class="spotlight-units">${(activeJob.totalUnits || 0).toLocaleString()}</b> ชิ้น</span>
            </div>
            <button id="btnHeroJoinJob" class="btn-hero-join">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="22" height="22">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>🚀 เข้าร่วมนับรอบ ${escapeHtml(activeJob.code)}</span>
            </button>
            <button id="btnHeroSummaryJob" class="btn-hero-summary-link">
              📊 ดูสรุปยอดรวมทั้งร้าน / ปิดรอบงาน (สำหรับหัวหน้า)
            </button>
          </div>
        `;

        const btnHeroJoin = document.getElementById('btnHeroJoinJob');
        if (btnHeroJoin) {
          btnHeroJoin.addEventListener('click', () => {
            ensureUserIdentity(() => {
              joinCloudJob(activeJob.code);
            });
          });
        }

        const btnHeroSummary = document.getElementById('btnHeroSummaryJob');
        if (btnHeroSummary) {
          btnHeroSummary.addEventListener('click', () => {
            openJobSummaryModal(activeJob.code);
          });
        }

        // ปรับปุ่มสร้างงานใหม่ให้เป็นปุ่มรอง
        if (btnHomeStartNewJob) {
          btnHomeStartNewJob.className = 'btn-unified-start secondary-subtle';
        }
        if (btnHomeStartNewJobText) {
          btnHomeStartNewJobText.textContent = '+ เปิดรอบงานอื่น / สร้างรอบใหม่';
        }
      } else {
        // ไม่มีรอบงานที่กำลังเปิดอยู่
        homeActiveJobHero.innerHTML = '';
        homeActiveJobHero.style.display = 'none';

        if (btnHomeStartNewJob) {
          btnHomeStartNewJob.className = 'btn-unified-start primary-hero';
        }
        if (btnHomeStartNewJobText) {
          btnHomeStartNewJobText.textContent = '🚀 + เปิดรอบนับสต๊อกใหม่';
        }
      }
    } catch (err) {
      console.warn('Error loading active jobs:', err);
    }
  }

  function joinCloudJob(jobCode) {
    const normCode = String(jobCode).trim().toUpperCase();
    const sessions = StorageManager.getSessions();
    const existing = sessions.find((s) => s.jobCode === normCode);

    if (existing) {
      // มีรอบที่ผูกกับ Job นี้ในเครื่องแล้ว -> เปิดตารางนับเดิมของเครื่องนี้ต่อได้ทันที
      showScannerView(existing.id);
      SoundManager.playSuccess();
      return;
    }

    // กรณีเข้าร่วมใหม่: ไม่เอารายการสินค้าของคนอื่นมาเด็ดขาด!
    // เอามาแค่ชื่อ Job แล้วเริ่มตารางนับว่างเปล่าของตัวเอง
    const staff = StorageManager.getUsername() || 'Staff';
    const newSession = StorageManager.createSession(`${normCode} (${staff})`, normCode);
    showScannerView(newSession.id);
    SoundManager.playSuccess();
  }

  async function openCreateCloudJobModal() {
    if (!modalCreateCloudJob) return;
    if (inputCreateJobCreator) {
      inputCreateJobCreator.value = StorageManager.getUsername() || '';
    }
    if (inputCreateJobCode) {
      try {
        const activeJobs = await CloudSync.getActiveJobs();
        const nextNum = (activeJobs ? activeJobs.length : 0) + 1;
        inputCreateJobCode.value = `COUNT-0${nextNum}`;
      } catch (e) {
        inputCreateJobCode.value = 'COUNT-01';
      }
    }
    if (createJobErrorMsg) {
      createJobErrorMsg.style.display = 'none';
    }
    modalCreateCloudJob.classList.add('open');
    setTimeout(() => {
      if (inputCreateJobCode) {
        inputCreateJobCode.focus();
        inputCreateJobCode.select();
      }
    }, 100);
  }

  function closeCreateCloudJobModal() {
    if (modalCreateCloudJob) {
      modalCreateCloudJob.classList.remove('open');
    }
  }

  async function openJobSummaryModal(jobCode) {
    if (!modalJobSummary) return;
    currentActiveSummaryJobCode = jobCode;

    try {
      const summary = await CloudSync.getJobSummary(jobCode);
      currentActiveSummaryData = summary;

      if (jobSummaryModalTitle) {
        jobSummaryModalTitle.textContent = `สรุปผลงาน: ${summary.job.code}`;
      }
      if (jobSummaryModalSub) {
        jobSummaryModalSub.textContent = `เปิดโดย: ${summary.job.creator || 'ไม่ระบุ'} • สร้างเมื่อ ${new Date(summary.job.createdAt).toLocaleString('th-TH')}`;
      }
      if (jobStatContributors) {
        jobStatContributors.textContent = summary.stats.contributorsCount;
      }
      if (jobStatSkus) {
        jobStatSkus.textContent = summary.stats.uniqueBarcodes;
      }
      if (jobStatTotalUnits) {
        jobStatTotalUnits.textContent = summary.stats.totalUnits.toLocaleString();
      }

      const isClosed = summary.job.status === 'CLOSED';
      if (jobStatStatusBadge) {
        if (isClosed) {
          jobStatStatusBadge.textContent = '🔒 CLOSED';
          jobStatStatusBadge.style.color = '#dc2626';
        } else {
          jobStatStatusBadge.textContent = '🟢 OPEN';
          jobStatStatusBadge.style.color = '#15803d';
        }
      }

      // สถานะปุ่มการดำเนินการ (ปิดงาน / เปิดใหม่ / ลบ)
      if (btnCloseActiveJob) {
        btnCloseActiveJob.style.display = isClosed ? 'none' : 'block';
        btnCloseActiveJob.disabled = false;
        btnCloseActiveJob.style.opacity = '1';
        btnCloseActiveJob.textContent = '🔒 ปิดรอบงานนี้ (Close Job)';
      }
      if (btnReopenJob) {
        btnReopenJob.style.display = isClosed ? 'block' : 'none';
      }
      if (btnDeleteJob) {
        btnDeleteJob.style.display = isClosed ? 'block' : 'none';
      }

      // ตัวแปรสำหรับฟิลเตอร์ตารางตามผู้ช่วยนับ
      let selectedStaffName = null;

      // ฟังก์ชันเรนเดอร์ตารางสินค้า (รองรับฟิลเตอร์ตามผู้ช่วยนับ)
      function renderJobItemsTable(filterStaff = null) {
        if (!jobItemsTableBody) return;
        jobItemsTableBody.innerHTML = '';

        let itemsToRender = [];
        if (filterStaff) {
          // ดึงรายการเฉพาะของผู้ช่วยนับคนนี้
          const sub = (summary.submissions || []).find(s => s.staffName === filterStaff);
          if (sub && Array.isArray(sub.items) && sub.items.length > 0) {
            itemsToRender = sub.items.map(it => ({
              barcode: it.barcode,
              qty: it.qty,
              contributors: [filterStaff]
            }));
          } else if (sub && Array.isArray(sub.logs) && sub.logs.length > 0) {
            const staffMap = new Map();
            sub.logs.forEach(l => {
              if (!l || !l.barcode) return;
              const b = String(l.barcode).trim();
              const q = Number(l.qty) || 0;
              staffMap.set(b, (staffMap.get(b) || 0) + q);
            });
            itemsToRender = Array.from(staffMap.entries()).map(([barcode, qty]) => ({
              barcode,
              qty,
              contributors: [filterStaff]
            }));
          } else {
            itemsToRender = (summary.mergedItems || []).filter(item => 
              item.contributors && item.contributors.includes(filterStaff)
            );
          }
        } else {
          itemsToRender = summary.mergedItems || [];
        }

        // อัปเดตแถบหัวตารางฟิลเตอร์
        const filterHeader = document.getElementById('tableFilterHeader');
        const filterLabel = document.getElementById('tableFilterLabel');
        const activeFilterBadge = document.getElementById('activeFilterBadge');

        if (filterHeader && filterLabel) {
          if (filterStaff) {
            filterHeader.style.display = 'flex';
            const totalUnits = itemsToRender.reduce((s, it) => s + (Number(it.qty) || 0), 0);
            filterLabel.innerHTML = `👤 รายการของ: <strong>${escapeHtml(filterStaff)}</strong> (${itemsToRender.length} SKU, ${totalUnits.toLocaleString()} ชิ้น)`;
            if (activeFilterBadge) activeFilterBadge.textContent = `(กำลังกรอง: ${filterStaff})`;
          } else {
            filterHeader.style.display = 'none';
            if (activeFilterBadge) activeFilterBadge.textContent = `(แตะที่ชื่อเพื่อกรองรายการ)`;
          }
        }

        if (itemsToRender.length === 0) {
          jobItemsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">${filterStaff ? 'ไม่พบรายการที่ผู้ช่วยนับคนนี้นับ' : 'ยังไม่มีข้อมูลสินค้าที่นับ'}</td></tr>`;
        } else {
          itemsToRender.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td style="text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>
              <td style="font-family: monospace; font-weight: 600;">${escapeHtml(row.barcode)}</td>
              <td style="text-align: right; font-weight: 700; color: var(--primary);">${(row.qty || 0).toLocaleString()}</td>
              <td style="font-size: 11px; color: var(--text-muted);">${escapeHtml(row.contributors ? row.contributors.join(', ') : '-')}</td>
            `;
            jobItemsTableBody.appendChild(tr);
          });
        }
      }

      // ฟังก์ชันเรนเดอร์รายชื่อผู้ช่วยนับ
      function renderContributorsList() {
        if (!jobContributorsList) return;
        jobContributorsList.innerHTML = '';

        if (!summary.submissions || summary.submissions.length === 0) {
          jobContributorsList.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 8px; text-align: center; background: var(--bg-surface-subtle); border-radius: var(--radius-sm);">ยังไม่มีผู้ส่งยอดในรอบงานนี้</div>`;
          return;
        }

        summary.submissions.forEach((sub) => {
          const isSelected = selectedStaffName === sub.staffName;
          const item = document.createElement('div');
          item.className = `contributor-card ${isSelected ? 'active' : ''}`;
          item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: ${isSelected ? 'var(--primary-light)' : 'var(--bg-surface-subtle)'};
            border: 1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'};
            border-radius: var(--radius-sm);
            font-size: 12.5px;
            cursor: pointer;
            transition: all 0.15s ease;
          `;
          item.title = isSelected ? 'แตะซ้ำเพื่อยกเลิกการกรอง (ดูทั้งหมด)' : 'แตะเพื่อกรองดูเฉพาะรายการที่คนนี้นับ';

          const timeText = sub.submittedAt ? new Date(sub.submittedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
          const subTotalUnits = Number(sub.totalUnits) || (sub.logs || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
          const subUniqueSkus = Number(sub.uniqueSkus) || new Set((sub.logs || []).map(l => l.barcode)).size;

          item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">${isSelected ? '👉' : '👤'}</span>
              <div>
                <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(sub.staffName)}</span>
                ${timeText ? `<span style="color: var(--text-muted); font-size: 10.5px; margin-left: 4px;">(${timeText})</span>` : ''}
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-weight: 700; color: var(--primary); font-size: 13px;">${subTotalUnits.toLocaleString()} ชิ้น</span>
              <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${subUniqueSkus} SKU)</span>
            </div>
          `;

          item.addEventListener('click', () => {
            if (selectedStaffName === sub.staffName) {
              selectedStaffName = null; // แตะซ้ำเพื่อยกเลิก
            } else {
              selectedStaffName = sub.staffName;
            }
            renderContributorsList();
            renderJobItemsTable(selectedStaffName);
          });

          jobContributorsList.appendChild(item);
        });
      }

      // ปุ่มรีเซ็ตการกรองกลับเป็นทั้งหมด
      const btnResetTableFilter = document.getElementById('btnResetTableFilter');
      if (btnResetTableFilter) {
        btnResetTableFilter.onclick = () => {
          selectedStaffName = null;
          renderContributorsList();
          renderJobItemsTable(null);
        };
      }

      // เรนเดอร์เริ่มต้น
      renderContributorsList();
      renderJobItemsTable(null);

      modalJobSummary.classList.add('open');
    } catch (err) {
      showToast('ไม่สามารถดึงข้อมูลสรุป Job ได้: ' + err.message, 'error');
    }
  }

  function closeJobSummaryModal() {
    if (modalJobSummary) {
      modalJobSummary.classList.remove('open');
    }
  }

  function renderHomeSessions() {
    const container = homeRecentThreeList || homeSessionList;
    if (!container) return;
    const sessions = StorageManager.getSessions();
    const activeId = StorageManager.getActiveSessionId();

    if (homeSessionCountBadge) {
      homeSessionCountBadge.textContent = `${sessions.length} งาน`;
    }

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 16px 12px;">
          <p class="empty-title" style="font-size: 13px;">ยังไม่มีงานเก่า</p>
          <p class="empty-desc" style="font-size: 11px;">กดปุ่ม "+ สร้าง Session ใหม่" ด้านบนเพื่อเริ่มงาน</p>
        </div>
      `;
      return;
    }

    // งานเก่า 3 อันล่าสุดตามแบบร่างสเก็ตช์
    const latestThree = sessions.slice(0, 3);
    container.innerHTML = '';

    latestThree.forEach((sess) => {
      const logs = StorageManager.getLogs(sess.id);
      const totalUnits = logs.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
      const isSelected = sess.id === activeId;

      const itemCard = document.createElement('div');
      itemCard.className = `recent-item-card ${isSelected ? 'selected' : ''}`;
      itemCard.innerHTML = `
        <div class="recent-item-left">
          <span class="recent-radio-dot"></span>
          <span class="recent-item-name" title="${escapeHtml(sess.name)}">${escapeHtml(sess.name)}</span>
        </div>
        <div class="recent-item-right">
          <span class="recent-badge-qty">${totalUnits.toLocaleString()} ชิ้น</span>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="14" height="14" style="color: var(--text-faint);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      `;

      // แตะเพื่อเข้าสู่หน้านับทันที
      itemCard.addEventListener('click', () => {
        ensureUserIdentity(() => {
          showScannerView(sess.id);
          SoundManager.playSuccess();
        });
      });

      container.appendChild(itemCard);
    });
  }

  // Event Listeners for Home Screen Actions
  if (btnHomeStartNewJob) {
    btnHomeStartNewJob.addEventListener('click', () => {
      ensureUserIdentity(() => {
        openCreateCloudJobModal();
      });
    });
  }

  if (btnHomeUserBadge) {
    btnHomeUserBadge.addEventListener('click', () => {
      openUserNameModal(false); // อนุญาตให้กดยกเลิกได้
    });
  }

  if (btnBackToHome) {
    btnBackToHome.addEventListener('click', () => {
      showHomeView();
    });
  }

  [btnHomeMergeSessions, btnMenuOpenMerge].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => {
        ensureUserIdentity(() => {
          if (sessionModal) sessionModal.classList.remove('open');
          openMergeModal();
        });
      });
    }
  });

  // ==========================================
  // Cloud Job Coordination Event Listeners
  // ==========================================

  if (btnCancelCreateCloudJob) {
    btnCancelCreateCloudJob.addEventListener('click', closeCreateCloudJobModal);
  }

  if (createCloudJobForm) {
    createCloudJobForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = (inputCreateJobCode ? inputCreateJobCode.value : '').trim().toUpperCase();
      const creator = (inputCreateJobCreator ? inputCreateJobCreator.value : '').trim();

      if (!code) {
        if (createJobErrorMsg) {
          createJobErrorMsg.textContent = 'กรุณาระบุรหัสงาน (เช่น COUNT-01)';
          createJobErrorMsg.style.display = 'block';
        }
        if (inputCreateJobCode) inputCreateJobCode.focus();
        return;
      }

      try {
        if (creator) {
          StorageManager.setUsername(creator);
          updateUserNameUI();
        }
        await CloudSync.createActiveJob(code, creator);
        closeCreateCloudJobModal();
        SoundManager.playSuccess();
        // เข้าร่วมและเริ่มหน้านับทันที
        joinCloudJob(code);
      } catch (err) {
        showToast('ไม่สามารถเปิดรอบงานกลางได้: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  if (btnQuickSyncCloud) {
    btnQuickSyncCloud.addEventListener('click', async () => {
      const active = StorageManager.getActiveSession();
      if (!active) return;

      if (!active.jobCode) {
        // ถ้ารอบนี้ยังไม่ได้ผูกกับ Job กลาง ให้เปิดหน้าต่างระบุ Job Code เพื่อส่งและผูกรอบทันที
        openCloudSubmitModal();
        return;
      }

      const staff = StorageManager.getUsername();
      if (!staff) {
        openUserNameModal(true);
        return;
      }

      const logs = StorageManager.getLogs(active.id);
      btnQuickSyncCloud.disabled = true;
      const originalContent = btnQuickSyncCloud.innerHTML;
      btnQuickSyncCloud.innerHTML = `<span>⏳ กำลังส่ง...</span>`;

      try {
        const res = await CloudSync.submitLogsToJob(active.jobCode, staff, logs);
        if (res.syncedToCloud) {
          try { SoundManager.playSuccess(); } catch (_) {}
          const lateText = res.isLate ? ' (ซิงค์ตามหลังรอบงานที่ปิดแล้ว)' : '';
          showToast(`☁️ ส่งยอดเข้า Job "${active.jobCode}" สำเร็จ!${lateText}\nยอดนับ: ${res.submission.totalUnits.toLocaleString()} ชิ้น (${res.submission.uniqueSkus} SKU)`, 'success');
        } else {
          try { SoundManager.playBeepError(); } catch (_) {}
          showToast(`⚠️ ขณะนี้ออฟไลน์ (ยังไม่ได้ส่งขึ้น Cloud)!\nข้อมูลบันทึกในเครื่องแล้ว (${res.submission.totalUnits.toLocaleString()} ชิ้น)\n👉 เมื่อเชื่อมต่ออินเทอร์เน็ตแล้ว กรุณากด "ส่งยอด" อีกครั้งเพื่อซิงค์ขึ้น Cloud`, 'warning');
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการส่งยอด: ' + err.message, 'error');
        try { SoundManager.playBeepError(); } catch (_) {}
      } finally {
        btnQuickSyncCloud.disabled = false;
        btnQuickSyncCloud.innerHTML = originalContent;
      }
    });
  }

  if (btnCloseJobSummary) {
    btnCloseJobSummary.addEventListener('click', closeJobSummaryModal);
  }

  if (btnCloseActiveJob) {
    btnCloseActiveJob.addEventListener('click', async () => {
      if (!currentActiveSummaryJobCode) return;
      const isConfirm = await showConfirm({
        title: 'ปิดรอบงานกลาง',
        message: `ยืนยันการปิดรอบงาน "${currentActiveSummaryJobCode}" หรือไม่?\n(หากปิดแล้ว สมาชิกที่นับค้างอยู่ยังสามารถซิงค์ยอดตามหลังได้ และคุณสามารถกลับมาเปิดรอบใหม่หรือลบทิ้งได้ทุกเมื่อ)`,
        confirmText: '🔒 ปิดรอบงานนี้',
        isDanger: true
      });
      if (!isConfirm) return;

      try {
        const closedBy = StorageManager.getUsername() || 'Supervisor';
        await CloudSync.closeJob(currentActiveSummaryJobCode, closedBy);
        SoundManager.playSuccess();
        showToast(`ปิดรอบงาน "${currentActiveSummaryJobCode}" เรียบร้อยแล้ว`, 'success');
        // Reload Summary
        await openJobSummaryModal(currentActiveSummaryJobCode);
        // Reload Home Cloud Jobs
        loadActiveCloudJobs();
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการปิดรอบงาน: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // กลับมาเปิดรอบงานใหม่ (Reopen Job) ในหน้า Summary
  if (btnReopenJob) {
    btnReopenJob.addEventListener('click', async () => {
      if (!currentActiveSummaryJobCode) return;
      const isConfirm = await showConfirm({
        title: 'กลับมาเปิดรอบงานใหม่',
        message: `ต้องการนำรอบงาน "${currentActiveSummaryJobCode}" กลับมาเปิดใหม่ (OPEN) หรือไม่?\nเมื่อเปิดใหม่แล้ว งานนี้จะกลับมาแสดงเป็นรอบงานหลักที่หน้าแรก`,
        confirmText: '🔓 เปิดรอบงานนี้ใหม่'
      });
      if (!isConfirm) return;

      try {
        await CloudSync.reopenJob(currentActiveSummaryJobCode);
        SoundManager.playSuccess();
        showToast(`กลับมาเปิดรอบงาน "${currentActiveSummaryJobCode}" เรียบร้อยแล้ว`, 'success');
        await openJobSummaryModal(currentActiveSummaryJobCode);
        loadActiveCloudJobs();
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเปิดรอบงานใหม่: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // ลบรอบงานทิ้ง (Delete Job) ในหน้า Summary
  if (btnDeleteJob) {
    btnDeleteJob.addEventListener('click', async () => {
      if (!currentActiveSummaryJobCode) return;
      const isConfirm = await showConfirm({
        title: 'ลบรอบงานทิ้งถาวร',
        message: `คุณแน่ใจหรือไม่ว่าต้องการลบรอบงาน "${currentActiveSummaryJobCode}" ทิ้งถาวร?\nข้อมูลสรุป ยอดที่ส่ง และไฟล์ทั้งหมดใน ./data/${currentActiveSummaryJobCode} จะถูกลบและไม่สามารถกู้คืนได้`,
        confirmText: '🗑️ ลบงานนี้ทิ้ง',
        isDanger: true
      });
      if (!isConfirm) return;

      try {
        await CloudSync.deleteJob(currentActiveSummaryJobCode);
        SoundManager.playSuccess();
        showToast(`ลบรอบงาน "${currentActiveSummaryJobCode}" เรียบร้อยแล้ว`, 'success');
        closeJobSummaryModal();
        loadActiveCloudJobs();
        if (modalClosedJobsArchive && modalClosedJobsArchive.classList.contains('open')) {
          renderClosedJobsList();
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการลบ: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // ==========================================
  // Closed Jobs Archive Modal Actions
  // ==========================================
  async function openClosedJobsArchiveModal() {
    if (!modalClosedJobsArchive) return;
    modalClosedJobsArchive.classList.add('open');
    await renderClosedJobsList();
  }

  function closeClosedJobsArchiveModal() {
    if (modalClosedJobsArchive) {
      modalClosedJobsArchive.classList.remove('open');
    }
  }

  async function renderClosedJobsList() {
    if (!closedJobsListContainer) return;
    closedJobsListContainer.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">กำลังโหลดข้อมูล...</div>';

    try {
      const closedJobs = await CloudSync.getClosedJobs();
      if (archiveClosedJobsBadge) {
        archiveClosedJobsBadge.textContent = `${closedJobs.length} รอบ`;
      }
      if (homeClosedJobsCount) {
        homeClosedJobsCount.textContent = closedJobs.length;
      }

      if (closedJobs.length === 0) {
        closedJobsListContainer.innerHTML = `
          <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
            <div style="font-weight: 600;">ไม่มีรอบงานที่ปิดแล้ว</div>
            <div style="font-size: 12px; margin-top: 4px;">เมื่อมีรอบงานที่ปิดแล้วจะแสดงที่นี่</div>
          </div>
        `;
        return;
      }

      closedJobsListContainer.innerHTML = closedJobs.map(job => {
        const closedTimeText = job.closedAt ? new Date(job.closedAt).toLocaleString('th-TH') : (job.updatedAt ? new Date(job.updatedAt).toLocaleString('th-TH') : '-');
        return `
          <div class="closed-job-card" style="background: var(--bg-card, #fff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span style="display: inline-block; font-weight: 700; font-size: 15px; color: var(--text-main);">${escapeHtml(job.code || job.jobCode)}</span>
                <span style="display: inline-block; font-size: 11px; background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 6px;">CLOSED</span>
              </div>
              <span style="font-size: 11px; color: var(--text-muted);">ปิดเมื่อ: ${closedTimeText}</span>
            </div>

            <div style="font-size: 12px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
              <span>👤 ผู้สร้าง: <b>${escapeHtml(job.creator || job.createdBy || 'ไม่ระบุ')}</b></span>
              <span>👥 ส่งยอด: <b>${job.contributorsCount || 0}</b> คน</span>
              <span>📦 รวม: <b style="color: var(--primary); font-size: 13px;">${(job.totalUnits || 0).toLocaleString()}</b> ชิ้น</span>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 4px; padding-top: 8px; border-top: 1px dashed var(--border-color, #e2e8f0);">
              <button class="btn-secondary btn-sm btn-archive-summary" data-code="${escapeHtml(job.code || job.jobCode)}" style="flex: 1; padding: 6px 10px; font-size: 12px;">
                📊 ดูสรุปยอด
              </button>
              <button class="btn-primary btn-sm btn-archive-reopen" data-code="${escapeHtml(job.code || job.jobCode)}" style="flex: 1; padding: 6px 10px; font-size: 12px; background: #0284c7;">
                🔓 เปิดใหม่
              </button>
              <button class="btn-sm btn-archive-delete" data-code="${escapeHtml(job.code || job.jobCode)}" style="padding: 6px 10px; font-size: 12px; background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;" title="ลบรอบงานนี้ทิ้ง">
                🗑️ ลบ
              </button>
            </div>
          </div>
        `;
      }).join('');

      // ผูก Event ให้ปุ่มต่างๆ ในการ์ด
      closedJobsListContainer.querySelectorAll('.btn-archive-summary').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          openJobSummaryModal(code);
        });
      });

      closedJobsListContainer.querySelectorAll('.btn-archive-reopen').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          const isConfirm = await showConfirm({
            title: 'กลับมาเปิดรอบงานใหม่',
            message: `ต้องการนำรอบงาน "${code}" กลับมาเปิดใหม่ (OPEN) หรือไม่?\nเมื่อเปิดใหม่แล้ว งานนี้จะไปแสดงเป็นรอบงานหลักที่หน้าแรก`,
            confirmText: '🔓 เปิดรอบงานนี้ใหม่'
          });
          if (!isConfirm) return;

          try {
            await CloudSync.reopenJob(code);
            SoundManager.playSuccess();
            showToast(`กลับมาเปิดรอบงาน "${code}" เรียบร้อยแล้ว`, 'success');
            await renderClosedJobsList();
            loadActiveCloudJobs();
          } catch (err) {
            showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
            SoundManager.playBeepError();
          }
        });
      });

      closedJobsListContainer.querySelectorAll('.btn-archive-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          const isConfirm = await showConfirm({
            title: 'ลบรอบงานทิ้งถาวร',
            message: `ยืนยันการลบรอบงาน "${code}" หรือไม่?\nไฟล์ข้อมูลทั้งหมดใน ./data/${code} จะถูกลบและไม่สามารถกู้คืนได้`,
            confirmText: '🗑️ ลบงานนี้ทิ้ง',
            isDanger: true
          });
          if (!isConfirm) return;

          try {
            await CloudSync.deleteJob(code);
            SoundManager.playSuccess();
            showToast(`ลบรอบงาน "${code}" เรียบร้อยแล้ว`, 'success');
            await renderClosedJobsList();
            loadActiveCloudJobs();
          } catch (err) {
            showToast('เกิดข้อผิดพลาดในการลบ: ' + err.message, 'error');
            SoundManager.playBeepError();
          }
        });
      });

    } catch (err) {
      closedJobsListContainer.innerHTML = `<div style="text-align: center; color: #dc2626; padding: 20px;">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div>`;
    }
  }

  if (btnHomeClosedJobs) {
    btnHomeClosedJobs.addEventListener('click', openClosedJobsArchiveModal);
  }
  if (btnMenuClosedJobs) {
    btnMenuClosedJobs.addEventListener('click', () => {
      closeSessionModal();
      openClosedJobsArchiveModal();
    });
  }
  if (btnCloseClosedJobsArchive) {
    btnCloseClosedJobsArchive.addEventListener('click', closeClosedJobsArchiveModal);
  }

  if (btnExportJobReportPdf) {
    btnExportJobReportPdf.addEventListener('click', () => {
      if (!currentActiveSummaryData || !currentActiveSummaryData.mergedItems || currentActiveSummaryData.mergedItems.length === 0) {
        showToast('ไม่มีข้อมูลสำหรับสร้างรายงาน PDF', 'warning');
        return;
      }
      const dummySession = {
        name: `สรุปงานกลาง (Job: ${currentActiveSummaryData.job.code})`,
        createdAt: currentActiveSummaryData.job.createdAt
      };
      const dummyLogs = currentActiveSummaryData.mergedItems.map(item => ({
        barcode: item.barcode,
        qty: item.qty,
        updatedAt: Date.now()
      }));
      ExportManager.printReportPDF(dummySession, dummyLogs);
    });
  }

  // Form Submission for User Name
  if (userNameForm) {
    userNameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (inputUserName ? inputUserName.value : '').trim();
      if (!name) {
        if (userNameErrorMsg) userNameErrorMsg.style.display = 'block';
        if (inputUserName) inputUserName.focus();
        SoundManager.playBeepError();
        return;
      }

      StorageManager.setUsername(name);
      updateUserNameUI();
      closeUserNameModal();
      SoundManager.playSuccess();

      if (typeof pendingActionAfterUserName === 'function') {
        const action = pendingActionAfterUserName;
        pendingActionAfterUserName = null;
        action();
      }
    });
  }

  if (btnCancelUserName) {
    btnCancelUserName.addEventListener('click', () => {
      closeUserNameModal();
      pendingActionAfterUserName = null;
    });
  }

  // ==========================================
  // 4. UI Rendering Helpers
  // ==========================================
  function keepFocus() {
    // ให้คอยโฟกัสที่ช่องสแกนเสมอ หากไม่ได้กำลังเปิด Modal หรือหน้าเต็มอยู่
    const isModalOpen = document.querySelector('.modal-overlay.open');
    const isSummaryOpen = summaryModal && summaryModal.classList.contains('open');
    if (!isModalOpen && !isSummaryOpen && barcodeInput) {
      barcodeInput.focus();
    }
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function render() {
    const session = StorageManager.getActiveSession();
    if (!session) return;

    // Header Title
    if (sessionTitleEl) {
      sessionTitleEl.textContent = session.name;
    }

    // Session Cloud Badge & Quick Sync Button
    if (sessionCloudBadge) {
      if (session.jobCode) {
        sessionCloudBadge.textContent = `☁️ ${session.jobCode}`;
        sessionCloudBadge.style.display = 'inline-flex';
      } else {
        sessionCloudBadge.style.display = 'none';
      }
    }
    if (btnQuickSyncCloud) {
      btnQuickSyncCloud.style.display = 'inline-flex';
      const labelSpan = btnQuickSyncCloud.querySelector('span');
      if (session.jobCode) {
        btnQuickSyncCloud.title = `ส่งยอดเข้า Job "${session.jobCode}"`;
        if (labelSpan) labelSpan.textContent = 'ส่งยอด';
      } else {
        btnQuickSyncCloud.title = 'ส่งงานขึ้นระบบ Cloud (ผูกรอบกลาง)';
        if (labelSpan) labelSpan.textContent = 'ส่งขึ้นคลาวด์';
      }
    }

    // Logs Data
    const logs = StorageManager.getLogs(session.id);
    const totalCount = logs.length;

    // Status Banner: แสดงข้อความ last item แบบง่ายๆ สไตล์ Clean
    if (lastItemStatusText) {
      if (totalCount > 0) {
        const latest = logs[0];
        lastItemStatusText.innerHTML = `<span class="accent">${escapeHtml(latest.barcode)}</span> • <span class="qty-badge">${latest.qty} ชิ้น</span>`;
      } else {
        lastItemStatusText.innerHTML = `<span class="accent">-</span> • <span class="qty-badge">0 ชิ้น</span>`;
      }
    }

    // Render Table
    if (logsTableBody) {
      logsTableBody.innerHTML = '';
      if (totalCount === 0) {
        if (emptyLogsEl) emptyLogsEl.classList.remove('hidden');
      } else {
        if (emptyLogsEl) emptyLogsEl.classList.add('hidden');

        logs.forEach((log, index) => {
          const tr = document.createElement('tr');
          const isLatest = index === 0;
          // ลำดับจริง: รายการล่าสุด (บนสุด) คือลำดับที่ totalCount ลงไปถึง 1 (เก่าสุด)
          const actualNo = totalCount - index;

          let rowHighlightClass = '';
          if (isLatest) {
            // สินค้าใหม่ (เพิ่งเริ่มยิงครั้งแรกใน Session นี้ รวมถึงกรณียิงต่อเนื่อง A->A->A): ไฮไลท์สีน้ำเงิน
            // กรณีเป็นสินค้าเก่าที่เคยยิงไปแล้วในรอบก่อนหน้า (กรณี A->B->C->A): ไฮไลท์สีเหลืองอำพัน
            const isSeenInPreviousRows = logs.slice(1).some(l => l.barcode === log.barcode);
            rowHighlightClass = isSeenInPreviousRows ? 'row-latest-repeat' : 'row-latest-new';
          }

          tr.className = `log-row ${rowHighlightClass}`;

          tr.innerHTML = `
            <td colspan="4" class="swipe-cell">
              <div class="swipe-container" data-id="${log.id}">
                <div class="swipe-content">
                  <span class="col-no">${actualNo}</span>
                  <span class="col-item">${escapeHtml(log.barcode)}</span>
                  <span class="col-qty">${log.qty.toLocaleString()}</span>
                  <span class="col-time">${formatTime(log.updatedAt)}</span>
                </div>
                <button class="btn-row-delete" aria-label="ลบรายการ" title="ลบรายการนี้">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>ลบ</span>
                </button>
              </div>
            </td>
          `;

          const container = tr.querySelector('.swipe-container');
          attachSwipeListeners(container, log.id, log.barcode, isLatest);

          logsTableBody.appendChild(tr);
        });
      }
    }

    keepFocus();
  }

  // ระบบปัดซ้ายเพื่อลบแถว (Swipe-to-delete)
  function attachSwipeListeners(container, logId, barcode, isLatest) {
    const content = container.querySelector('.swipe-content');
    const delBtn = container.querySelector('.btn-row-delete');
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    let initialOffset = 0;

    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOk = await showConfirm({
        title: 'ลบรายการสินค้า',
        message: `ต้องการลบรายการบาร์โค้ด "${barcode}" ออกจากรอบนี้ใช่หรือไม่?`,
        confirmText: 'ลบรายการ',
        isDanger: true
      });
      if (isOk) {
        StorageManager.deleteLog(logId);
        SoundManager.playWarning();
        showToast(`ลบรายการ "${barcode}" แล้ว`, 'info');
        render();
      }
    });

    // Touch Support
    content.addEventListener('touchstart', (e) => {
      document.querySelectorAll('.swipe-container.swiped').forEach(el => {
        if (el !== container) el.classList.remove('swiped');
      });

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      initialOffset = container.classList.contains('swiped') ? -72 : 0;
      isSwiping = false;
      content.style.transition = 'none';
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diffX = currentX - startX;
      const diffY = e.touches[0].clientY - startY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 6) {
        isSwiping = true;
        let target = initialOffset + diffX;
        if (target > 0) target = 0;
        if (target < -90) target = -90;
        content.style.transform = `translateX(${target}px)`;
      }
    }, { passive: true });

    content.addEventListener('touchend', () => {
      content.style.transition = '';
      content.style.transform = '';

      if (!isSwiping) {
        if (container.classList.contains('swiped')) {
          container.classList.remove('swiped');
        } else if (isLatest) {
          openNumpadModal();
        }
        return;
      }

      const diffX = currentX - startX;
      if (initialOffset === 0) {
        if (diffX < -32) {
          container.classList.add('swiped');
        } else {
          container.classList.remove('swiped');
        }
      } else {
        if (diffX > 25) {
          container.classList.remove('swiped');
        } else {
          container.classList.add('swiped');
        }
      }
    });

    // Mouse drag support for desktop
    let mouseStartX = 0;
    let isMouseDown = false;
    let mouseMoved = false;

    content.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      document.querySelectorAll('.swipe-container.swiped').forEach(el => {
        if (el !== container) el.classList.remove('swiped');
      });
      mouseStartX = e.clientX;
      isMouseDown = true;
      mouseMoved = false;
      initialOffset = container.classList.contains('swiped') ? -72 : 0;
      content.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const diffX = e.clientX - mouseStartX;
      if (Math.abs(diffX) > 5) {
        mouseMoved = true;
        let target = initialOffset + diffX;
        if (target > 0) target = 0;
        if (target < -90) target = -90;
        content.style.transform = `translateX(${target}px)`;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      content.style.transition = '';
      content.style.transform = '';

      if (!mouseMoved) {
        if (container.classList.contains('swiped')) {
          container.classList.remove('swiped');
        } else if (isLatest && e.target.closest('.swipe-content') === content) {
          openNumpadModal();
        }
        return;
      }

      const diffX = e.clientX - mouseStartX;
      if (initialOffset === 0) {
        if (diffX < -32) {
          container.classList.add('swiped');
        } else {
          container.classList.remove('swiped');
        }
      } else {
        if (diffX > 25) {
          container.classList.remove('swiped');
        } else {
          container.classList.add('swiped');
        }
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==========================================
  // 4. Barcode Character Converter & Scan Submit
  // ==========================================
  const THAI_TO_EN_KEYMAP = {
    // แถวตัวเลข (Unshifted)
    'ๅ': '1', '/': '2', '-': '3', 'ภ': '4', 'ถ': '5',
    'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9', 'จ': '0',
    'ข': '-', 'ช': '=',

    // แถวตัวเลข (Shifted)
    '+': '!', '๑': '@', '๒': '#', '๓': '$', '๔': '%',
    'ู': '^', '฿': '&', '๕': '*', '๖': '(', '๗': ')',
    '๘': '_', '๙': '+',

    // แถว QWERTY (Unshifted)
    'ๆ': 'q', 'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't',
    'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p',
    'บ': '[', 'ล': ']', 'ฃ': '\\',

    // แถว QWERTY (Shifted)
    '๐': 'Q', '"': 'W', 'ฎ': 'E', 'ฑ': 'R', 'ธ': 'T',
    'ํ': 'Y', '๊': 'U', 'ณ': 'I', 'ฯ': 'O', 'ญ': 'P',
    'ฐ': '{', ',': '}', 'ฅ': '|',

    // แถว ASDF (Unshifted)
    'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g',
    '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l', 'ว': ';',
    'ง': "'",

    // แถว ASDF (Shifted)
    'ฤ': 'A', 'ฆ': 'S', 'ฏ': 'D', 'โ': 'F', 'ฌ': 'G',
    '็': 'H', '๋': 'J', 'ษ': 'K', 'ศ': 'L', 'ซ': ':',
    '.': '"',

    // แถว ZXCV (Unshifted)
    'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b',
    'ื': 'n', 'ท': 'm', 'ม': ',', 'ใ': '.', 'ฝ': '/',

    // แถว ZXCV (Shifted)
    '(': 'Z', ')': 'X', 'ฉ': 'C', 'ฮ': 'V', 'ฺ': 'B',
    '์': 'N', '?': 'M', 'ฒ': '<', 'ฬ': '>', 'ฦ': '?'
  };

  // ตัวเลขไทย ๐-๙ กรณีสแกนเนอร์หรืออุปกรณ์ส่งค่าเลขไทย
  const THAI_NUMERALS_MAP = {
    '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
    '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
  };

  function convertThaiKeyboardToEnglish(rawText) {
    if (!rawText) return '';
    // ตรวจสอบว่ามีตัวอักษรไทยหรือไม่ (ช่วง Unicode \u0E00-\u0E7F)
    const hasThaiChar = /[\u0E00-\u0E7F]/.test(rawText);
    if (!hasThaiChar) return rawText;

    return rawText.split('').map(ch => {
      if (THAI_TO_EN_KEYMAP[ch] !== undefined) {
        return THAI_TO_EN_KEYMAP[ch];
      }
      if (THAI_NUMERALS_MAP[ch] !== undefined) {
        return THAI_NUMERALS_MAP[ch];
      }
      return ch;
    }).join('');
  }

  function handleScan(code) {
    // แปลงอักขระภาษาไทยเป็นอังกฤษ/ตัวเลขอัตโนมัติ (กรณีลืมสลับแป้นพิมพ์)
    const convertedCode = convertThaiKeyboardToEnglish(code);
    const barcode = convertedCode.trim();
    if (!barcode) return;

    const session = StorageManager.getActiveSession();
    if (!session) return;

    const result = StorageManager.addScan(session.id, barcode);
    if (result) {
      SoundManager.playSuccess();
      render();
    }

    barcodeInput.value = '';
    keepFocus();
  }

  // แปลงทันทีขณะพิมพ์หรือสแกนเข้าช่องกรอกบาร์โค้ด และตรวจจับปุ่ม Spacebar = Edit
  if (barcodeInput) {
    barcodeInput.addEventListener('keydown', (e) => {
      // ตรวจจับปุ่ม Spacebar = ปุ่ม Edit
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        barcodeInput.value = '';
        openNumpadModal();
      }
    });

    barcodeInput.addEventListener('input', () => {
      const raw = barcodeInput.value;
      const converted = convertThaiKeyboardToEnglish(raw);
      if (raw !== converted) {
        barcodeInput.value = converted;
      }
    });
  }

  // รองรับคีย์บอร์ดจริงเมื่อเปิดหน้าต่าง Numpad Modal
  window.addEventListener('keydown', (e) => {
    if (!numpadModal || !numpadModal.classList.contains('open')) return;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      if (currentNumpadValue === '' || currentNumpadValue === '0') {
        currentNumpadValue = e.key;
      } else if (currentNumpadValue.length < 6) {
        currentNumpadValue += e.key;
      }
      SoundManager.playEdit();
      updateNumpadDisplay();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (currentNumpadValue.length > 0) {
        currentNumpadValue = currentNumpadValue.slice(0, -1);
        SoundManager.playEdit();
        updateNumpadDisplay();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      btnNumpadSave?.click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNumpadModal();
    }
  });

  if (barcodeForm) {
    barcodeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleScan(barcodeInput.value);
    });
  }

  // แตะพื้นหลังเพื่อโฟกัสช่องป้อนบาร์โค้ด
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.modal-overlay') && 
        !e.target.closest('.footer-bar') && 
        !e.target.closest('.app-header') && 
        !e.target.closest('input')) {
      keepFocus();
    }
  });

  // ==========================================
  // 5. Virtual Keyboard (Numpad) Modal for Edit
  // ==========================================
  function openNumpadModal() {
    const session = StorageManager.getActiveSession();
    if (!session) return;

    const logs = StorageManager.getLogs(session.id);
    if (logs.length === 0) {
      SoundManager.playWarning();
      showToast('ยังไม่มีรายการที่สแกน กรุณาสแกนสินค้าก่อนแก้ไข', 'warning');
      return;
    }

    const latest = logs[0];
    numpadBarcodeLabel.textContent = `สินค้า: ${latest.barcode}`;
    currentOriginalQty = latest.qty;
    currentNumpadValue = ''; // ว่างไว้ พร้อมรับค่าเลขใหม่ทันที
    updateNumpadDisplay();

    numpadModal.classList.add('open');
    SoundManager.playEdit();
  }

  function closeNumpadModal() {
    numpadModal.classList.remove('open');
    keepFocus();
  }

  function updateNumpadDisplay() {
    if (currentNumpadValue === '') {
      // แสดงเลขเดิมเป็นตัวจางๆ คล้าย placeholder
      numpadDisplayVal.innerHTML = `<span class="numpad-placeholder">${currentOriginalQty}</span>`;
    } else {
      numpadDisplayVal.textContent = currentNumpadValue;
    }
  }

  if (numpadGrid) {
    numpadGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const num = btn.getAttribute('data-num');
      const action = btn.getAttribute('data-action');

      if (num !== null) {
        // เมื่อกดตัวเลขครั้งแรกแทนที่ค่าว่างทันที ไม่ต้องกดลบตัวเก่า
        if (currentNumpadValue === '' || currentNumpadValue === '0') {
          currentNumpadValue = num;
        } else {
          // จำกัดความยาวไม่เกิน 6 หลัก
          if (currentNumpadValue.length < 6) {
            currentNumpadValue += num;
          }
        }
        SoundManager.playEdit();
      } else if (action === 'del') {
        if (currentNumpadValue.length > 0) {
          currentNumpadValue = currentNumpadValue.slice(0, -1);
          SoundManager.playEdit();
        }
      } else if (action === 'clear') {
        currentNumpadValue = '';
        SoundManager.playEdit();
      } else if (action === 'cancel') {
        closeNumpadModal();
        return;
      }

      updateNumpadDisplay();
    });
  }

  if (btnNumpadSave) {
    btnNumpadSave.addEventListener('click', () => {
      const session = StorageManager.getActiveSession();
      if (!session) return;

      // ถ้าไม่ได้ใส่เลขใหม่ ให้คงค่าเดิมไว้แล้วปิดหน้าต่าง
      if (currentNumpadValue === '') {
        closeNumpadModal();
        return;
      }

      const newQty = parseInt(currentNumpadValue, 10);
      if (isNaN(newQty) || newQty === 0) {
        // หากผู้ใช้ใส่เลข 0 กดบันทึก ค่อยนับว่าเป็นการลบ (มีคอนเฟิร์มก่อนลบจริง)
        showConfirm({
          title: 'จำนวนเป็น 0',
          message: 'จำนวนสินค้าถูกระบุเป็น 0 ต้องการลบรายการนี้ออกใช่หรือไม่?',
          confirmText: 'ลบรายการ',
          isDanger: true
        }).then((isOk) => {
          if (isOk) {
            StorageManager.deleteLastItem(session.id);
            SoundManager.playWarning();
            closeNumpadModal();
            showToast('ลบรายการสินค้าออกแล้ว', 'info');
            render();
          }
        });
        return;
      }

      if (newQty > 0) {
        StorageManager.updateLastItemQty(session.id, newQty);
        SoundManager.playSuccess();
        closeNumpadModal();
        render();
      }
    });
  }

  if (btnNumpadCancel) {
    btnNumpadCancel.addEventListener('click', closeNumpadModal);
  }

  // ปุ่ม Edit ตรงกลาง Footer Bar
  const btnEditLatest = document.getElementById('btnEditLatest');
  if (btnEditLatest) {
    btnEditLatest.addEventListener('click', openNumpadModal);
  }

  // ==========================================
  // 6. Summary Modal (Button 1 ซ้าย - หน้าเต็ม)
  // ==========================================
  const btnOpenSummary = document.getElementById('btnOpenSummary');
  const btnCloseSummaryIcon = document.getElementById('btnCloseSummaryIcon');
  const btnSummaryBack = document.getElementById('btnSummaryBack');
  const btnSummaryExport = document.getElementById('btnSummaryExport');
  const summarySkuCountEl = document.getElementById('summarySkuCount');
  const summaryTotalUnitsEl = document.getElementById('summaryTotalUnits');
  const summaryTableBody = document.getElementById('summaryTableBody');

  function openSummaryModal() {
    const session = StorageManager.getActiveSession();
    if (!session) return;

    const logs = StorageManager.getLogs(session.id);
    const summary = ExportManager.generateSummary(logs);
    const totalUnits = summary.reduce((acc, cur) => acc + cur.totalQty, 0);

    summarySkuCountEl.textContent = summary.length.toLocaleString();
    summaryTotalUnitsEl.textContent = totalUnits.toLocaleString();

    summaryTableBody.innerHTML = '';
    if (summary.length === 0) {
      summaryTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">ไม่มีข้อมูล</td></tr>`;
    } else {
      summary.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="col-no">${idx + 1}</td>
          <td class="col-item">${escapeHtml(item.barcode)}</td>
          <td class="col-qty">${item.totalQty.toLocaleString()}</td>
          <td class="col-time" style="text-align:center;">${item.rounds} ครั้ง</td>
        `;
        summaryTableBody.appendChild(tr);
      });
    }

    summaryModal.classList.add('open');
  }

  function closeSummaryModal() {
    if (summaryModal) {
      summaryModal.classList.remove('open');
    }
    keepFocus();
  }

  if (btnOpenSummary) btnOpenSummary.addEventListener('click', openSummaryModal);
  if (btnCloseSummaryIcon) btnCloseSummaryIcon.addEventListener('click', closeSummaryModal);
  if (btnSummaryBack) btnSummaryBack.addEventListener('click', closeSummaryModal);
  if (btnSummaryExport) btnSummaryExport.addEventListener('click', () => {
    // เปิดเมนูส่งออก
    exportModal.classList.add('open');
  });

  // ==========================================
  // 7. Export & Share Modal (Button 2 ขวา)
  // ==========================================
  const btnOpenExport = document.getElementById('btnOpenExport');
  const btnCloseExport = document.getElementById('btnCloseExport');

  if (btnOpenExport) btnOpenExport.addEventListener('click', () => {
    exportModal.classList.add('open');
  });

  if (btnCloseExport) btnCloseExport.addEventListener('click', () => {
    exportModal.classList.remove('open');
    keepFocus();
  });

  document.getElementById('actionExportLogsCsv')?.addEventListener('click', () => {
    const session = StorageManager.getActiveSession();
    const logs = StorageManager.getLogs(session.id);
    ExportManager.exportLogsCSV(session, logs);
    exportModal.classList.remove('open');
    keepFocus();
  });

  document.getElementById('actionExportReportCsv')?.addEventListener('click', () => {
    const session = StorageManager.getActiveSession();
    const logs = StorageManager.getLogs(session.id);
    ExportManager.exportReportCSV(session, logs);
    exportModal.classList.remove('open');
    keepFocus();
  });

  document.getElementById('actionPrintPdf')?.addEventListener('click', () => {
    const session = StorageManager.getActiveSession();
    const logs = StorageManager.getLogs(session.id);
    ExportManager.printReportPDF(session, logs);
    exportModal.classList.remove('open');
    keepFocus();
  });

  document.getElementById('actionSubmitCloud')?.addEventListener('click', () => {
    exportModal.classList.remove('open');
    openCloudSubmitModal();
  });

  // ==========================================
  // 8. Session Management Modal (UX Redesign)
  // ==========================================
  const btnMenuSessions = document.getElementById('btnMenuSessions');
  const btnCloseSessions = document.getElementById('btnCloseSessions');
  const sessionListContainer = document.getElementById('sessionListContainer');
  const btnCreateNewSession = document.getElementById('btnCreateNewSession');
  const btnRenameCurrentSession = document.getElementById('btnRenameCurrentSession');
  const btnBackupSessionFile = document.getElementById('btnBackupSessionFile');
  const fileImportInput = document.getElementById('fileImportInput');
  const currentSessionNameDisplay = document.getElementById('currentSessionNameDisplay');
  const currentSessionStatsDisplay = document.getElementById('currentSessionStatsDisplay');

  function openSessionModal() {
    renderSessionList();
    sessionModal.classList.add('open');
  }

  function closeSessionModal() {
    sessionModal.classList.remove('open');
    keepFocus();
  }

  function renderSessionList() {
    if (!sessionListContainer) return;
    const sessions = StorageManager.getSessions();
    const activeId = StorageManager.getActiveSessionId();
    const activeSession = StorageManager.getActiveSession();

    // อัปเดต Spotlight Card ของ Session ปัจจุบัน
    if (activeSession) {
      const activeLogs = StorageManager.getLogs(activeSession.id);
      const activeTotalUnits = activeLogs.reduce((sum, l) => sum + l.qty, 0);
      if (currentSessionNameDisplay) {
        currentSessionNameDisplay.textContent = activeSession.name;
      }
      if (currentSessionStatsDisplay) {
        currentSessionStatsDisplay.textContent = `ยอดรวม: ${activeTotalUnits.toLocaleString()} ชิ้น (${activeLogs.length} แถว) • เริ่มเมื่อ: ${new Date(activeSession.createdAt).toLocaleDateString('th-TH')}`;
      }
    }

    sessionListContainer.innerHTML = '';
    const otherSessions = sessions.filter((s) => s.id !== activeId);

    if (otherSessions.length === 0) {
      sessionListContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 18px 0;">
          ยังไม่มี Session อื่น (กำลังใช้ Session นี้เพียงรายการเดียว)
        </div>
      `;
    } else {
      otherSessions.forEach((s) => {
        const logs = StorageManager.getLogs(s.id);
        const totalUnits = logs.reduce((sum, l) => sum + l.qty, 0);

        const div = document.createElement('div');
        div.className = 'session-card';
        div.innerHTML = `
          <div class="session-card-info" title="แตะเพื่อสลับไปใช้รอบนี้">
            <div class="session-card-title">${escapeHtml(s.name)}</div>
            <div class="session-card-meta">
              รวม: ${totalUnits.toLocaleString()} ชิ้น (${logs.length} แถว) • ${new Date(s.createdAt).toLocaleDateString('th-TH')}
            </div>
          </div>
          <div class="session-card-actions">
            <button class="btn-switch-session" data-switch="${s.id}" title="สลับไปใช้รอบนี้">
              สลับไปใช้
            </button>
            <button class="btn-del-session" data-delete="${s.id}" title="ลบ Session นี้">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        `;

        const switchAction = () => {
          StorageManager.setActiveSessionId(s.id);
          closeSessionModal();
          render();
          SoundManager.playSuccess();
        };

        div.querySelector('.session-card-info').addEventListener('click', switchAction);
        div.querySelector('[data-switch]').addEventListener('click', switchAction);

        div.querySelector('[data-delete]').addEventListener('click', async (e) => {
          e.stopPropagation();
          const isOk = await showConfirm({
            title: 'ลบ Session',
            message: `คุณต้องการลบ Session "${s.name}" และข้อมูลสต๊อกทั้งหมดในรอบนี้หรือไม่?`,
            confirmText: 'ลบ Session',
            isDanger: true
          });
          if (isOk) {
            StorageManager.deleteSession(s.id);
            SoundManager.playWarning();
            showToast(`ลบ Session "${s.name}" เรียบร้อยแล้ว`, 'info');
            renderSessionList();
          }
        });

        sessionListContainer.appendChild(div);
      });
    }
  }

  if (btnMenuSessions) btnMenuSessions.addEventListener('click', openSessionModal);
  if (sessionTitleEl) sessionTitleEl.addEventListener('click', openSessionModal);
  if (btnCloseSessions) btnCloseSessions.addEventListener('click', closeSessionModal);

  // สร้าง Session ใหม่
  if (btnCreateNewSession) {
    btnCreateNewSession.addEventListener('click', () => {
      ensureUserIdentity(() => {
        closeSessionModal();
        openCreateCloudJobModal();
      });
    });
  }

  // เปลี่ยนชื่อ Session
  if (btnRenameCurrentSession) {
    btnRenameCurrentSession.addEventListener('click', () => {
      const active = StorageManager.getActiveSession();
      if (!active) return;
      const newName = prompt('ระบุชื่อ Session ใหม่:', active.name);
      if (newName !== null && newName.trim() !== '') {
        StorageManager.updateSessionName(active.id, newName.trim());
        renderSessionList();
        render();
      }
    });
  }

  // บันทึก Session เป็นไฟล์ .json เก็บไว้ในเครื่อง (หรือแชร์บนมือถือ)
  if (btnBackupSessionFile) {
    btnBackupSessionFile.addEventListener('click', async () => {
      const active = StorageManager.getActiveSession();
      if (!active) return;
      const backupData = StorageManager.exportSessionBackup(active.id);
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const safeName = (active.name || 'session').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const filename = `${safeName}_backup_${Date.now()}.json`;

      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || 
                       (('ontouchstart' in window) && window.innerWidth <= 768);

      if (isMobile && navigator.share) {
        try {
          const file = new File([blob], filename, { type: 'application/json' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `สำรอง Session: ${active.name}`,
              text: 'ไฟล์สำรองข้อมูลสต๊อก .json'
            });
            return;
          }
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);

      SoundManager.playSuccess();
    });
  }

  // โหลด Session เก่าจากไฟล์ .json ในเครื่อง
  if (fileImportInput) {
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          const imported = StorageManager.importSessionBackup(parsed);
          closeSessionModal();
          render();
          SoundManager.playSuccess();
          showToast(`โหลด Session "${imported.name}" สำเร็จ!`, 'success');
        } catch (err) {
          showToast('ไม่สามารถอ่านไฟล์ Backup ได้: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      fileImportInput.value = ''; // reset
    });
  }

  // ==========================================
  // 9. Multi-User Merge & Cloud Sync Controllers
  // ==========================================
  const mergeModal = document.getElementById('mergeModal');
  const btnCloseMerge = document.getElementById('btnCloseMerge');
  const tabMergeOffline = document.getElementById('tabMergeOffline');
  const tabMergeCloud = document.getElementById('tabMergeCloud');
  const mergeOfflinePanel = document.getElementById('mergeOfflinePanel');
  const mergeCloudPanel = document.getElementById('mergeCloudPanel');
  const mergeFileInput = document.getElementById('mergeFileInput');
  const mergeSelectedFilesList = document.getElementById('mergeSelectedFilesList');
  const inputJobCode = document.getElementById('inputJobCode');
  const btnFetchCloudSubmissions = document.getElementById('btnFetchCloudSubmissions');
  const cloudSubmissionsList = document.getElementById('cloudSubmissionsList');
  const cloudSubmissionsItems = document.getElementById('cloudSubmissionsItems');
  const checkIncludeMaster = document.getElementById('checkIncludeMaster');
  const masterSessionPreviewName = document.getElementById('masterSessionPreviewName');
  const mergePreviewSection = document.getElementById('mergePreviewSection');
  const mergeStatSources = document.getElementById('mergeStatSources');
  const mergeStatSkus = document.getElementById('mergeStatSkus');
  const mergeStatTotalUnits = document.getElementById('mergeStatTotalUnits');
  const mergeStatOverlaps = document.getElementById('mergeStatOverlaps');
  const inputMasterSessionName = document.getElementById('inputMasterSessionName');
  const mergePreviewTableBody = document.getElementById('mergePreviewTableBody');
  const btnConfirmMerge = document.getElementById('btnConfirmMerge');

  // Cloud Submit Elements
  const cloudSubmitModal = document.getElementById('cloudSubmitModal');
  const cloudSubmitForm = document.getElementById('cloudSubmitForm');
  const submitJobCode = document.getElementById('submitJobCode');
  const submitStaffName = document.getElementById('submitStaffName');
  const btnCancelCloudSubmit = document.getElementById('btnCancelCloudSubmit');

  let activeMergeTab = 'offline';
  let loadedOfflineSources = [];
  let loadedCloudSources = [];
  let currentComputedMerge = null;

  function openMergeModal() {
    if (!mergeModal) return;
    const active = StorageManager.getActiveSession();
    if (masterSessionPreviewName) {
      masterSessionPreviewName.textContent = active ? active.name : 'ไม่มีงานเปิดอยู่';
    }
    mergeModal.classList.add('open');
    switchMergeTab('offline');
  }

  function closeMergeModal() {
    if (mergeModal) {
      mergeModal.classList.remove('open');
    }
    keepFocus();
  }

  function switchMergeTab(tab) {
    activeMergeTab = tab;
    if (tab === 'offline') {
      tabMergeOffline?.classList.add('active');
      tabMergeCloud?.classList.remove('active');
      if (mergeOfflinePanel) mergeOfflinePanel.style.display = 'block';
      if (mergeCloudPanel) mergeCloudPanel.style.display = 'none';
    } else {
      tabMergeCloud?.classList.add('active');
      tabMergeOffline?.classList.remove('active');
      if (mergeCloudPanel) mergeCloudPanel.style.display = 'block';
      if (mergeOfflinePanel) mergeOfflinePanel.style.display = 'none';
    }
    recalculateMerge();
  }

  if (tabMergeOffline) tabMergeOffline.addEventListener('click', () => switchMergeTab('offline'));
  if (tabMergeCloud) tabMergeCloud.addEventListener('click', () => switchMergeTab('cloud'));
  if (btnCloseMerge) btnCloseMerge.addEventListener('click', closeMergeModal);

  // Read files from input
  if (mergeFileInput) {
    mergeFileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      try {
        const parsedFiles = await MergeManager.readJsonFiles(files);
        loadedOfflineSources = parsedFiles.map((pf) => ({
          name: pf.data.session?.name || pf.filename,
          session: pf.data.session,
          logs: pf.data.logs || []
        }));

        // Render file chip list
        if (mergeSelectedFilesList) {
          mergeSelectedFilesList.style.display = 'flex';
          mergeSelectedFilesList.innerHTML = loadedOfflineSources.map((s) => `
            <div class="merge-file-chip">
              <span class="chip-name">📄 ${escapeHtml(s.name)}</span>
              <span class="chip-badge">${s.logs.length} รายการ</span>
            </div>
          `).join('');
        }

        recalculateMerge();
        SoundManager.playSuccess();
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // Fetch Cloud Submissions
  if (btnFetchCloudSubmissions) {
    btnFetchCloudSubmissions.addEventListener('click', async () => {
      const code = (inputJobCode ? inputJobCode.value : '').trim().toUpperCase();
      if (!code) {
        showToast('กรุณากรอกรหัสงาน (Job Code)', 'warning');
        return;
      }

      btnFetchCloudSubmissions.disabled = true;
      btnFetchCloudSubmissions.textContent = 'กำลังดึง...';

      try {
        const submissions = await CloudSync.fetchSubmissions(code);
        if (!submissions || submissions.length === 0) {
          showToast(`ไม่พบข้อมูลที่ส่งเข้ามาในรหัส "${code}"`, 'warning');
          loadedCloudSources = [];
          if (cloudSubmissionsList) cloudSubmissionsList.style.display = 'none';
        } else {
          loadedCloudSources = submissions.map((sub) => ({
            name: `${sub.staffName} (${sub.session?.name || 'Session'})`,
            session: sub.session,
            logs: sub.logs || []
          }));

          if (cloudSubmissionsList && cloudSubmissionsItems) {
            cloudSubmissionsList.style.display = 'block';
            cloudSubmissionsItems.innerHTML = loadedCloudSources.map((s) => `
              <div class="cloud-submission-item">
                <span style="font-weight: 600;">🟢 ${escapeHtml(s.name)}</span>
                <span class="chip-badge">${s.logs.length} รายการ</span>
              </div>
            `).join('');
          }
          SoundManager.playSuccess();
        }
        recalculateMerge();
      } catch (err) {
        showToast('ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
        SoundManager.playBeepError();
      } finally {
        btnFetchCloudSubmissions.disabled = false;
        btnFetchCloudSubmissions.textContent = '🔍 ดึงข้อมูล';
      }
    });
  }

  if (checkIncludeMaster) {
    checkIncludeMaster.addEventListener('change', recalculateMerge);
  }

  function recalculateMerge() {
    const activeSources = activeMergeTab === 'offline' ? [...loadedOfflineSources] : [...loadedCloudSources];

    // รวมข้อมูลเครื่อง Master เองถ้าติ๊กไว้
    if (checkIncludeMaster && checkIncludeMaster.checked) {
      const localMaster = MergeManager.getLocalMasterSource();
      if (localMaster && localMaster.logs && localMaster.logs.length > 0) {
        activeSources.unshift(localMaster);
      }
    }

    if (activeSources.length === 0) {
      if (mergePreviewSection) mergePreviewSection.style.display = 'none';
      currentComputedMerge = null;
      return;
    }

    const computed = MergeManager.computeMerge(activeSources);
    currentComputedMerge = computed;

    if (mergePreviewSection) {
      mergePreviewSection.style.display = 'block';
      if (mergeStatSources) mergeStatSources.textContent = computed.sourcesCount;
      if (mergeStatSkus) mergeStatSkus.textContent = computed.uniqueSkus.toLocaleString();
      if (mergeStatTotalUnits) mergeStatTotalUnits.textContent = computed.totalUnits.toLocaleString();
      if (mergeStatOverlaps) mergeStatOverlaps.textContent = computed.overlapCount.toLocaleString();
      if (inputMasterSessionName) inputMasterSessionName.value = computed.masterSessionName;

      // Render table
      if (mergePreviewTableBody) {
        mergePreviewTableBody.innerHTML = computed.summaryList.map((item, idx) => {
          const isOverlap = item.sources.length > 1;
          const sourcesPills = item.sources.map((s) => `
            <span class="source-pill-tag ${isOverlap ? 'overlap' : ''}">
              ${escapeHtml(s.source)}: ${s.qty}
            </span>
          `).join('');

          return `
            <tr>
              <td style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
              <td style="font-family: var(--font-mono); font-weight: 600;">${escapeHtml(item.barcode)}</td>
              <td style="text-align: right; font-weight: 700; color: var(--primary);">${item.totalQty.toLocaleString()}</td>
              <td>${sourcesPills}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // Confirm Merge
  if (btnConfirmMerge) {
    btnConfirmMerge.addEventListener('click', () => {
      if (!currentComputedMerge) return;
      if (inputMasterSessionName && inputMasterSessionName.value.trim()) {
        currentComputedMerge.masterSessionName = inputMasterSessionName.value.trim();
      }

      try {
        const createdSession = MergeManager.commitMerge(currentComputedMerge);
        closeMergeModal();
        showScannerView(createdSession.id);
        SoundManager.playSuccess();
        showToast(`รวมข้อมูลสำเร็จ! สร้าง Master Session "${createdSession.name}" เรียบร้อยแล้ว`, 'success');
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการรวมข้อมูล: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // Cloud Submit Modal Actions
  async function openCloudSubmitModal() {
    const active = StorageManager.getActiveSession();
    if (!active) {
      showToast('ไม่มี Session กำลังเปิดอยู่', 'warning');
      return;
    }
    if (submitStaffName) {
      submitStaffName.value = StorageManager.getUsername() || '';
    }
    if (submitJobCode) {
      if (active.jobCode) {
        submitJobCode.value = active.jobCode;
      } else {
        try {
          const jobs = await CloudSync.getActiveJobs();
          const openJob = jobs.find(j => j.status === 'OPEN');
          submitJobCode.value = openJob ? openJob.code : 'COUNT-01';
        } catch (e) {
          submitJobCode.value = 'COUNT-01';
        }
      }
    }
    if (cloudSubmitModal) {
      cloudSubmitModal.classList.add('open');
      setTimeout(() => {
        if (submitJobCode) {
          submitJobCode.focus();
          submitJobCode.select();
        }
      }, 120);
    }
  }

  function closeCloudSubmitModal() {
    if (cloudSubmitModal) {
      cloudSubmitModal.classList.remove('open');
    }
    keepFocus();
  }

  if (btnCancelCloudSubmit) btnCancelCloudSubmit.addEventListener('click', closeCloudSubmitModal);

  if (cloudSubmitForm) {
    cloudSubmitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const jobCode = (submitJobCode ? submitJobCode.value : '').trim().toUpperCase();
      const staff = (submitStaffName ? submitStaffName.value : '').trim();
      if (!jobCode) {
        showToast('กรุณากรอกรหัสงาน (Job Code)', 'warning');
        return;
      }
      if (!staff) {
        showToast('กรุณากรอกชื่อผู้ส่งงาน', 'warning');
        return;
      }

      const active = StorageManager.getActiveSession();
      const logs = StorageManager.getLogs(active.id);

      try {
        const res = await CloudSync.submitJob(jobCode, staff, active, logs);
        // ผูก Session ปัจจุบันเข้ากับ Job Code ทันที เพื่อให้แสดงป้าย ☁️ และปุ่มส่งยอด
        StorageManager.setSessionJobCode(active.id, jobCode);

        closeCloudSubmitModal();
        if (res && res.syncedToCloud) {
          SoundManager.playSuccess();
          showToast(`☁️ ส่งงานขึ้นรอบกลาง "${jobCode}" เรียบร้อยแล้ว!`, 'success');
        } else {
          SoundManager.playBeepError();
          showToast(`⚠️ ขณะนี้ออฟไลน์ (ยังไม่ได้ส่งขึ้น Cloud)!\nข้อมูลบันทึกในเครื่องแล้ว เมื่อมีสัญญาณเน็ตให้กด "ส่งยอด" เพื่อซิงค์ขึ้นระบบ`, 'warning');
        }

        render();
        loadActiveCloudJobs();
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการส่งงาน: ' + err.message, 'error');
        SoundManager.playBeepError();
      }
    });
  }

  // ==========================================
  // 10. iOS PWA Install Helper Setup
  // ==========================================
  function setupIosInstallBanner() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const isDismissed = localStorage.getItem('ios_install_banner_dismissed') === 'true';

    const banner = document.getElementById('iosInstallBanner');
    const btnClose = document.getElementById('btnCloseIosBanner');

    if (banner && isIos && !isStandalone && !isDismissed) {
      banner.style.display = 'flex';
      if (btnClose) {
        btnClose.addEventListener('click', () => {
          banner.style.display = 'none';
          localStorage.setItem('ios_install_banner_dismissed', 'true');
        });
      }
    }
  }
  setupIosInstallBanner();

  // ==========================================
  // 11. Initial Start
  // ==========================================
  showHomeView();
});
