const app = require('./src/app');
const config = require('./src/config');

let server;

// หากรันบน Phusion Passenger / Hostatom cPanel ที่ส่ง Socket มา ไม่ต้องใส่ host
if (typeof config.port === 'string' && isNaN(config.port)) {
  server = app.listen(config.port, () => {
    console.log('==================================================');
    console.log(`🚀 Stock Checker Server running on socket: ${config.port}`);
    console.log(`📁 Data Storage: ${config.dataDir}/{job-id}/db.json`);
    console.log(`📱 Public / PWA: ${config.publicDir}`);
    console.log('==================================================');
  });
} else {
  server = app.listen(config.port, () => {
    console.log('==================================================');
    console.log(`🚀 Stock Checker Server running on http://${config.host}:${config.port}`);
    console.log(`📁 Data Storage: ${config.dataDir}/{job-id}/db.json`);
    console.log(`📱 Public / PWA: ${config.publicDir}`);
    console.log('==================================================');
  });
}

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\nReceived ${signal}. Closing server gracefully...`);
  if (server) {
    server.close(() => {
      console.log('Server closed. Process terminated.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Export สำหรับ Hostatom / cPanel Phusion Passenger
module.exports = app;
