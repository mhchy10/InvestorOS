'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;



app.get('/api/test-route', function (req, res) {
  res.json({ success: true, message: 'Test route works' });
});

console.log('TEST ROUTE REGISTERED AT STARTUP');



// Refuse to start without a secret, so sessions are never left unprotected.
if (!process.env.SESSION_SECRET) {
  console.error('Missing SESSION_SECRET in .env. Server not started.');
  process.exit(1);
}

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,          // only create a session once someone logs in
  cookie: {
    httpOnly: true,                  // JavaScript in the browser cannot read this cookie
    sameSite: 'lax',                 // blocks most cross-site request abuse
    maxAge: 1000 * 60 * 60 * 8       // 8 hours
    // When deployed on HTTPS, also set: secure: true
  }
}));
// NOTE: sessions are kept in memory, so everyone is logged out when the server restarts.


/* ===== Serve the existing frontend (only these files are public) ===== */
app.get('/', function (req, res) { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/style.css', function (req, res) { res.sendFile(path.join(__dirname, 'style.css')); });
app.get('/script.js', function (req, res) { res.sendFile(path.join(__dirname, 'script.js')); });
app.use('/asset', express.static(path.join(__dirname, 'asset')));


/* ===== Helpers ===== */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used so a wrong email takes as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Put this before any route that needs a logged-in user.
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in.' });
  next();
}

// Starts a fresh session for the user (prevents session fixation).
function startSession(req, res, user, status) {
  req.session.regenerate(function (err) {
    if (err) return res.status(500).json({ error: 'Could not start session.' });
    req.session.userId = user.id;
    res.status(status).json({ id: user.id, name: user.name, email: user.email });
  });
}


/* ===== Auth routes ===== */
app.post('/api/register', async function (req, res) {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Name must be 2 to 100 characters.' });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  // bcrypt only reads the first 72 bytes, so longer passwords are rejected.
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Password must be at least 8 characters (maximum 72 bytes).' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash]
    );
    startSession(req, res, { id: result.insertId, name: name, email: email }, 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    console.error('Register failed:', err.code, err.message, err.cause?.message);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async function (req, res) {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?', [email]
    );
    const user = rows[0];
    const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !matches) {
      // Same message for both cases, so attackers can't tell which emails exist.
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    startSession(req, res, user, 200);
  } catch (err) {
    console.error('Login failed:', err.code);
    res.status(500).json({ error: 'Could not log in.' });
  }
});

