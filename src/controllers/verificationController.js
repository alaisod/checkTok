const verificationService = require('../services/verificationService');
const config = require('../config');

/**
 * Controller สำหรับรับ Request ตรวจสอบสต๊อกสินค้า (POST /api/verify-stock)
 */
async function verifyStock(req, res) {
  try {
    const body = req.body || {};
    const locationId = Number(body.location_id) || config.defaultLocationId || 1;
    
    // items อาจส่งมาเป็น [{ barcode, qty }] หรือ identifiers: [...]
    let items = [];
    if (Array.isArray(body.items)) {
      items = body.items;
    } else if (Array.isArray(body.identifiers)) {
      items = body.identifiers.map(id => ({ barcode: id, qty: 1 }));
    }

    const result = await verificationService.verifyItems(items, locationId);
    return res.json(result);
  } catch (err) {
    console.error('Error in verifyStock:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสต๊อกกับระบบภายนอก'
    });
  }
}

/**
 * Controller สำหรับตรวจสอบข้อมูลของ Job กลาง (POST /api/jobs/:jobCode/verify)
 */
async function verifyJobStock(req, res) {
  try {
    const jobCode = req.params.jobCode || req.body.jobCode;
    const locationId = Number(req.body.location_id || req.query.location_id) || config.defaultLocationId || 1;

    if (!jobCode) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสงาน (jobCode)' });
    }

    const result = await verificationService.verifyJob(jobCode, locationId);
    return res.json(result);
  } catch (err) {
    console.error('Error in verifyJobStock:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสต๊อกรอบงาน'
    });
  }
}

module.exports = {
  verifyStock,
  verifyJobStock
};
