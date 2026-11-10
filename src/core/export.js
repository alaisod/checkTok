/**
 * Export & Web Share Module
 * Generates CSV (UTF-8 BOM), Report Summaries, Print/PDF, and Native Web Share
 */
const ExportManager = (() => {
  // คำนวณ Report Summary: Group by barcode & sum(qty) เรียงตามลำดับการยิงแบบ ASC
  function generateSummary(logs) {
    const map = new Map();

    // logs เดิมเรียงจากล่าสุดไปเก่า (Desc) ดังนั้นกลับลำดับเป็นเก่าสุด -> ล่าสุด (Chronological ASC)
    const chronologicalLogs = [...logs].reverse();

    chronologicalLogs.forEach(log => {
      const code = log.barcode;
      if (!map.has(code)) {
        map.set(code, {
          barcode: code,
          totalQty: 0,
          rounds: 0,
          firstSeen: log.createdAt || log.updatedAt,
          lastSeen: log.updatedAt
        });
      }
      const entry = map.get(code);
      entry.totalQty += log.qty;
      entry.rounds += 1;
      entry.lastSeen = log.updatedAt;
    });

    // เรียงรายการตามลำดับการยิงแบบ ASC (ตัวที่เริ่มยิงก่อนขึ้นอันดับแรก)
    return Array.from(map.values()).sort((a, b) => a.firstSeen - b.firstSeen);
  }

  function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function downloadBlob(blob, filename) {
    const urlObj = window.URL || window.webkitURL;
    const url = urlObj.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      urlObj.revokeObjectURL(url);
    }, 200);
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || 
           (('ontouchstart' in window) && window.innerWidth <= 768);
  }

  // ส่งออกไฟล์: ถ้าเป็น PC ให้บันทึกลงเครื่อง (Save as/Download), ถ้าเป็น Mobile ให้เรียกแชร์ (Share Sheet)
  async function exportOrShareFile(filename, blob, mimeType, title, text) {
    if (isMobileDevice() && navigator.share) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title || filename,
            text: text || ''
          });
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // ผู้ใช้กดยกเลิก share sheet
        console.warn('Native share failed, falling back to download:', e);
      }
    }

    // PC หรือกรณีแชร์ไม่ได้ ให้ดาวน์โหลด/Save As ลงเครื่อง
    downloadBlob(blob, filename);
  }

  function notify(msg, type = 'warning') {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  return {
    generateSummary,
    isMobileDevice,

    // 1. Export Logs CSV (UTF-8 BOM - ใช้เฉพาะ 3 คอลัมน์: no, barcode, qty)
    async exportLogsCSV(session, logs) {
      if (!logs || logs.length === 0) {
        notify('ไม่มีข้อมูล Logs สำหรับส่งออก', 'warning');
        return;
      }

      let csv = '\uFEFF'; // UTF-8 BOM สำหรับ Excel ภาษาไทย
      csv += 'ลำดับ,บาร์โค้ด,จำนวน\r\n';

      // logs เดิมเรียงจากล่าสุดไปเก่า (Desc) ดังนั้นเมื่อ export ให้เรียงตามลำดับจริง (1 -> last)
      const chronologicalLogs = [...logs].reverse();
      chronologicalLogs.forEach((log, idx) => {
        csv += `${idx + 1},"${log.barcode}",${log.qty}\r\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const safeName = (session.name || 'session').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const filename = `${safeName}_logs_${Date.now()}.csv`;
      await exportOrShareFile(filename, blob, 'text/csv', `ประวัติการสแกน (${session.name})`, 'ไฟล์ Logs ประวัติการยิงบาร์โค้ด');
    },

    // 2. Export Report CSV (UTF-8 BOM - รองรับ Reconciliation Data)
    async exportReportCSV(session, logs, reconciliationData = null) {
      if ((!logs || logs.length === 0) && (!reconciliationData || !reconciliationData.items || reconciliationData.items.length === 0)) {
        notify('ไม่มีข้อมูลสำหรับสรุปรายงาน', 'warning');
        return;
      }

      let csv = '\uFEFF';

      if (reconciliationData && Array.isArray(reconciliationData.items) && reconciliationData.items.length > 0) {
        // ส่งออกรายงานกระทบยอดสต๊อกจริง (Reconciliation CSV)
        csv += 'ลำดับ,รหัส/บาร์โค้ด,รหัสรุ่น (Product ID),ชื่อสินค้า (PHP POS),สต๊อกระบบ,ยอดตรวจนับ,ส่วนต่าง (Diff),สถานะ\r\n';
        reconciliationData.items.forEach((it, idx) => {
          let statusText = 'ตรงกัน';
          if (it.status === 'SHORTAGE') statusText = 'ขาด';
          else if (it.status === 'SURPLUS') statusText = 'เกิน';
          else if (it.status === 'NOT_FOUND') statusText = 'ไม่พบในระบบ';

          const safeId = String(it.identifier || '').replace(/"/g, '""');
          const safePid = String(it.product_id || '').replace(/"/g, '""');
          const safeName = String(it.item_name || '').replace(/"/g, '""');
          csv += `${idx + 1},"${safeId}","${safePid}","${safeName}",${it.stock_qty || 0},${it.counted_qty || 0},${it.diff || 0},"${statusText}"\r\n`;
        });

        const stats = reconciliationData.stats || {};
        csv += `\r\n,"รวมยอดทั้งสิ้น","","",${stats.total_stock_units || 0},${stats.total_counted_units || 0},${stats.net_diff_units || 0},""\r\n`;
      } else {
        const summary = generateSummary(logs);
        csv += 'ลำดับ,บาร์โค้ด,จำนวน\r\n';
        summary.forEach((item, idx) => {
          csv += `${idx + 1},"${item.barcode}",${item.totalQty}\r\n`;
        });
        const totalItems = summary.reduce((acc, cur) => acc + cur.totalQty, 0);
        csv += `\r\n,"รวมยอดทั้งสิ้น",${totalItems}\r\n`;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const safeName = (session.name || 'session').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const filename = `${safeName}_summary_report_${Date.now()}.csv`;
      await exportOrShareFile(filename, blob, 'text/csv', `สรุปยอดสต๊อก (${session.name})`, 'ไฟล์รายงานสรุปยอดสินค้า');
    },

    // 3. Export PDF Report (Thai-Eng A4 Clean Template - รองรับกระทบยอดสต๊อกจริง และผู้รับผิดชอบนับ)
    printReportPDF(session, logs, reconciliationData = null, jobSummaryData = null) {
      if ((!logs || logs.length === 0) && (!reconciliationData || !reconciliationData.items || reconciliationData.items.length === 0)) {
        notify('ไม่มีข้อมูลสำหรับสร้างรายงาน PDF', 'warning');
        return;
      }

      const hasReconcile = reconciliationData && Array.isArray(reconciliationData.items) && reconciliationData.items.length > 0;
      const summary = generateSummary(logs || []);
      const totalUnits = summary.reduce((a, b) => a + b.totalQty, 0);
      const submissions = (jobSummaryData && jobSummaryData.submissions) || (session && session.submissions) || [];

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        notify('เบราว์เซอร์บล็อกหน้าต่างป็อปอัป กรุณาอนุญาตป็อปอัปแล้วลองใหม่อีกครั้ง', 'warning');
        return;
      }

      let titleText = 'รายงานสรุปผลการนับสต๊อกสินค้า (Stock Summary Report)';
      let tableHeaderHtml = '';
      let rowsHtml = '';
      let tfootHtml = '';
      let summaryCardsHtml = '';

      if (hasReconcile) {
        const stats = reconciliationData.stats || {};
        const locId = reconciliationData.location_id || 1;
        titleText = 'รายงานผลการตรวจนับและกระทบยอดสต๊อกสินค้า (Inventory Reconciliation Report)';

        const netDiff = stats.net_diff_units || 0;
        let diffColor = '#16a34a';
        let diffSign = '';
        if (netDiff > 0) { diffColor = '#ea580c'; diffSign = '+'; }
        else if (netDiff < 0) { diffColor = '#dc2626'; }

        summaryCardsHtml = `
          <div class="summary-cards">
            <div class="card">
              <div class="card-label">ตรวจนับได้จริง (Counted)</div>
              <div class="card-val" style="color: #2563eb;">${(stats.total_counted_units || 0).toLocaleString()} <span style="font-size: 13px; font-weight: normal; color: #64748b;">ชิ้น</span></div>
            </div>
            <div class="card">
              <div class="card-label">สต๊อกระบบ (PHP POS สาขา ${locId})</div>
              <div class="card-val" style="color: #0f172a;">${(stats.total_stock_units || 0).toLocaleString()} <span style="font-size: 13px; font-weight: normal; color: #64748b;">ชิ้น</span></div>
            </div>
            <div class="card">
              <div class="card-label">ผลต่างสุทธิ (Net Diff)</div>
              <div class="card-val" style="color: ${diffColor};">${diffSign}${netDiff.toLocaleString()} <span style="font-size: 13px; font-weight: normal; color: #64748b;">ชิ้น</span></div>
            </div>
            <div class="card">
              <div class="card-label">ผลการตรวจนับ (Status)</div>
              <div style="font-size: 13px; margin-top: 6px; font-weight: 600; line-height: 1.4;">
                <span style="color: #16a34a;">✓ ตรง: ${stats.matched || 0}</span> •
                <span style="color: #dc2626;">ขาด: ${stats.shortage || 0}</span> •
                <span style="color: #ea580c;">เกิน: ${stats.surplus || 0}</span>
                ${stats.not_found ? `• <span style="color: #64748b;">ไม่พบ: ${stats.not_found}</span>` : ''}
              </div>
            </div>
          </div>
        `;

        tableHeaderHtml = `
          <tr>
            <th style="width: 34px; text-align: center;">ลำดับ</th>
            <th style="width: 115px;">รหัส / บาร์โค้ด</th>
            <th>ชื่อสินค้า (PHP POS)</th>
            <th style="width: 55px; text-align: right; white-space: nowrap;">ระบบ</th>
            <th style="width: 55px; text-align: right; white-space: nowrap;">นับจริง</th>
            <th style="width: 55px; text-align: right; white-space: nowrap;">ส่วนต่าง</th>
            <th style="width: 95px; text-align: center; white-space: nowrap;">ผู้นับ</th>
          </tr>
        `;

        rowsHtml = reconciliationData.items.map((item, idx) => {
          let rowBg = '#ffffff';
          let diffText = '0';
          let diffColor = '#16a34a';

          if (item.status === 'SHORTAGE') {
            rowBg = '#fef2f2';
            diffText = String(item.diff);
            diffColor = '#dc2626';
          } else if (item.status === 'SURPLUS') {
            rowBg = '#fff7ed';
            diffText = `+${item.diff}`;
            diffColor = '#ea580c';
          } else if (item.status === 'NOT_FOUND') {
            rowBg = '#f8fafc';
            diffText = `+${item.diff}`;
            diffColor = '#64748b';
          }

          // ค้นหาผู้ร่วมตรวจนับสินค้ารายการนี้
          let itemContributors = [];
          if (Array.isArray(item.contributors) && item.contributors.length > 0) {
            itemContributors = item.contributors;
          } else if (submissions.length > 0) {
            submissions.forEach(sub => {
              const matchedLog = (sub.logs || []).find(l => {
                const b = String(l.barcode || '').trim();
                return b === String(item.identifier) || b === String(item.item_number) || b === String(item.product_id);
              });
              if (matchedLog && sub.staffName && !itemContributors.includes(sub.staffName)) {
                itemContributors.push(sub.staffName);
              }
            });
          }

          const contributorName = itemContributors.length > 0 ? itemContributors.join(', ') : '-';

          return `
            <tr style="background-color: ${rowBg};">
              <td style="text-align: center; color: #64748b;">${idx + 1}</td>
              <td style="word-break: break-all;">
                <div style="font-family: monospace; font-weight: bold; font-size: 12px; line-height: 1.2;">${item.identifier}</div>
                ${(item.product_id && item.product_id !== item.identifier) ? `<div style="font-size: 10px; color: #64748b;">รุ่น: ${item.product_id}</div>` : ''}
              </td>
              <td style="font-size: 12px; word-break: break-word;">
                <div style="font-weight: 500;">${item.item_name || '-'}</div>
              </td>
              <td style="text-align: right; font-family: monospace; font-size: 12px; white-space: nowrap;">${(item.stock_qty || 0).toLocaleString()}</td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; font-size: 12px; color: #2563eb; white-space: nowrap;">${(item.counted_qty || 0).toLocaleString()}</td>
              <td style="text-align: right; font-family: monospace; font-weight: bold; font-size: 12px; color: ${diffColor}; white-space: nowrap;">${diffText}</td>
              <td style="text-align: center; font-size: 11.5px; font-weight: 600; color: #1e293b; white-space: nowrap;">${contributorName}</td>
            </tr>
          `;
        }).join('');

        tfootHtml = `
          <tfoot>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td colspan="3" style="text-align: right; padding: 8px 10px;">ยอดรวมทั้งสิ้น:</td>
              <td style="text-align: right; font-family: monospace; padding: 8px 6px; white-space: nowrap;">${(stats.total_stock_units || 0).toLocaleString()}</td>
              <td style="text-align: right; font-family: monospace; color: #2563eb; padding: 8px 6px; white-space: nowrap;">${(stats.total_counted_units || 0).toLocaleString()}</td>
              <td style="text-align: right; font-family: monospace; color: ${diffColor}; padding: 8px 6px; white-space: nowrap;">${diffSign}${netDiff.toLocaleString()}</td>
              <td></td>
            </tr>
          </tfoot>
        `;
      } else {
        summaryCardsHtml = `
          <div class="summary-cards">
            <div class="card">
              <div class="card-label">จำนวนชนิดบาร์โค้ด (SKU Count)</div>
              <div class="card-val">${summary.length.toLocaleString()} ชนิด</div>
            </div>
            <div class="card">
              <div class="card-label">จำนวนสินค้ารวมทั้งหมด (Total Units)</div>
              <div class="card-val" style="color: #2563eb;">${totalUnits.toLocaleString()} ชิ้น</div>
            </div>
          </div>
        `;

        tableHeaderHtml = `
          <tr>
            <th style="width: 70px; text-align: center;">ลำดับ</th>
            <th>บาร์โค้ด</th>
            <th style="width: 150px; text-align: right;">จำนวน</th>
          </tr>
        `;

        rowsHtml = summary.map((item, idx) => `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td style="font-family: monospace; font-weight: bold; font-size: 14px;">${item.barcode}</td>
            <td style="text-align: right; font-weight: bold; font-size: 15px;">${item.totalQty.toLocaleString()}</td>
          </tr>
        `).join('');

        tfootHtml = `
          <tfoot>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td colspan="2" style="text-align: right; padding: 10px;">ยอดรวมทั้งสิ้น:</td>
              <td style="text-align: right; color: #1e40af; font-size: 16px; padding: 10px;">${totalUnits.toLocaleString()}</td>
            </tr>
          </tfoot>
        `;
      }

      const docHtml = `
        <!DOCTYPE html>
        <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>${titleText} - ${session.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
            @page {
              size: A4 portrait;
              margin: 10mm 10mm 14mm 10mm;
            }
            html {
              height: 100%;
            }
            body {
              font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 20px;
              color: #0f172a;
              background: #fff;
              margin: 0;
              min-height: 100%;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
            }
            .header {
              border-bottom: 2px solid #2563eb;
              padding-bottom: 12px;
              margin-bottom: 16px;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .title {
              font-size: 20px;
              font-weight: 700;
              color: #1e3a8a;
              margin: 0 0 6px 0;
            }
            .meta {
              font-size: 12.5px;
              color: #475569;
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 8px;
            }
            .summary-cards {
              display: flex;
              gap: 12px;
              margin-bottom: 16px;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .card {
              flex: 1;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 10px 14px;
            }
            .card-label {
              font-size: 11.5px;
              color: #64748b;
            }
            .card-val {
              font-size: 18px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 3px;
              font-family: monospace, sans-serif;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              break-inside: auto;
              page-break-inside: auto;
            }
            thead {
              display: table-header-group !important;
            }
            tfoot {
              display: table-footer-group !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: auto;
            }
            th {
              background-color: #f1f5f9;
              color: #334155;
              font-weight: 600;
              padding: 6px 6px;
              border: 1px solid #cbd5e1;
              font-size: 11.5px;
            }
            td {
              padding: 5px 6px;
              border: 1px solid #e2e8f0;
              font-size: 11.5px;
              vertical-align: middle;
            }
            .signature-section {
              margin-top: auto !important; /* ดันลงด้านล่างสุดเสมอ (Sticky Bottom) */
              padding-top: 28px;
              display: flex;
              justify-content: space-between;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              padding-left: 20px;
              padding-right: 20px;
            }
            .sig-box {
              text-align: center;
              font-size: 12px;
              color: #475569;
            }
            .sig-line {
              width: 180px;
              border-bottom: 1px dashed #94a3b8;
              margin-bottom: 8px;
            }
            .footer {
              margin-top: 16px;
              text-align: right;
              font-size: 11px;
              color: #94a3b8;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            @media print {
              html, body {
                height: 100%;
                min-height: 100%;
              }
              body {
                padding: 0;
                background: #fff;
                display: flex;
                flex-direction: column;
              }
              .no-print { display: none !important; }
              table { width: 100% !important; }
              tr { page-break-inside: avoid !important; break-inside: avoid !important; }
              thead { display: table-header-group !important; }
              tfoot { display: table-footer-group !important; }
              .signature-section {
                margin-top: auto !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #1e40af; font-size: 14px;">📄 ตัวอย่างรายงาน (สามารถสั่งพิมพ์หรือกด Save as PDF)</span>
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;">พิมพ์ / บันทึก PDF</button>
          </div>

          <div class="header">
            <h1 class="title">${titleText}</h1>
            <div class="meta">
              <span><strong>ชื่องาน:</strong> ${session.name}</span>
              ${hasReconcile ? `<span><strong>สาขาตรวจนับ:</strong> PHP POS สาขา ${reconciliationData.location_id || 1}</span>` : ''}
              <span><strong>พิมพ์เมื่อ:</strong> ${new Date().toLocaleString('th-TH')}</span>
            </div>
          </div>

          ${summaryCardsHtml}

          ${(submissions && submissions.length > 0) ? `
            <div style="margin-bottom: 12px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; break-inside: avoid;">
              <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 4px;">👥 ผู้ร่วมตรวจนับและรับผิดชอบ (Contributors):</div>
              <div style="font-size: 12px; color: #334155; line-height: 1.5;">
                ${submissions.map(s => `<span style="display: inline-block; margin-right: 14px;"><strong>👤 ${s.staffName}</strong>: นับ ${(s.totalUnits || 0).toLocaleString()} ชิ้น (${s.uniqueSkus || 0} SKU)</span>`).join('')}
              </div>
            </div>
          ` : ''}

          <table>
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            ${tfootHtml}
          </table>

          ${hasReconcile ? `
            <div class="signature-section">
              <div class="sig-box">
                <div class="sig-line"></div>
                <div>( ${(submissions && submissions.length > 0) ? submissions.map(s => s.staffName).join(' / ') : '......................................................'} )</div>
                <div style="margin-top: 4px; font-weight: 600;">ผู้ตรวจนับสินค้า (ผู้รับผิดชอบ)</div>
                <div style="margin-top: 2px;">วันที่ ......./......./.......</div>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <div>( ...................................................... )</div>
                <div style="margin-top: 4px; font-weight: 600;">ผู้จัดการ / ผู้อนุมัติปรับยอด</div>
                <div style="margin-top: 2px;">วันที่ ......./......./.......</div>
              </div>
            </div>
          ` : ''}

          <div class="footer">
            พิมพ์จากระบบ checkTok Mobile PWA • วันที่ ${new Date().toLocaleDateString('th-TH')}
          </div>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(docHtml);
      printWindow.document.close();
    },

    // 4. Web Share API สำหรับส่งต่อในมือถือ (LINE, Mail, Chat)
    async shareReport(session, logs) {
      if (!logs || logs.length === 0) {
        notify('ไม่มีข้อมูลสำหรับแชร์', 'warning');
        return;
      }

      const summary = generateSummary(logs);
      const totalUnits = summary.reduce((a, b) => a + b.totalQty, 0);

      // ข้อความสรุปย่อสำหรับแชร์เข้าแชท
      let shareText = `📦 สรุปยอดนับสต๊อก: ${session.name}\n`;
      shareText += `📅 วันที่: ${new Date().toLocaleString('th-TH')}\n`;
      shareText += `🔢 บาร์โค้ดทั้งหมด: ${summary.length} ชนิด\n`;
      shareText += `🏷️ รวมทั้งสิ้น: ${totalUnits} ชิ้น\n\n`;
      shareText += `รายการ 5 อันดับแรก:\n`;

      summary.slice(0, 5).forEach((item, i) => {
        shareText += `${i + 1}. ${item.barcode} = ${item.totalQty} ชิ้น\n`;
      });
      if (summary.length > 5) {
        shareText += `...และอีก ${summary.length - 5} รายการ\n`;
      }

      // ตรวจสอบ Web Share API
      if (navigator.share) {
        try {
          // ลองแชร์เป็นไฟล์ CSV ถ้าอุปกรณ์รองรับ canShare
          let csv = '\uFEFFลำดับ,บาร์โค้ด,จำนวน\r\n';
          summary.forEach((item, idx) => {
            csv += `${idx + 1},"${item.barcode}",${item.totalQty}\r\n`;
          });
          const file = new File([csv], `${session.name}_report.csv`, { type: 'text/csv' });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `สรุปสต๊อก: ${session.name}`,
              text: shareText,
              files: [file]
            });
            return;
          }

          // ถ้าแชร์ไฟล์ไม่ได้ ให้แชร์เป็น Text สรุป
          await navigator.share({
            title: `สรุปสต๊อก: ${session.name}`,
            text: shareText
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('Web share failed, fallback to copy/download', err);
            this.exportReportCSV(session, logs);
          }
        }
      } else {
        // Fallback: Copy สรุปข้อความลง Clipboard แล้วดาวน์โหลด CSV
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareText);
          notify('คัดลอกข้อความสรุปยอดไปยังคลิปบอร์ดแล้ว พร้อมดาวน์โหลดไฟล์ CSV', 'success');
        }
        this.exportReportCSV(session, logs);
      }
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportManager;
}
