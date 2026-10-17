'use strict';

// Loads the values from .env into process.env (a place to read settings from).
require('dotenv').config();

const mysql = require('mysql2/promise');

// A "pool" keeps a few connections open and reuses them,
// which is faster than reconnecting for every request.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;