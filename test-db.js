'use strict';

const pool = require('./db');

async function main() {
  try {
    const [rows] = await pool.query(
      'SELECT 1 + 1 AS result, DATABASE() AS db, CURRENT_USER() AS user_name'
    );
    console.log('Connected to MySQL successfully.');
    console.log(rows[0]);
  } catch (err) {
    console.error('Connection FAILED.');
    console.error('Code   :', err.code);
    console.error('Message:', err.message);
  } finally {
    await pool.end();   // closes connections so the script can exit
  }
}

main();