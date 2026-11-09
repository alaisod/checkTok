const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// อ่านเวอร์ชันจาก package.json เป็น Single Source of Truth
let version = '2.6.6';
try {
  const pkg = require(path.join(ROOT_DIR, 'package.json'));
  if (pkg && pkg.version) version = pkg.version;
} catch (_) {}

// รองรับทั้ง Port ตัวเลข และ Unix Domain Socket ของ Hostatom / cPanel (Phusion Passenger)
const rawPort = process.env.PORT;
const port = rawPort ? (isNaN(rawPort) ? rawPort : parseInt(rawPort, 10)) : 3000;

module.exports = {
  version,
  port,
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'production',
  rootDir: ROOT_DIR,
  dataDir: DATA_DIR,
  publicDir: PUBLIC_DIR,
  jobsRegistryFile: path.join(DATA_DIR, 'jobs.json'),
  stockApiUrl: process.env.STOCK_API_URL || 'https://phpos.asmth.co.th/index.php/api/v1/stock',
  defaultLocationId: parseInt(process.env.DEFAULT_LOCATION_ID || '1', 10)
};
