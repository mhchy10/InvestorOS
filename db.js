
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const caPath = path.join(__dirname, 'ca.pem');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true
  },

 waitForConnections: false,
connectionLimit: 5,
connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

module.exports = pool;