app.post('/api/logout', function (req, res) {
  req.session.destroy(function () {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Who am I? The frontend will use this to check if someone is logged in.
app.get('/api/me', requireLogin, async function (req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, is_admin FROM users WHERE id = ?', [req.session.userId]
    );
    if (!rows[0]) {
      return req.session.destroy(function () {
        res.status(401).json({ error: 'Please log in.' });
      });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Load profile failed:', err.code);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});



/* ===== Visitor Feedback ===== */

// Save feedback from a logged-in user.
app.post('/api/feedback', requireLogin, async function (req, res) {
  const body = req.body || {};
  const rating = Number(body.rating);
  const feature = typeof body.feature === 'string' ? body.feature.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';

  const allowedFeatures = [
    'Market Research',
    'Watchlist',
    'Portfolio',
    'Paper Trading',
    'Investment Journal',
    'Other'
  ];

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Please select a rating from 1 to 5.' });
  }

  if (!allowedFeatures.includes(feature)) {
    return res.status(400).json({ error: 'Please select a valid feature.' });
  }

  if (message.length < 5 || message.length > 2000) {
    return res.status(400).json({ error: 'Message must be 5 to 2000 characters.' });
  }

  if (contact.length > 255) {
    return res.status(400).json({ error: 'Contact detail is too long.' });
  }

  try {
    await pool.query(
      'INSERT INTO feedback (user_id, rating, feature, message, contact) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, rating, feature, message, contact || null]
    );

    res.status(201).json({ ok: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    console.error('Feedback submission failed:', err.code);
    res.status(500).json({ error: 'Could not submit feedback. Please try again.' });
  }
});


// Admin-only inbox. Admin status is checked against MySQL every time.
app.get('/api/admin/feedback', requireLogin, async function (req, res) {
  try {
    const [users] = await pool.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (!users.length || Number(users[0].is_admin) !== 1) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const [rows] = await pool.query(`
      SELECT
        f.id,
        f.rating,
        f.feature,
        f.message,
        f.contact,
        f.created_at,
        u.name AS user_name,
        u.email AS user_email
      FROM feedback f
      JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT 100
    `);

    res.json(rows);
  } catch (err) {
    console.error('Admin feedback load failed:', err.code);
    res.status(500).json({ error: 'Could not load feedback.' });
  }
});


/* ===== Existing routes from Stage 3 ===== */

// Clears this user's trades, which returns their cash to ₹10,00,000.
app.post('/api/reset', requireLogin, async function (req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.session.userId]);
    await conn.query('DELETE FROM transactions WHERE user_id = ?', [req.session.userId]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    console.error('Reset failed:', err.code);
    res.status(500).json({ error: 'Could not reset simulation.' });
  } finally {
    conn.release();
  }
});

/* ===== Paper trading (Stage 5) ===== */
const STARTING_CASH_CENTS = 1000000 * 100;   // ₹10,00,000 in paise
const MAX_QUANTITY = 100000;

function toCents(value) { return Math.round(Number(value) * 100); }
function fromCents(cents) { return cents / 100; }

// Replays a user's transactions in order and returns cash and holdings.
// Same logic as the frontend: a partial sell removes cost at the average price.
function replayLedger(rows) {
  let cash = STARTING_CASH_CENTS;
  const holdings = new Map();   // symbol -> { quantity, cost } (cost in paise)
  for (const t of rows) {
    const total = toCents(t.total);
    let h = holdings.get(t.symbol);
    if (t.type === 'BUY') {
      cash -= total;
      if (!h) { h = { quantity: 0, cost: 0 }; holdings.set(t.symbol, h); }
      h.quantity += t.quantity;
      h.cost += total;
    } else if (h) {
      cash += total;
      const removed = (t.quantity === h.quantity)
        ? h.cost
        : Math.round(h.cost * t.quantity / h.quantity);
      h.quantity -= t.quantity;
      h.cost -= removed;
      if (h.quantity === 0) holdings.delete(t.symbol);
    }
  }
  return { cash: cash, holdings: holdings };
}

const LEDGER_SQL =
  'SELECT symbol, type, quantity, total FROM transactions WHERE user_id = ? ORDER BY id ASC';

// Cash, holdings and totals, calculated fresh from the ledger.
app.get('/api/portfolio', requireLogin, async function (req, res) {
  try {
    const [ledger] = await pool.query(LEDGER_SQL, [req.session.userId]);
    const [stockRows] = await pool.query('SELECT symbol, name, price FROM stocks');
    const stocks = new Map(stockRows.map(function (s) { return [s.symbol, s]; }));

    const state = replayLedger(ledger);
    let invested = 0;
    let holdingsValue = 0;
    const holdings = [];

    Array.from(state.holdings.keys()).sort().forEach(function (symbol) {
      const h = state.holdings.get(symbol);
      const stock = stocks.get(symbol);
      if (!stock) return;
      const priceCents = toCents(stock.price);
      const value = h.quantity * priceCents;
      invested += h.cost;
      holdingsValue += value;
      holdings.push({
        symbol: symbol,
        name: stock.name,
        quantity: h.quantity,
        avgPrice: fromCents(h.cost / h.quantity),
        price: fromCents(priceCents),
        invested: fromCents(h.cost),
        value: fromCents(value),
        pnl: fromCents(value - h.cost)
      });
    });

    res.json({
      cash: fromCents(state.cash),
      invested: fromCents(invested),
      holdingsValue: fromCents(holdingsValue),
      totalValue: fromCents(state.cash + holdingsValue),
      pnl: fromCents(holdingsValue - invested),
      holdings: holdings
    });
  } catch (err) {
    console.error('Portfolio failed:', err.code);
    res.status(500).json({ error: 'Could not load portfolio.' });
  }
});

// Transaction history, newest first.
app.get('/api/transactions', requireLogin, async function (req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.symbol, s.name, t.type, t.quantity, t.price, t.total, t.created_at
         FROM transactions t JOIN stocks s ON s.symbol = t.symbol
        WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 200`,
      [req.session.userId]
    );
    res.json(rows.map(function (r) {
      return {
        id: r.id, symbol: r.symbol, name: r.name, type: r.type,
        quantity: r.quantity, price: Number(r.price), total: Number(r.total),
        time: r.created_at
      };
    }));
  } catch (err) {
    console.error('Transactions failed:', err.code);
    res.status(500).json({ error: 'Could not load transactions.' });
  }
});

// Place a trade. Body: { side: 'BUY' | 'SELL', symbol: 'TCS', quantity: 10 }
app.post('/api/trade', requireLogin, async function (req, res) {
  const body = req.body || {};
  const side = body.side;
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const quantity = body.quantity;

  if (side !== 'BUY' && side !== 'SELL') {
    return res.status(400).json({ error: 'Trade type must be BUY or SELL.' });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return res.status(400).json({ error: 'Quantity must be a whole number from 1 to ' + MAX_QUANTITY + '.' });
  }

  const userId = req.session.userId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock this user's row so two trades by the same user run one after the other.
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);

    const [stockRows] = await conn.query(
      'SELECT symbol, name, price FROM stocks WHERE symbol = ?', [symbol]
    );
    if (!stockRows[0]) {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown stock.' });
    }
    const priceCents = toCents(stockRows[0].price);
    const totalCents = priceCents * quantity;

    const [ledger] = await conn.query(LEDGER_SQL, [userId]);
    const state = replayLedger(ledger);

    if (side === 'BUY' && totalCents > state.cash) {
      await conn.rollback();
      return res.status(400).json({
        error: 'Insufficient cash: this costs ' + fromCents(totalCents).toFixed(2) +
               ' but you have ' + fromCents(state.cash).toFixed(2) + '.'
      });
    }
    if (side === 'SELL') {
      const held = state.holdings.get(symbol);
      const owned = held ? held.quantity : 0;
      if (quantity > owned) {
        await conn.rollback();
        return res.status(400).json({ error: 'You own only ' + owned + ' share(s) of ' + symbol + '.' });
      }
    }

    await conn.query(
      'INSERT INTO transactions (user_id, symbol, type, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, symbol, side, quantity, fromCents(priceCents), fromCents(totalCents)]
    );
    await conn.commit();

    res.status(201).json({
      ok: true, side: side, symbol: symbol, quantity: quantity,
      price: fromCents(priceCents), total: fromCents(totalCents)
    });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    console.error('Trade failed:', err.code);
    res.status(500).json({ error: 'Could not place trade.' });
  } finally {
    conn.release();
  }
});



app.get('/api/health', async function (req, res) {
  const startedAt = Date.now();
  console.log('[HEALTH] Request received');

  try {
    console.log('[HEALTH] Starting database query');

    await pool.query('SELECT 1');

    console.log(
      '[HEALTH] Database query completed in',
      Date.now() - startedAt,
      'ms'
    );

    res.json({
      status: 'ok',
      database: 'connected',
      responseTimeMs: Date.now() - startedAt
    });
  } catch (err) {
    console.error(
      '[HEALTH] Database query failed:',
      err.code || 'UNKNOWN',
      err.message
    );

    res.status(500).json({
      status: 'error',
      database: 'unreachable'
    });
  }
});


const initialStockPrices = new Map();


app.get('/api/stocks', async function (req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT symbol, name, price FROM stocks ORDER BY symbol'
    );

    res.json(rows.map(function (r) {
      const price = Number(r.price);

      if (!initialStockPrices.has(r.symbol)) {
        initialStockPrices.set(r.symbol, price);
      }

      const initialPrice = initialStockPrices.get(r.symbol);
      const changePct = initialPrice > 0
        ? ((price - initialPrice) / initialPrice) * 100
        : 0;

      return {
        symbol: r.symbol,
        name: r.name,
        price: price,
        changePct: changePct
      };
    }));
  } catch (err) {
    console.error('Could not load stocks:', err.code);
    res.status(500).json({ error: 'Could not load stocks.' });
  }
});




/* SIMULATED MARKET AND SAVED PRICE HISTORY */

async function initializeMarketHistory() {
  const [stocks] = await pool.query(
    'SELECT symbol, price FROM stocks'
  );

  for (const stock of stocks) {
    const [existing] = await pool.query(
      'SELECT COUNT(*) AS total FROM stock_price_history WHERE symbol = ?',
      [stock.symbol]
    );

    // Seed history only once for each stock.
    if (Number(existing[0].total) > 0) continue;

    const currentPrice = Number(stock.price);
    const historyRows = [];
    const now = new Date();

    // Create 365 days of illustrative history.
    for (let i = 364; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      let price = currentPrice;

      if (i > 0) {
        const wave =
          0.10 * Math.sin(i / 18) +
          0.05 * Math.sin(i / 47);

        const noise = (Math.random() - 0.5) * 0.04;

        price = currentPrice * (1 + wave + noise);
      }

      // Format date as MySQL DATETIME.
      const recordedAt =
        date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0') + ':' +
        String(date.getSeconds()).padStart(2, '0');

      historyRows.push([
        stock.symbol,
        Number(price.toFixed(2)),
        recordedAt
      ]);
    }

    await pool.query(
      'INSERT INTO stock_price_history (symbol, price, recorded_at) VALUES ?',
      [historyRows]
    );
  }

  console.log('Illustrative stock price history is ready.');
}

console.log('SERVER FILE:', __filename);
console.log('CURRENT DIRECTORY:', process.cwd());

// API endpoint for the chart's saved historical prices.
app.get('/api/market/history/:symbol', async function (req, res) {
   console.log('HISTORY API REQUEST RECEIVED:', req.params.symbol);

  try {
    const symbol = String(req.params.symbol).toUpperCase();

    const ranges = {
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '1Y': 365
    };

    const range = String(req.query.range || '1M').toUpperCase();
    const days = ranges[range] || 30;

    const [rows] = await pool.query(
      `SELECT price, recorded_at
       FROM stock_price_history
       WHERE symbol = ?
         AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY recorded_at ASC`,
      [symbol, days]
    );

    res.json({
      symbol,
      range,
      history: rows.map(function (row) {
        return {
          price: Number(row.price),
          recorded_at: row.recorded_at
        };
      })
    });
  } catch (err) {
    console.error('Could not load price history:', err.code);
    res.status(500).json({ error: 'Could not load price history.' });
  }
});

// Move simulated prices every five minutes.
async function updateSimulatedPrices() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [stocks] = await connection.query(
      'SELECT symbol, price FROM stocks FOR UPDATE'
    );

    for (const stock of stocks) {
      const oldPrice = Number(stock.price);

      // Small random movement: approximately -0.3% to +0.3%.
      const movement = (Math.random() - 0.5) * 0.006;
      const newPrice = Math.max(
        0.01,
        Number((oldPrice * (1 + movement)).toFixed(2))
      );

      await connection.query(
        'UPDATE stocks SET price = ? WHERE symbol = ?',
        [newPrice, stock.symbol]
      );

      await connection.query(
  'INSERT INTO stock_price_history (symbol, price, recorded_at) VALUES (?, ?, NOW())',
  [stock.symbol, newPrice]
);
    }

    await connection.commit();
    console.log('Simulated stock prices updated.');
  } catch (err) {
    await connection.rollback();
    console.error('Simulated price update failed:', err.code);
  } finally {
    connection.release();
  }
}

// Prepare initial history before starting automatic price updates.
// Prepare history, then start automatic simulated price updates.
initializeMarketHistory()
  .then(function () {
    updateSimulatedPrices(); // First update immediately
    setInterval(updateSimulatedPrices, 1 * 1000); // Every 30 seconds
  })
  .catch(function (err) {
    console.error('Could not initialize market history:', err.code);
  });



app.get('/api/test-route', function (req, res) {
  res.json({ success: true, message: 'InvestorOS route works' });
});  

app.listen(PORT, function () {
  console.log('InvestorOS server running at http://localhost:' + PORT);
});