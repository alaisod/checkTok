const https = require('https');
const http = require('http');
const config = require('../config');
const storageService = require('./storageService');

/**
 * แปลงรายการรหัสสินค้า/บาร์โค้ด:
 * หากเป็นตัวเลขล้วน ให้แปลงเป็น Number
 * หากมีตัวอักษร/ช่องว่าง ให้คงไว้เป็น String
 * @param {Array<string|number>} rawList 
 * @returns {Array<string|number>}
 */
function prepareIdentifiers(rawList) {
  if (!Array.isArray(rawList)) return [];
  const set = new Set();
  const result = [];

  rawList.forEach(item => {
    if (item === null || item === undefined) return;
    const trimmed = String(item).trim();
    if (!trimmed) return;

    // ตรวจสอบค่าไม่ให้ซ้ำ
    if (set.has(trimmed)) return;
    set.add(trimmed);

    // หากเป็นตัวเลขล้วน และไม่ขึ้นต้นด้วย 0 หลายหลักจนเสียความหมาย
    // ตรวจสอบว่าเป็นจำนวนเต็มตัวเลขหรือไม่
    if (/^\d+$/.test(trimmed) && trimmed.length <= 15) {
      result.push(Number(trimmed));
    } else {
      result.push(trimmed);
    }
  });

  return result;
}

/**
 * เรียก API กลางเพื่อตรวจสอบข้อมูลสต๊อก
 * @param {number} locationId 
 * @param {Array<string|number>} identifiers 
 * @returns {Promise<object>}
 */
