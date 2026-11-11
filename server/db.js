'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./auth-utils');

fs.mkdirSync(path.join(config.dataDir, 'images'), { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, 'arakom.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT, email TEXT, city TEXT, country TEXT DEFAULT 'SA',
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  subscription_until TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','customer')),
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial TEXT NOT NULL UNIQUE,
  name TEXT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  location TEXT,
  -- whitelist: يفتح للمسموح فقط | all: يفتح للجميع عدا المحظور | manual: فتح يدوي فقط
  gate_mode TEXT NOT NULL DEFAULT 'whitelist',
  ip TEXT,
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plate_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plate_key TEXT NOT NULL,
  plate_raw TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('allow','block')),
  owner_name TEXT, phone TEXT, note TEXT,
  valid_until TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (customer_id, plate_key)
);
CREATE TABLE IF NOT EXISTS plate_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  serial TEXT,
  plate_raw TEXT, plate_key TEXT, plate_display TEXT, plate_display_ar TEXT, country TEXT,
  confidence REAL, color TEXT, direction TEXT,
  list_status TEXT,
  gate_opened INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reads_customer_ts ON plate_reads(customer_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_reads_key ON plate_reads(plate_key);
CREATE INDEX IF NOT EXISTS idx_reads_ts ON plate_reads(ts DESC);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, customer_id INTEGER, device_id INTEGER,
  action TEXT NOT NULL, details TEXT,
  ts INTEGER NOT NULL
);
`);

// إنشاء حساب المدير الأول تلقائياً عند أول تشغيل
const adminExists = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
if (!adminExists) {
  db.prepare('INSERT INTO users (username,name,password_hash,role,created_at) VALUES (?,?,?,?,?)')
    .run(config.admin.username, 'مدير النظام', hashPassword(config.admin.password), 'admin', Date.now());
  console.log(`[db] تم إنشاء حساب المدير: ${config.admin.username}`);
}

function audit(user, action, details = {}, ids = {}) {
  db.prepare('INSERT INTO audit_log (user_id,customer_id,device_id,action,details,ts) VALUES (?,?,?,?,?,?)').run(
    user?.id ?? null, ids.customer_id ?? user?.customer_id ?? null, ids.device_id ?? null,
    action, JSON.stringify(details), Date.now());
}

module.exports = { db, audit };
