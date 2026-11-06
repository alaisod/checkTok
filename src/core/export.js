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

    // 1. Export Logs CSV (UTF-8 BOM - เรียงลำดับจริง 1 -> Last)
    async exportLogsCSV(session, logs) {
      if (!logs || logs.length === 0) {
        notify('ไม่มีข้อมูล Logs สำหรับส่งออก', 'warning');
        return;
      }

      let csv = '\uFEFF'; // UTF-8 BOM สำหรับ Excel ภาษาไทย
      csv += 'ลำดับ,บาร์โค้ด,จำนวน (Qty),เวลาที่บันทึกล่าสุด\r\n';

      // logs เดิมเรียงจากล่าสุดไปเก่า (Desc) ดังนั้นเมื่อ export ให้เรียงตามลำดับจริง (1 -> last)
      const chronologicalLogs = [...logs].reverse();
      chronologicalLogs.forEach((log, idx) => {
        const timeStr = formatDateTime(log.updatedAt);
        csv += `${idx + 1},"${log.barcode}",${log.qty},"${timeStr}"\r\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const safeName = (session.name || 'session').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const filename = `${safeName}_logs_${Date.now()}.csv`;
      await exportOrShareFile(filename, blob, 'text/csv', `ประวัติการสแกน (${session.name})`, 'ไฟล์ Logs ประวัติการยิงบาร์โค้ด');
    },

    // 2. Export Report CSV (UTF-8 BOM - Grouped by Barcode เรียงแบบ ASC)
    async exportReportCSV(session, logs) {
      if (!logs || logs.length === 0) {
        notify('ไม่มีข้อมูลสำหรับสรุปรายงาน', 'warning');
        return;
      }

      const summary = generateSummary(logs);
      let csv = '\uFEFF';
      csv += 'ลำดับ,บาร์โค้ด,ยอดรวมทั้งหมด (Total Qty),จำนวนรอบที่สแกน (Rounds)\r\n';

      summary.forEach((item, idx) => {
        csv += `${idx + 1},"${item.barcode}",${item.totalQty},${item.rounds}\r\n`;
      });

      const totalItems = summary.reduce((acc, cur) => acc + cur.totalQty, 0);
      csv += `\r\n,"รวมยอดทั้งสิ้น (Grand Total)",${totalItems},รายการยูนิต\r\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const safeName = (session.name || 'session').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
      const filename = `${safeName}_summary_report_${Date.now()}.csv`;
      await exportOrShareFile(filename, blob, 'text/csv', `สรุปยอดสต๊อก (${session.name})`, 'ไฟล์รายงานสรุปยอดสินค้า');
    },

    // 3. Export PDF Report (Thai-Eng A4 Clean Template)
    printReportPDF(session, logs) {
      if (!logs || logs.length === 0) {
        notify('ไม่มีข้อมูลสำหรับสร้างรายงาน PDF', 'warning');
        return;
      }

      const summary = generateSummary(logs);
      const totalUnits = summary.reduce((a, b) => a + b.totalQty, 0);

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        notify('เบราว์เซอร์บล็อกหน้าต่างป็อปอัป กรุณาอนุญาตป็อปอัปแล้วลองใหม่อีกครั้ง', 'warning');
        return;
      }

      const rowsHtml = summary.map((item, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="font-family: monospace; font-weight: bold; font-size: 14px;">${item.barcode}</td>
          <td style="text-align: right; font-weight: bold; font-size: 15px;">${item.totalQty.toLocaleString()}</td>
          <td style="text-align: center; color: #555;">${item.rounds}</td>
        </tr>
      `).join('');

      const docHtml = `
        <!DOCTYPE html>
        <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>Stock Report - ${session.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
            @page {
              size: A4 portrait;
              margin: 12mm 10mm 15mm 10mm;
            }
            body {
              font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 24px;
              color: #1e293b;
              background: #fff;
              margin: 0;
            }
            .header {
              border-bottom: 2px solid #2563eb;
              padding-bottom: 12px;
              margin-bottom: 20px;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .title {
              font-size: 22px;
              font-weight: 700;
              color: #1e3a8a;
              margin: 0 0 6px 0;
            }
            .meta {
              font-size: 13px;
              color: #64748b;
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
            }
            .summary-cards {
              display: flex;
              gap: 16px;
              margin-bottom: 20px;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .card {
              flex: 1;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 16px;
            }
            .card-label {
              font-size: 12px;
              color: #64748b;
            }
            .card-val {
              font-size: 20px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
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
              padding: 10px;
              border: 1px solid #cbd5e1;
              font-size: 13px;
              box-decoration-break: clone;
              -webkit-box-decoration-break: clone;
            }
            td {
              padding: 8px 10px;
              border: 1px solid #e2e8f0;
              font-size: 13px;
              box-decoration-break: clone;
              -webkit-box-decoration-break: clone;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .footer {
              margin-top: 30px;
              text-align: right;
              font-size: 12px;
              color: #94a3b8;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            @media print {
              body { padding: 0; background: #fff; }
              .no-print { display: none !important; }
              table { width: 100% !important; }
              tr { page-break-inside: avoid !important; break-inside: avoid !important; }
              thead { display: table-header-group !important; }
              tfoot { display: table-footer-group !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #1e40af; font-size: 14px;">📄 ตัวอย่างรายงานสรุป (สามารถสั่งพิมพ์หรือกด Save as PDF)</span>
            <button onclick="window.print()" style="background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;">พิมพ์ / บันทึก PDF</button>
          </div>

          <div class="header">
            <h1 class="title">รายงานสรุปผลการนับสต๊อกสินค้า (Stock Summary Report)</h1>
            <div class="meta">
              <span><strong>Session:</strong> ${session.name}</span>
              <span><strong>พิมพ์เมื่อ:</strong> ${new Date().toLocaleString('th-TH')}</span>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">จำนวนชนิดบาร์โค้ด (SKU Count)</div>
              <div class="card-val">${summary.length.toLocaleString()} ชนิด</div>
            </div>
            <div class="card">
              <div class="card-label">จำนวนสินค้ารวมทั้งหมด (Total Units)</div>
              <div class="card-val" style="color: #2563eb;">${totalUnits.toLocaleString()} ชิ้น</div>
            </div>
            <div class="card">
              <div class="card-label">จำนวนประวัติการยิง (Log Entries)</div>
              <div class="card-val">${logs.length.toLocaleString()} แถว</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 60px;">ลำดับ</th>
                <th>บาร์โค้ด (Barcode / Item)</th>
                <th style="width: 140px; text-align: right;">จำนวนรวม (Total Qty)</th>
                <th style="width: 130px;">จำนวนครั้งที่สแกน</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="background-color: #f1f5f9; font-weight: bold;">
                <td colspan="2" style="text-align: right; padding: 10px;">ยอดรวมทั้งสิ้น (Grand Total):</td>
                <td style="text-align: right; color: #1e40af; font-size: 16px; padding: 10px;">${totalUnits.toLocaleString()}</td>
                <td style="text-align: center; padding: 10px;">${logs.length} ครั้ง</td>
              </tr>
            </tfoot>
          </table>

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