async function fetchStockFromApi(locationId = 1, identifiers = []) {
  const targetUrl = config.stockApiUrl || 'https://phpos.asmth.co.th/index.php/api/v1/stock';
  const urlObj = new URL(targetUrl);
  const isHttps = urlObj.protocol === 'https:';
  const client = isHttps ? https : http;

  const payload = JSON.stringify({
    location_id: Number(locationId) || config.defaultLocationId || 1,
    identifiers: identifiers
  });

  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': `checkTok/${config.version || '2.7.0'}`
    },
    timeout: 15000 // 15 วินาที
  };

  return new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`API ตอบกลับไม่ใช่ JSON (HTTP ${res.statusCode}): ${responseBody.slice(0, 150)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('การเชื่อมต่อ API ใช้เวลานานเกินกำหนด (Timeout 15s)'));
    });

    req.on('error', (err) => {
      reject(new Error(`เชื่อมต่อ API ไม่สำเร็จ: ${err.message}`));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * จับคู่ยอดนับใน checkTok กับยอดสต๊อกจริงจาก API
 * @param {Map<string, number>} countedMap Map ของ [barcode] => countedQty
 * @param {object} apiResponse 
 * @returns {object}
 */
function reconcileStock(countedMap, apiResponse) {
  const apiData = Array.isArray(apiResponse.data) ? apiResponse.data : [];
  const notFoundList = Array.isArray(apiResponse.not_found) ? apiResponse.not_found.map(String) : [];

  const matchedItems = [];
  const processedBarcodes = new Set();

  // 1. จับคู่กับรายการที่พบใน API (apiData)
  apiData.forEach(item => {
    const itemNumber = item.item_number ? String(item.item_number).trim() : '';
    const productId = item.product_id ? String(item.product_id).trim() : '';
    const itemId = item.item_id ? String(item.item_id).trim() : '';

    // ค้นหายอดนับที่ตรงกับ item_number, product_id, หรือ item_id
    let countedQty = 0;
    let matchedBarcodeKey = '';

    if (itemNumber && countedMap.has(itemNumber)) {
      countedQty = countedMap.get(itemNumber);
      matchedBarcodeKey = itemNumber;
    } else if (productId && countedMap.has(productId)) {
      countedQty = countedMap.get(productId);
      matchedBarcodeKey = productId;
    } else if (itemId && countedMap.has(itemId)) {
      countedQty = countedMap.get(itemId);
      matchedBarcodeKey = itemId;
    } else {
      // ตรวจสอบแบบ case-insensitive
      for (const [key, qty] of countedMap.entries()) {
        const lowerKey = key.toLowerCase();
        if ((itemNumber && lowerKey === itemNumber.toLowerCase()) ||
            (productId && lowerKey === productId.toLowerCase()) ||
            (itemId && lowerKey === itemId.toLowerCase())) {
          countedQty = qty;
          matchedBarcodeKey = key;
          break;
        }
      }
    }

    if (matchedBarcodeKey) {
      processedBarcodes.add(matchedBarcodeKey);
    }

    const stockQty = Number(item.stock_qty) || 0;
    const diff = countedQty - stockQty;

    let status = 'MATCH';
    if (diff < 0) status = 'SHORTAGE'; // ขาด
    else if (diff > 0) status = 'SURPLUS';  // เกิน

    matchedItems.push({
      identifier: matchedBarcodeKey || itemNumber || productId || itemId,
      item_id: item.item_id,
      item_number: item.item_number || '',
      product_id: item.product_id || '',
      item_name: item.item_name || 'ไม่ระบุชื่อ',
      stock_qty: stockQty,
      counted_qty: countedQty,
      diff: diff,
      status: status
    });
  });

  // 2. จัดการรายการที่ไม่พบในระบบ (not_found หรือยังไม่ได้จับคู่)
  countedMap.forEach((qty, barcode) => {
    if (!processedBarcodes.has(barcode)) {
      const isExplicitNotFound = notFoundList.includes(String(barcode));
      matchedItems.push({
        identifier: barcode,
        item_id: null,
        item_number: barcode,
        product_id: '',
        item_name: 'ไม่พบในระบบฐานข้อมูล',
        stock_qty: 0,
        counted_qty: qty,
        diff: qty, // นับได้แต่ระบบไม่มี ถือว่าเป็นยอดที่เพิ่มขึ้นมา
        status: 'NOT_FOUND'
      });
    }
  });

  // 3. คำนวณสถิติภาพรวม
  const stats = {
    total_items: matchedItems.length,
    matched: matchedItems.filter(i => i.status === 'MATCH').length,
    shortage: matchedItems.filter(i => i.status === 'SHORTAGE').length,
    surplus: matchedItems.filter(i => i.status === 'SURPLUS').length,
    not_found: matchedItems.filter(i => i.status === 'NOT_FOUND').length,
    total_counted_units: matchedItems.reduce((sum, i) => sum + i.counted_qty, 0),
    total_stock_units: matchedItems.reduce((sum, i) => sum + i.stock_qty, 0),
    net_diff_units: matchedItems.reduce((sum, i) => sum + i.diff, 0)
  };

  return {
    location_id: apiResponse.location_id || 1,
    stats,
    items: matchedItems
  };
}

/**
 * ฟังก์ชันหลักสำหรับตรวจสอบรายการนับสต๊อก
 * @param {Array<{ barcode: string, qty: number }>} items รายการสินค้าพร้อมจำนวน
 * @param {number} locationId รหัสสาขา
 */
async function verifyItems(items = [], locationId = 1) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      success: true,
      location_id: locationId,
      stats: {
        total_items: 0,
        matched: 0,
        shortage: 0,
        surplus: 0,
        not_found: 0,
        total_counted_units: 0,
        total_stock_units: 0,
        net_diff_units: 0
      },
      items: []
    };
  }

  // สร้าง Map ของบาร์โค้ด -> ผลรวมจำนวนที่นับได้
  const countedMap = new Map();
  items.forEach(item => {
    const rawBarcode = String(item.barcode || item.identifier || '').trim();
    if (!rawBarcode) return;
    const qty = Number(item.qty) || 0;
    countedMap.set(rawBarcode, (countedMap.get(rawBarcode) || 0) + qty);
  });

  const rawIdentifiers = Array.from(countedMap.keys());
  const formattedIdentifiers = prepareIdentifiers(rawIdentifiers);

  // เรียก API จริง
  const apiResponse = await fetchStockFromApi(locationId, formattedIdentifiers);

  // จับคู่และคำนวณ Diff
  const result = reconcileStock(countedMap, apiResponse);

  return {
    success: true,
    ...result
  };
}

/**
 * ฟังก์ชันตรวจสอบทั้ง Job กลางจาก db.json
 * @param {string} jobId รหัสรอบงาน
 * @param {number} locationId รหัสสาขา
 */
async function verifyJob(jobId, locationId = 1) {
  const db = storageService.getJobDb(jobId);
  if (!db) {
    throw new Error(`ไม่พบข้อมูลรอบงาน "${jobId}" ในระบบ`);
  }

  // รวบรวม logs ทั้งหมดจากทุก submissions
  const aggregatedMap = new Map();
  (db.submissions || []).forEach(sub => {
    (sub.logs || []).forEach(item => {
      const barcode = String(item.barcode || '').trim();
      if (!barcode) return;
      const qty = Number(item.qty) || 0;
      aggregatedMap.set(barcode, (aggregatedMap.get(barcode) || 0) + qty);
    });
  });

  const items = Array.from(aggregatedMap.entries()).map(([barcode, qty]) => ({
    barcode,
    qty
  }));

  const verificationResult = await verifyItems(items, locationId);
  return {
    jobId,
    jobTitle: db.title || jobId,
    ...verificationResult
  };
}

module.exports = {
  prepareIdentifiers,
  fetchStockFromApi,
  reconcileStock,
  verifyItems,
  verifyJob
};
