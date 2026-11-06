const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// รองรับทั้ง Port ตัวเลข และ Unix Domain Socket ของ Hostatom / cPanel (Phusion Passenger)
const rawPort = process.env.PORT;
const port = rawPort ? (isNaN(rawPort) ? rawPort : parseInt(rawPort, 10)) : 3000;

module.exports = {
  port,
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'production',
  rootDir: ROOT_DIR,
  dataDir: DATA_DIR,
  publicDir: PUBLIC_DIR,
  jobsRegistryFile: path.join(DATA_DIR, 'jobs.json')
};
