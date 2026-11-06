const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// PWA Service Worker Headers Middleware
app.use((req, res, next) => {
  if (req.path === '/sw.js') {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path.endsWith('.html') || req.path.endsWith('.webmanifest') || req.path === '/version.json') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// Version JSON Direct Route (Sync อัตโนมัติจาก package.json)
app.get('/version.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    name: 'checkTok',
    version: config.version,
    updatedAt: new Date().toISOString()
  });
});

// API Routes
app.use('/api', apiRoutes);

// Shared Core Logic Modules (/core/*.js)
app.use('/core', express.static(path.join(config.rootDir, 'src/core'), {
  maxAge: config.env === 'production' ? '1d' : 0
}));

// Static Assets (PWA Public Directory)
app.use(express.static(config.publicDir, {
  maxAge: config.env === 'production' ? '1d' : 0
}));

// SPA Fallback: สำหรับเส้นทางอื่นๆ ส่งกลับ index.html
app.use((req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;
