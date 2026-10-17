'use strict';

const pool = require('./db');

// CHECK THESE: copy symbol, name and price from SAMPLE_STOCKS in your script.js.
// Your screenshot showed prices different from my original for two stocks
// (780.25 and 270.90), so make these match YOUR file exactly.
const STOCKS = [
  ['RELIANCE',  'Reliance Industries',        2950.00],
  ['TCS',       'Tata Consultancy Services',  4120.50],
  ['HDFCBANK',  'HDFC Bank',                  1685.25],
  ['INFY',      'Infosys',                    1790.80],
  ['ICICIBANK', 'ICICI Bank',                 1245.60],
  ['ITC',       'ITC Limited',                 468.90]
];

// IF NOT EXISTS makes this script safe to run more than once.
const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
     id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     name          VARCHAR(100) NOT NULL,
     email         VARCHAR(255) NOT NULL UNIQUE,
     password_hash VARCHAR(255) NOT NULL,
     created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS stocks (
     symbol VARCHAR(20)   PRIMARY KEY,
     name   VARCHAR(100)  NOT NULL,
     price  DECIMAL(12,2) NOT NULL
   ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS transactions (
     id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
     user_id    INT UNSIGNED  NOT NULL,
     symbol     VARCHAR(20)   NOT NULL,
     type       ENUM('BUY','SELL') NOT NULL,
     quantity   INT UNSIGNED  NOT NULL,
     price      DECIMAL(12,2) NOT NULL,
     total      DECIMAL(14,2) NOT NULL,
     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (symbol)  REFERENCES stocks(symbol)
   ) ENGINE=InnoDB`,

  `CREATE TABLE IF NOT EXISTS watchlist (
     user_id INT UNSIGNED NOT NULL,
     symbol  VARCHAR(20)  NOT NULL,
     PRIMARY KEY (user_id, symbol),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (symbol)  REFERENCES stocks(symbol)
   ) ENGINE=InnoDB`
];

async function main() {
  try {
    for (const sql of TABLES) {
      await pool.query(sql);
    }
    for (const [symbol, name, price] of STOCKS) {
      // If the stock already exists, update its name and price instead of failing.
      await pool.query(
        `INSERT INTO stocks (symbol, name, price) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price)`,
        [symbol, name, price]
      );
    }

    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables:', tables.map(function (t) { return Object.values(t)[0]; }).join(', '));
    const [stocks] = await pool.query('SELECT symbol, name, price FROM stocks ORDER BY symbol');
    console.table(stocks);
    console.log('Database setup complete.');
  } catch (err) {
    console.error('Setup FAILED.');
    console.error('Code   :', err.code);
    console.error('Message:', err.message);
  } finally {
    await pool.end();
  }
}

main();