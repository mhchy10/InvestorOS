'use strict';

/* =====================================================================
   InvestorOS — front end (vanilla JavaScript) connected to the Express/MySQL server

   The browser no longer keeps the trading data. The server does:
     - who you are        -> /api/me, /api/login, /api/register, /api/logout
     - sample stocks      -> /api/stocks
     - cash and holdings  -> /api/portfolio  (calculated by the server from your trades)
     - trade history      -> /api/transactions
     - place a trade      -> /api/trade
     - reset simulation   -> /api/reset

   Still saved in this browser (localStorage): theme/density/landing page,
   and the watchlist (saved separately for each user).

   Flow after every action:  ask the server -> store the answer -> re-render.
   ===================================================================== */


/* ============ 1. CONFIG ============ */

const MAX_QUANTITY = 100000;                        // same limit the server enforces
const WATCHLIST_KEY_PREFIX = 'investoros.watchlist.v1.';

// Display-only illustrative daily change (%). Not stored in the database yet.
const SAMPLE_CHANGE_PCT = {
    RELIANCE: 0.85,
    TCS: -0.40,
    HDFCBANK: 0.62,
    INFY: -1.10,
    ICICIBANK: 0.30,
    ITC: 0.15,

    SBIN: 0.72,
    AXISBANK: -0.35,
    WIPRO: -0.68,
    MARUTI: 0.54,
    TATAMOTORS: -1.25,
    BHARTIARTL: 0.91,
    LT: 0.43,
    SUNPHARMA: -0.27,
    HINDUNILVR: 0.18
};

  // DEMONSTRATION fundamentals. Invented for this project. NOT real company data.
// debtEquity is null for banks (the ratio is not meaningful for them).
const DEMO_FUNDAMENTALS = {
  RELIANCE:  { sector: 'Energy & Retail', pe: 24.5, pb: 2.1,  divYield: 0.35, roe: 9.0,  debtEquity: 0.40, revGrowth: 8.0,  margin: 8.0 },
  TCS:       { sector: 'IT Services',     pe: 28.0, pb: 13.0, divYield: 1.60, roe: 50.0, debtEquity: 0.05, revGrowth: 6.0,  margin: 19.0 },
  HDFCBANK:  { sector: 'Banking',         pe: 18.5, pb: 2.6,  divYield: 1.10, roe: 14.0, debtEquity: null, revGrowth: 12.0, margin: 22.0 },
  INFY:      { sector: 'IT Services',     pe: 25.0, pb: 7.5,  divYield: 2.50, roe: 31.0, debtEquity: 0.10, revGrowth: 5.0,  margin: 17.0 },
  ICICIBANK: { sector: 'Banking',         pe: 17.5, pb: 3.0,  divYield: 0.80, roe: 17.0, debtEquity: null, revGrowth: 14.0, margin: 24.0 },
  ITC:       { sector: 'FMCG',            pe: 26.0, pb: 7.0,  divYield: 3.20, roe: 28.0, debtEquity: 0.00, revGrowth: 7.0,  margin: 27.0 },
    SBIN:       { sector: 'Banking', pe: 10.5, pb: 1.5, divYield: 1.5, roe: 17, debtEquity: null, revGrowth: 10, margin: 20 },
  AXISBANK:   { sector: 'Banking', pe: 12.0, pb: 1.8, divYield: 0.1, roe: 17, debtEquity: null, revGrowth: 12, margin: 20 },
  WIPRO:      { sector: 'IT Services', pe: 20.0, pb: 3.0, divYield: 3.0, roe: 17, debtEquity: 0.1, revGrowth: 4, margin: 16 },
  MARUTI:     { sector: 'Automobile', pe: 30.0, pb: 5.0, divYield: 1.0, roe: 16, debtEquity: 0.0, revGrowth: 10, margin: 11 },
  TATAMOTORS: { sector: 'Automobile', pe: 8.0, pb: 2.0, divYield: 0.5, roe: 25, debtEquity: 1.0, revGrowth: 8, margin: 8 },
  BHARTIARTL: { sector: 'Telecom', pe: 35.0, pb: 7.0, divYield: 0.7, roe: 15, debtEquity: 1.0, revGrowth: 15, margin: 20 },
  LT:         { sector: 'Infrastructure', pe: 30.0, pb: 5.0, divYield: 0.8, roe: 16, debtEquity: 1.0, revGrowth: 12, margin: 8 },
  SUNPHARMA:  { sector: 'Pharmaceuticals', pe: 35.0, pb: 6.0, divYield: 0.8, roe: 17, debtEquity: 0.1, revGrowth: 10, margin: 20 },
  HINDUNILVR: { sector: 'FMCG', pe: 45.0, pb: 10.0, divYield: 1.5, roe: 20, debtEquity: 0.1, revGrowth: 5, margin: 16 }
};

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  market: 'Market Research',
  watchlist: 'Watchlist',
  portfolio: 'Portfolio',
  trading: 'Paper Trading',
  journal: 'Investment Journal',
  settings: 'Settings'
};


/* ============ SMALL HELPERS ============ */

function $(id) { return document.getElementById(id); }

// Round to 2 decimals (paise). "|| 0" turns -0 into 0 so we never print "-₹0.00".
function round2(n) { return (Math.round(n * 100) / 100) || 0; }

var inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatINR(n) { return inrFormatter.format(round2(n)); }

function formatSignedINR(n) {
  var r = round2(n);
  return (r > 0 ? '+' : '') + formatINR(r);
}

function formatSignedPct(n) {
  var r = round2(n);
  return (r > 0 ? '+' : '') + r.toFixed(2) + '%';
}

// CSS class for colouring: gain (green), loss (red) or none
function signClass(n) {
  var r = round2(n);
  if (r > 0) return 'gain';
  if (r < 0) return 'loss';
  return '';
}

function shareWord(n) { return n === 1 ? 'share' : 'shares'; }

function formatDateTime(iso) {
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* DOM builder. Text is set with textContent, which treats it as plain text
   (never as HTML), so user input can't inject markup or scripts. */
function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function showNotice(text) {
  var box = $('app-notice');
  box.textContent = text;
  box.hidden = false;
}

function hideNotice() { $('app-notice').hidden = true; }


/* ============ 2. STATE (filled from the server) ============ */

function emptyAccount() {
  return { cash: 0, invested: 0, holdingsValue: 0, totalValue: 0, pnl: 0, holdings: [] };
}

var currentUser = null;            // { id, name, email } while logged in
var stocks = [];                   // from /api/stocks
var stockBySymbol = new Map();
var stockPriceHistory = new Map();  
var firstSeenStockPrices = new Map();   // symbol -> stock
var account = emptyAccount();      // from /api/portfolio
var transactions = [];             // from /api/transactions (newest first)
var watchlist = [];                // array of symbols (localStorage, per user)


/* ============ 3. TALKING TO THE SERVER ============ */

/* One helper for every request. It always returns { ok, status, data } and never
   throws, so the rest of the code only has to check result.ok. */
async function api(method, url, body) {
  var options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  var response;
  try {
    response = await fetch(url, options);   // the login cookie is sent automatically
  } catch (err) {
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Is it running?' } };
  }
  var data = {};
  try { data = await response.json(); } catch (err) { /* empty or non-JSON body */ }

  // A 401 on a normal request means the login expired (e.g. the server restarted).
  if (response.status === 401 && url !== '/api/login' && url !== '/api/register' && url !== '/api/me') {
    showAuth('Your session ended. Please log in again.');
  }
  return { ok: response.ok, status: response.status, data: data };
}

function rebuildStockMap() {
  stockBySymbol = new Map(stocks.map(function (s) { return [s.symbol, s]; }));
}

// Loads only the parts that change after a trade: cash, holdings and history.
async function refreshAccount() {
  var results = await Promise.all([api('GET', '/api/portfolio'), api('GET', '/api/transactions')]);
  if (!results[0].ok || !results[1].ok) {
    if (currentUser) showNotice('Could not refresh your data from the server.');
    return false;
  }
  account = results[0].data;
  transactions = results[1].data;
  return true;
}

// Loads everything: stocks, portfolio, history.
async function loadData() {
  var results = await Promise.all([
    api('GET', '/api/stocks'),
    api('GET', '/api/portfolio'),
    api('GET', '/api/transactions')
  ]);
  if (!results[0].ok || !results[1].ok || !results[2].ok) return false;
  stocks = results[0].data;
  rebuildStockMap();
  account = results[1].data;
  transactions = results[2].data;
  return true;
}


/* Automatically refresh simulated prices and portfolio values. */
var autoRefreshTimer = null;
var autoRefreshBusy = false;

async function refreshSimulationData() {
  if (!currentUser || document.hidden || autoRefreshBusy) return;

  autoRefreshBusy = true;

  try {
    var results = await Promise.all([
      api('GET', '/api/stocks'),
      api('GET', '/api/portfolio')
    ]);

    if (!currentUser || !results[0].ok || !results[1].ok) return;

    stocks = results[0].data;

    stocks.forEach(function (stock) {
  if (!stockPriceHistory.has(stock.symbol)) {
    stockPriceHistory.set(stock.symbol, []);
  }

  var history = stockPriceHistory.get(stock.symbol);
  history.push(Number(stock.price));

  if (history.length > 40) {
    history.shift();
  }
});
    rebuildStockMap();
    account = results[1].data;

    var p = portfolioView();

    // Update the existing views without rebuilding the entire page.
    renderSummaryCards(p);
    renderMarket();
    renderWatchlist();
    renderResearch();
    renderCompare();
    renderHoldings(p);
    renderOverview(p);

    // Keep the trading dropdown and preview up to date.
    if (document.activeElement !== $('trade-stock')) {
      populateStockSelect();
    }
    updateTradePreview();

    // Update the sample chart only while Market Research is open.
    if (
      !$('view-market').hidden &&
      document.activeElement !== $('chart-stock')
    ) {
      renderStockChart();
    }
  } finally {
    autoRefreshBusy = false;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) return;

  autoRefreshTimer = setInterval(function () {
    refreshSimulationData();
  }, 1000);
}



/* ============ 4. WATCHLIST (localStorage, per user) ============ */

function loadWatchlist() {
  watchlist = [];
  try {
    var saved = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY_PREFIX + currentUser.id));
    if (Array.isArray(saved)) {
      saved.forEach(function (sym) {
        if (stockBySymbol.has(sym) && watchlist.indexOf(sym) === -1) watchlist.push(sym);
      });
    }
  } catch (err) { /* unreadable data: start with an empty watchlist */ }
}

function saveWatchlist() {
  try {
    window.localStorage.setItem(WATCHLIST_KEY_PREFIX + currentUser.id, JSON.stringify(watchlist));
  } catch (err) {
    showNotice('Could not save the watchlist in this browser.');
  }
}

function toggleWatch(symbol) {
  var i = watchlist.indexOf(symbol);
  if (i === -1) watchlist.push(symbol);
  else watchlist.splice(i, 1);
  saveWatchlist();
  renderAll();
}


/* ============ 5. PORTFOLIO VIEW ============ */

/* The server already calculated the money values. This only adds the profit
   percentages (profit / invested x 100), which are for display. */
function portfolioView() {
  var rows = account.holdings.map(function (h) {
    return Object.assign({}, h, { pnlPct: h.invested > 0 ? (h.pnl / h.invested) * 100 : 0 });
  });
  return {
    rows: rows,
    cash: account.cash,
    invested: account.invested,
    holdingsValue: account.holdingsValue,
    totalValue: account.totalValue,
    pnl: account.pnl,
    pnlPct: account.invested > 0 ? (account.pnl / account.invested) * 100 : 0
  };
}


/* ============ 6. RENDERING ============ */

/* Generic table builder.
   columns: [{ label, numeric, render(row) -> string | Node }]  */
function renderTable(container, columns, rows, emptyText) {
  container.replaceChildren();
  if (rows.length === 0) {
    container.appendChild(el('p', 'empty-state', emptyText));
    return;
  }
  var table = el('table', 'data-table');
  var thead = el('thead');
  var headRow = el('tr');
  columns.forEach(function (c) {
    var th = el('th', c.numeric ? 'num' : '', c.label);
    th.scope = 'col';
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = el('tbody');
  rows.forEach(function (row) {
    var tr = el('tr');
    columns.forEach(function (c) {
      var td = el('td', c.numeric ? 'num' : '');
      var content = c.render(row);
      if (content instanceof Node) td.appendChild(content);
      else td.textContent = String(content);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// Works for any object that has a name and a symbol (stocks, holdings, transactions).
function stockCell(item) {
  var wrap = el('div', 'stock-cell');
  wrap.append(el('span', 'stock-name', item.name), el('span', 'stock-symbol', item.symbol));
  return wrap;
}

function coloredText(text, cls) { return el('span', cls, text); }



function changeCell(symbol) {
  var stock = stockBySymbol.get(symbol);
  if (!stock || typeof stock.price !== 'number') {
    return '—';
  }

  if (!firstSeenStockPrices.has(symbol)) {
    firstSeenStockPrices.set(symbol, stock.price);
  }

  var startingPrice = firstSeenStockPrices.get(symbol);
  var pct = startingPrice > 0
    ? ((stock.price - startingPrice) / startingPrice) * 100
    : 0;

  return coloredText(
    formatSignedPct(pct),
    signClass(pct)
  );
}



function tradeButton(symbol) {
  var btn = el('button', 'btn btn-small', 'Trade');
  btn.type = 'button';
  btn.addEventListener('click', function () { goToTrade(symbol); });
  return btn;
}

function watchButton(symbol, removeMode) {
  var watching = watchlist.indexOf(symbol) !== -1;
  var label = removeMode ? 'Remove' : (watching ? '★ Watching' : '☆ Watch');
  var btn = el('button', 'btn btn-small ' + (watching && !removeMode ? 'btn-active' : 'btn-ghost'), label);
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(watching));
  btn.addEventListener('click', function () { toggleWatch(symbol); });
  return btn;
}

function actionCell(stock, removeMode) {
  var wrap = el('div', 'cell-actions');
  wrap.append(watchButton(stock.symbol, removeMode), tradeButton(stock.symbol));
  return wrap;
}

/* Four summary cards, drawn into every element marked data-summary
   (one on the Dashboard, one on the Portfolio page). */
function renderSummaryCards(p) {
  var cards = [
    { label: 'Virtual cash', value: formatINR(p.cash), note: 'Available to trade. Not counted as invested.', tone: '' },
    { label: 'Invested', value: formatINR(p.invested), note: 'Purchase cost of current holdings', tone: '' },
    { label: 'Portfolio value', value: formatINR(p.totalValue), note: 'Cash + holdings at sample prices', tone: '' },
    { label: 'Unrealized P/L', value: formatSignedINR(p.pnl),
      note: p.rows.length ? formatSignedPct(p.pnlPct) + ' on invested amount' : 'No open positions',
      tone: signClass(p.pnl) }
  ];
  document.querySelectorAll('[data-summary]').forEach(function (container) {
    container.replaceChildren();
    cards.forEach(function (c) {
      var card = el('div', 'card');
      card.append(
        el('span', 'card-label', c.label),
        el('strong', 'card-value ' + c.tone, c.value),
        el('span', 'card-note', c.note)
      );
      container.appendChild(card);
    });
  });
}

function renderMarket() {
  var query = $('search-input').value.trim().toLowerCase();
  var rows = stocks.filter(function (s) {
    return s.name.toLowerCase().indexOf(query) !== -1 || s.symbol.toLowerCase().indexOf(query) !== -1;
  });
  renderTable($('market-table'), [
    { label: 'Stock', render: stockCell },
    { label: 'Sample price', numeric: true, render: function (s) { return formatINR(s.price); } },
    { label: 'Sample change', numeric: true, render: function (s) { return changeCell(s.symbol); } },
    { label: 'Actions', render: function (s) { return actionCell(s, false); } }
  ], rows, 'No stocks match your search.');
}

function renderWatchlist() {
  var rows = watchlist.map(function (sym) { return stockBySymbol.get(sym); }).filter(Boolean);
  renderTable($('watchlist-table'), [
    { label: 'Stock', render: stockCell },
    { label: 'Sample price', numeric: true, render: function (s) { return formatINR(s.price); } },
    { label: 'Sample change', numeric: true, render: function (s) { return changeCell(s.symbol); } },
    { label: 'Actions', render: function (s) { return actionCell(s, true); } }
  ], rows, 'Your watchlist is empty. Use the "Watch" button on the Dashboard to add stocks.');
}

function renderHoldings(p) {
  renderTable($('holdings-table'), [
    { label: 'Stock', render: stockCell },
    { label: 'Qty', numeric: true, render: function (r) { return r.quantity.toLocaleString('en-IN'); } },
    { label: 'Avg buy price', numeric: true, render: function (r) { return formatINR(r.avgPrice); } },
    { label: 'Sample price', numeric: true, render: function (r) { return formatINR(r.price); } },
    { label: 'Invested', numeric: true, render: function (r) { return formatINR(r.invested); } },
    { label: 'Current value', numeric: true, render: function (r) { return formatINR(r.value); } },
    { label: 'P/L', numeric: true, render: function (r) {
        return coloredText(formatSignedINR(r.pnl) + ' (' + formatSignedPct(r.pnlPct) + ')', signClass(r.pnl));
    } },
    { label: '', render: function (r) { return tradeButton(r.symbol); } }
  ], p.rows, 'You do not own any shares yet. Place a buy order on the Paper Trading page.');
}

function typeTag(type) {
  return el('span', 'tag ' + (type === 'BUY' ? 'tag-buy' : 'tag-sell'), type);
}

function renderHistory() {
  renderTable($('history-table'), [
    { label: 'Date & time', render: function (t) { return formatDateTime(t.time); } },
    { label: 'Type', render: function (t) { return typeTag(t.type); } },
    { label: 'Stock', render: stockCell },
    { label: 'Qty', numeric: true, render: function (t) { return t.quantity.toLocaleString('en-IN'); } },
    { label: 'Execution price', numeric: true, render: function (t) { return formatINR(t.price); } },
    { label: 'Total amount', numeric: true, render: function (t) { return formatINR(t.total); } }
  ], transactions, 'No transactions yet.');
}

function legendLine(dotClass, label, value) {
  var line = el('div', 'legend-line');
  var left = el('span');
  left.append(el('span', 'dot ' + dotClass), document.createTextNode(label));
  line.append(left, el('span', '', value));
  return line;
}

function renderOverview(p) {
  var box = $('overview');
  box.replaceChildren();

  var cashPct = p.totalValue > 0 ? (p.cash / p.totalValue) * 100 : 100;
  cashPct = Math.min(100, Math.max(0, cashPct));
  var holdPct = 100 - cashPct;

  var bar = el('div', 'alloc-bar');
  var cashSeg = el('div', 'alloc-cash');
  var invSeg = el('div', 'alloc-invested');
  cashSeg.style.width = cashPct.toFixed(2) + '%';   // numbers only, safe to put in style
  invSeg.style.width = holdPct.toFixed(2) + '%';
  bar.append(cashSeg, invSeg);
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', 'Allocation: ' + cashPct.toFixed(1) + '% cash, ' + holdPct.toFixed(1) + '% holdings');

  box.append(
    bar,
    legendLine('dot-cash', 'Cash (' + cashPct.toFixed(1) + '%)', formatINR(p.cash)),
    legendLine('dot-invested', 'Holdings at sample prices (' + holdPct.toFixed(1) + '%)', formatINR(p.holdingsValue)),
    legendLine('', 'Open positions', String(p.rows.length))
  );
}

function renderRecentActivity() {
  var box = $('recent-activity');
  box.replaceChildren();
  var recent = transactions.slice(0, 5);
  if (recent.length === 0) {
    box.appendChild(el('p', 'empty-state', 'No trades yet. Place your first paper trade.'));
    return;
  }
  var list = el('ul', 'activity');
  recent.forEach(function (t) {
    var li = el('li');
    var top = el('span');
    top.append(typeTag(t.type), document.createTextNode(
      ' ' + t.quantity + ' × ' + t.symbol + ' @ ' + formatINR(t.price)
    ));
    li.append(top, el('span', 'activity-time', formatDateTime(t.time) + ' · total ' + formatINR(t.total)));
    list.appendChild(li);
  });
  box.appendChild(list);
}

/* The small box under the trade form: price, shares owned, estimated total. */
function updateTradePreview() {
  var box = $('trade-preview');
  box.replaceChildren();
  var stock = stockBySymbol.get($('trade-stock').value);
  if (!stock) return;

  var holding = account.holdings.find(function (h) { return h.symbol === stock.symbol; });
  function line(label, value) {
    var row = el('div', 'preview-line');
    row.append(el('span', '', label), el('span', '', value));
    box.appendChild(row);
  }
  line('Sample price (illustrative)', formatINR(stock.price));
  line('Shares you own', holding ? holding.quantity.toLocaleString('en-IN') : '0');
  line('Cash available', formatINR(account.cash));

  var parsed = parseQuantity($('trade-qty').value);
  if (parsed.value) line('Estimated total', formatINR(stock.price * parsed.value));
}

function showTradeMessage(text, type) {
  var box = $('trade-message');
  box.textContent = text;
  box.className = 'message ' + (type || '');
}



function showTradeCelebration(side, trade) {
  var old = document.getElementById('trade-celebration');
  if (old) old.remove();

  var buying = side.toLowerCase() === 'buy';
  var card = document.createElement('div');

  card.id = 'trade-celebration';
  card.style.cssText =
    'position:fixed;top:24px;right:24px;z-index:99999;' +
    'width:300px;max-width:calc(100vw - 48px);padding:20px;' +
    'border-radius:16px;background:#111827;color:white;' +
    'font-family:Arial,sans-serif;line-height:1.9;' +
    'box-shadow:0 12px 35px #0006;' +
    'border:1px solid ' + (buying ? '#22c55e' : '#ef4444') + ';' +
    'opacity:0;transform:translateY(-10px);' +
    'transition:all .3s ease;';

  var heading = document.createElement('div');
  heading.textContent = buying
    ? '✓ BUY ORDER EXECUTED'
    : '✓ SELL ORDER EXECUTED';

  heading.style.color = buying ? '#4ade80' : '#f87171';
  heading.style.fontWeight = 'bold';
  heading.style.marginBottom = '10px';

  var details = document.createElement('div');
  details.textContent =
    'Stock: ' + trade.symbol +
    '\nQuantity: ' + trade.quantity +
    '\nPrice: ' + formatINR(trade.price) +
    '\nTotal: ' + formatINR(trade.total);

  details.style.whiteSpace = 'pre-line';

  card.appendChild(heading);
  card.appendChild(details);
  document.body.appendChild(card);

  requestAnimationFrame(function () {
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  });

  setTimeout(function () {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';

    setTimeout(function () {
      if (card.parentNode) card.remove();
    }, 350);
  }, 3000);
}




function playTradeSound(side) {
  try {
    var audio = new (window.AudioContext || window.webkitAudioContext)();

    function beep(frequency, startTime, duration) {
      var oscillator = audio.createOscillator();
      var volume = audio.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      volume.gain.setValueAtTime(0.001, startTime);
      volume.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(volume);
      volume.connect(audio.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    }

    var now = audio.currentTime;

    if (side.toLowerCase() === 'buy') {
      beep(660, now, 0.16);
      beep(880, now + 0.13, 0.22);
    } else {
      beep(880, now, 0.16);
      beep(660, now + 0.13, 0.22);
    }

    setTimeout(function () {
      audio.close();
    }, 1000);
  } catch (error) {
    // Sound is optional; trading should work without it.
  }
}







/* ===== Market Research (uses DEMO_FUNDAMENTALS) ===== */
var RESEARCH_METRICS = [
  { label: 'Sector',               text: function (f) { return f.sector; } },
  { label: 'P/E ratio',            text: function (f) { return f.pe.toFixed(1) + 'x'; } },
  { label: 'P/B ratio',            text: function (f) { return f.pb.toFixed(1) + 'x'; } },
  { label: 'Dividend yield',       text: function (f) { return f.divYield.toFixed(2) + '%'; } },
  { label: 'Return on equity',     text: function (f) { return f.roe.toFixed(1) + '%'; } },
  { label: 'Debt / equity',        text: function (f) { return f.debtEquity === null ? 'n/a' : f.debtEquity.toFixed(2); } },
  { label: 'Revenue growth (YoY)', text: function (f) { return f.revGrowth.toFixed(1) + '%'; } },
  { label: 'Net profit margin',    text: function (f) { return f.margin.toFixed(1) + '%'; } }
];

function researchStocks() {
  return stocks.filter(function (s) { return DEMO_FUNDAMENTALS[s.symbol]; });
}

function renderResearch() {
  var columns = [
    { label: 'Stock', render: stockCell },
    { label: 'Sample price', numeric: true, render: function (s) { return formatINR(s.price); } }
  ];
  RESEARCH_METRICS.forEach(function (m, i) {
    columns.push({
      label: m.label,
      numeric: i > 0,
      render: function (s) { return m.text(DEMO_FUNDAMENTALS[s.symbol]); }
    });
  });
  renderTable($('research-table'), columns, researchStocks(), 'No research data available.');
}



function renderStockChart() {
  var select = $('chart-stock');
  var box = $('stock-chart');

  if (!select || !box || !stocks.length) return;

  var previous = select.value;

  select.replaceChildren();
  stocks.forEach(function (stock) {
    select.appendChild(el(
      'option',
      '',
      stock.symbol + ' — ' + stock.name
    ));
    select.lastChild.value = stock.symbol;
  });

  if (stocks.some(function (s) { return s.symbol === previous; })) {
    select.value = previous;
  }

  var stock = stockBySymbol.get(select.value) || stocks[0];
  if (!stock) return;

  select.value = stock.symbol;

  // Generate a consistent illustrative trend around the sample price.
 // Use recorded simulated prices instead of generating a new trend.
var points = stockPriceHistory.get(stock.symbol) || [];
points = points.map(Number).filter(Number.isFinite);

if (points.length === 0) {
  points = [Number(stock.price)];
}

// Keep enough points to draw a visible line.
if (points.length === 1) {
  points.push(points[0]);
}

points = points.slice();

  var width = 700;
  var height = 240;
  var pad = 24;
  var min = Math.min.apply(null, points);
  var max = Math.max.apply(null, points);
  var range = max - min || 1;

  var coords = points.map(function (price, i) {
    return {
      x: pad + i * (width - pad * 2) / (points.length - 1),
      y: height - pad -
        (price - min) / range * (height - pad * 2)
    };
  });

  var line = coords.map(function (p) {
    return p.x + ',' + p.y;
  }).join(' ');

  box.replaceChildren();

  var heading = el('p', 'muted small',
    'Illustrative sample trend for ' + stock.name +
    ' (' + stock.symbol + ')'
  );

  var priceLabel = el('h3', '',
    'Sample price: ' + formatINR(stock.price)
  );


  var recordedHigh = Math.max.apply(null, points);
var recordedLow = Math.min.apply(null, points);

var recordedChange = points[0] !== 0
  ? ((points[points.length - 1] - points[0]) / points[0]) * 100
  : 0;

var statsLabel = el('p', 'small',
  'High: ' + formatINR(recordedHigh) +
  ' | Low: ' + formatINR(recordedLow) +
  ' | Change: ' +
  (recordedChange > 0 ? '+' : '') +
  recordedChange.toFixed(2) + '%'
);

  var chart = document.createElementNS(
    'http://www.w3.org/2000/svg', 'svg'
  );
  chart.setAttribute('viewBox', '0 0 700 240');
  chart.setAttribute('role', 'img');
  chart.setAttribute(
    'aria-label',
    'Illustrative price trend for ' + stock.name
  );
  chart.style.width = '100%';
  chart.style.height = 'auto';
  chart.style.display = 'block';

  [0.25, 0.5, 0.75].forEach(function (fraction) {
    var y = pad + fraction * (height - pad * 2);
    var grid = document.createElementNS(
      'http://www.w3.org/2000/svg', 'line'
    );
    grid.setAttribute('x1', pad);
    grid.setAttribute('x2', width - pad);
    grid.setAttribute('y1', y);
    grid.setAttribute('y2', y);
    grid.setAttribute('stroke', 'currentColor');
    grid.setAttribute('opacity', '0.15');
    chart.appendChild(grid);
  });

 
  // Determine the recent price direction.
  var previousPrice = points[points.length - 2];
  var lastPrice = points[points.length - 1];
  var firstPrice = points[0];

  var trendColor = lastPrice > previousPrice ? '#22c55e' :
    lastPrice < previousPrice ? '#ef4444' : '#38bdf8';

  // Add a subtle gradient below the price line.
  var defs = document.createElementNS(
    'http://www.w3.org/2000/svg', 'defs'
  );

  var gradient = document.createElementNS(
    'http://www.w3.org/2000/svg', 'linearGradient'
  );
  gradient.setAttribute('id', 'chart-area-gradient');
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('x2', '0');
  gradient.setAttribute('y2', '1');

  var stopTop = document.createElementNS(
    'http://www.w3.org/2000/svg', 'stop'
  );
  stopTop.setAttribute('offset', '0%');
  stopTop.setAttribute('stop-color', trendColor);
  stopTop.setAttribute('stop-opacity', '0.30');

  var stopBottom = document.createElementNS(
    'http://www.w3.org/2000/svg', 'stop'
  );
  stopBottom.setAttribute('offset', '100%');
  stopBottom.setAttribute('stop-color', trendColor);
  stopBottom.setAttribute('stop-opacity', '0.01');

  gradient.append(stopTop, stopBottom);
  defs.appendChild(gradient);
  chart.appendChild(defs);

  // Fill the area underneath the line.
  var area = document.createElementNS(
    'http://www.w3.org/2000/svg', 'polygon'
  );
  area.setAttribute(
    'points',
    line + ' ' +
    coords[coords.length - 1].x + ',' + (height - pad) + ' ' +
    coords[0].x + ',' + (height - pad)
  );
  area.setAttribute('fill', 'url(#chart-area-gradient)');
  chart.appendChild(area);

  // Draw the main price line.
  var polyline = document.createElementNS(
    'http://www.w3.org/2000/svg', 'polyline'
  );
  polyline.setAttribute('points', line);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', trendColor);
  polyline.setAttribute('stroke-width', '3');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  chart.appendChild(polyline);

  // Highlight the latest recorded price.
  var latestPoint = coords[coords.length - 1];

  var glow = document.createElementNS(
    'http://www.w3.org/2000/svg', 'circle'
  );
  glow.setAttribute('cx', latestPoint.x);
  glow.setAttribute('cy', latestPoint.y);
  glow.setAttribute('r', '9');
  glow.setAttribute('fill', trendColor);
  glow.setAttribute('opacity', '0.20');
  chart.appendChild(glow);

  var dot = document.createElementNS(
    'http://www.w3.org/2000/svg', 'circle'
  );
  dot.setAttribute('cx', latestPoint.x);
  dot.setAttribute('cy', latestPoint.y);
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', trendColor);
  dot.setAttribute('stroke', '#ffffff');
  dot.setAttribute('stroke-width', '1.5');
  chart.appendChild(dot);




  var note = el('p', 'muted small',
    'This generated trend is for demonstration only. ' +
    'It is not real historical or live market data.'
  );

  box.append(heading, priceLabel, statsLabel, chart, note);

  if (!select.dataset.chartBound) {
    select.addEventListener('change', renderStockChart);
    select.dataset.chartBound = 'true';
  }
}


function renderCompare() {
  var a = stockBySymbol.get($('compare-a').value);
  var b = stockBySymbol.get($('compare-b').value);
  var box = $('compare-table');
  if (!a || !b || a.symbol === b.symbol || !DEMO_FUNDAMENTALS[a.symbol] || !DEMO_FUNDAMENTALS[b.symbol]) {
    box.replaceChildren(el('p', 'empty-state', 'Choose two different companies to compare.'));
    return;
  }
  var rows = [{ label: 'Sample price', a: formatINR(a.price), b: formatINR(b.price) }];
  RESEARCH_METRICS.forEach(function (m) {
    rows.push({
      label: m.label,
      a: m.text(DEMO_FUNDAMENTALS[a.symbol]),
      b: m.text(DEMO_FUNDAMENTALS[b.symbol])
    });
  });
  renderTable(box, [
    { label: 'Metric', render: function (r) { return r.label; } },
    { label: a.name, numeric: true, render: function (r) { return r.a; } },
    { label: b.name, numeric: true, render: function (r) { return r.b; } }
  ], rows, '');
}

function populateCompareSelects() {
  var list = researchStocks();
  ['compare-a', 'compare-b'].forEach(function (id, index) {
    var select = $(id);
    var previous = select.value;
    select.replaceChildren();
    list.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.symbol;
      opt.textContent = s.name + ' (' + s.symbol + ')';
      select.appendChild(opt);
    });
    if (previous && stockBySymbol.has(previous)) select.value = previous;
    else if (list[index]) select.value = list[index].symbol;
  });
}

/* Redraw everything from the data in memory. */

/* Redraw everything from the data in memory. */
function renderAll() {
  var p = portfolioView();
  renderSummaryCards(p);
  renderMarket();
  renderWatchlist();
  renderResearch();
  renderStockChart();
  populateCompareSelects();
  renderCompare();
  renderHoldings(p);
  renderHistory();
  renderOverview(p);
  renderRecentActivity();
  updateTradePreview();
}


function populateStockSelect() {
  var select = $('trade-stock');
  var previous = select.value;
  select.replaceChildren();
  stocks.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.symbol;
    opt.textContent = s.symbol + ' — ' + s.name + ' (' + formatINR(s.price) + ')';
    select.appendChild(opt);
  });
  if (previous && stockBySymbol.has(previous)) select.value = previous;
}


/* ============ 7. NAVIGATION ============ */

function showView(name) {
  if (!Object.prototype.hasOwnProperty.call(VIEW_TITLES, name)) name = 'dashboard';
  document.querySelectorAll('.view').forEach(function (v) {
    v.hidden = (v.id !== 'view-' + name);
  });
  document.querySelectorAll('.nav-link').forEach(function (link) {
    if (link.getAttribute('data-view') === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('page-title').textContent = VIEW_TITLES[name];
  document.title = VIEW_TITLES[name] + ' — InvestorOS';
    if (name === 'market') histLoad(false);
  window.scrollTo(0, 0);
}

function goToTrade(symbol) {
  $('trade-stock').value = symbol;
  showView('trading');
  window.location.hash = 'trading';   // keeps the URL in sync
  updateTradePreview();
  $('trade-qty').focus();
}


/* ============ 8. SETTINGS (theme, density, landing page) ============ */

var SETTINGS_KEY = 'investoros.settings.v1';   // separate key from everything else
var DEFAULT_SETTINGS = { theme: 'dark', density: 'comfortable', landing: 'dashboard' };
var ALLOWED_SETTINGS = {
  theme: ['dark', 'light', 'system'],
  density: ['comfortable', 'compact'],
  landing: ['dashboard', 'watchlist', 'portfolio', 'trading']
};
var settings = Object.assign({}, DEFAULT_SETTINGS);
var systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// Read saved settings; any missing, corrupt or unexpected value falls back to its default.
function loadSettings() {
  var result = Object.assign({}, DEFAULT_SETTINGS);
  try {
    var saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved === 'object') {
      Object.keys(ALLOWED_SETTINGS).forEach(function (key) {
        if (ALLOWED_SETTINGS[key].indexOf(saved[key]) !== -1) result[key] = saved[key];
      });
    }
  } catch (err) { /* unreadable data: keep defaults */ }
  return result;
}

function saveSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) { /* storage blocked: the setting still works until refresh */ }
}

// Write the choices onto <html> as attributes. The CSS reacts to those attributes.
function applyAppearance() {
  var theme = settings.theme;
  if (theme === 'system') theme = systemDarkQuery.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-density', settings.density);
}

// Tick the radio buttons and select the dropdown option that match the saved settings.
function syncSettingsForm() {
  document.querySelectorAll('input[name="theme"], input[name="density"]').forEach(function (radio) {
    radio.checked = (radio.value === settings[radio.name]);
  });
  $('setting-landing').value = settings.landing;
}

function initSettings() {
  settings = loadSettings();
  applyAppearance();
  syncSettingsForm();

  // One listener for the whole page (event delegation): each radio/select reports to it.
  $('view-settings').addEventListener('change', function (e) {
    var key = e.target.name;
    if (!ALLOWED_SETTINGS[key] || ALLOWED_SETTINGS[key].indexOf(e.target.value) === -1) return;
    settings[key] = e.target.value;
    saveSettings();
    applyAppearance();
  });

  // If the OS theme changes while "System" is selected, follow it immediately.
  systemDarkQuery.addEventListener('change', function () {
    if (settings.theme === 'system') applyAppearance();
  });
}


/* ============ 9. TRADING ACTIONS ============ */

/* Turn the text in the quantity box into a validated whole number.
   Returns { value } on success or { error } with a message.
   (The server checks everything again. This only gives faster feedback.) */
function parseQuantity(rawValue) {
  var text = String(rawValue).trim();
  if (text === '') return { error: 'Enter a quantity.' };
  // Only digits allowed: rejects "-5", "2.5", "1e3", "abc".
  if (!/^\d+$/.test(text)) return { error: 'Quantity must be a whole number (digits only: no decimals or negatives).' };
  var qty = Number(text);
  if (qty < 1) return { error: 'Quantity must be at least 1.' };
  if (qty > MAX_QUANTITY) return { error: 'Quantity is too large. The maximum per order is ' + MAX_QUANTITY.toLocaleString('en-IN') + '.' };
  return { value: qty };
}

var tradeBusy = false;   // stops double-clicks from sending the same trade twice

function setTradeButtons(disabled) {
  $('buy-btn').disabled = disabled;
  $('sell-btn').disabled = disabled;
}

async function handleTrade(side) {
  if (tradeBusy) return;
  var parsed = parseQuantity($('trade-qty').value);
  if (parsed.error) {
    showTradeMessage(parsed.error, 'error');
    $('trade-qty').focus();
    return;
  }

  tradeBusy = true;
  setTradeButtons(true);
  var result = await api('POST', '/api/trade', {
    side: side,
    symbol: $('trade-stock').value,
    quantity: parsed.value
  });
  tradeBusy = false;
  setTradeButtons(false);

  if (!result.ok) {
    showTradeMessage(result.data.error || 'Trade failed.', 'error');
    return;
  }

  var t = result.data;
  showTradeCelebration(side, t);
  playTradeSound(side);

  var verb = side === 'BUY' ? 'Bought' : 'Sold';
  showTradeMessage(
    verb + ' ' + t.quantity + ' ' + shareWord(t.quantity) + ' of ' + t.symbol +
    ' at ' + formatINR(t.price) + ' for a total of ' + formatINR(t.total) + '.',
    'success'
  );
  $('trade-qty').value = '';
  await refreshAccount();
  renderAll();
}

async function handleReset() {
  var confirmed = window.confirm(
    'Reset the simulation?\n\n' +
    'Cash returns to ₹10,00,000, all holdings are removed and the transaction history is cleared. ' +
    'Your watchlist is kept.\n\nThis cannot be undone.'
  );
  if (!confirmed) return;

  var result = await api('POST', '/api/reset', {});
  if (!result.ok) {
    showTradeMessage(result.data.error || 'Could not reset the simulation.', 'error');
    return;
  }
  await refreshAccount();
  renderAll();
  showTradeMessage('Simulation reset. Virtual cash is back to ' + formatINR(account.cash) + '.', 'success');
}


/* ============ 10. LOGIN / REGISTER ============ */

var authMode = 'login';   // 'login' or 'register'
var authBusy = false;

function setAuthMessage(text, type) {
  var box = $('auth-message');
  box.textContent = text;
  box.className = 'message ' + (type || '');
}

function setAuthMode(mode) {
  authMode = mode;
  var isLogin = (mode === 'login');
  $('auth-name-field').hidden = isLogin;
  $('auth-title').textContent = isLogin ? 'Log in' : 'Create account';
  $('auth-submit').textContent = isLogin ? 'Log in' : 'Register';
  $('auth-switch-text').textContent = isLogin ? 'No account yet?' : 'Already registered?';
  $('auth-switch').textContent = isLogin ? 'Register' : 'Log in';
  $('auth-password').autocomplete = isLogin ? 'current-password' : 'new-password';
  setAuthMessage('', '');
}

// Hides the app, clears the data in memory and shows the login screen.
function showAuth(message) {
  currentUser = null;
  stocks = [];
  stockBySymbol = new Map();
  account = emptyAccount();
  transactions = [];
  watchlist = [];
  $('app').hidden = true;
  $('auth-screen').hidden = false;
  $('auth-password').value = '';
  setAuthMode('login');
  if (message) setAuthMessage(message, 'error');
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  if (authBusy) return;

  var name = $('auth-name').value.trim();
  var email = $('auth-email').value.trim();
  var password = $('auth-password').value;

  if (!email || !password) {
    setAuthMessage('Enter your email and password.', 'error');
    return;
  }
  if (authMode === 'register') {
    if (name.length < 2) { setAuthMessage('Enter your name (at least 2 characters).', 'error'); return; }
    if (password.length < 8) { setAuthMessage('Password must be at least 8 characters.', 'error'); return; }
  }

  authBusy = true;
  $('auth-submit').disabled = true;
  var result = await api(
    'POST',
    authMode === 'register' ? '/api/register' : '/api/login',
    authMode === 'register' ? { name: name, email: email, password: password } : { email: email, password: password }
  );
  authBusy = false;
  $('auth-submit').disabled = false;

  if (!result.ok) {
    setAuthMessage(result.data.error || 'Something went wrong.', 'error');
    return;
  }
  $('auth-password').value = '';
  await startApp(result.data);
}

async function handleLogout() {
  await api('POST', '/api/logout', {});
  showAuth('');
}


/* ============ 11. START-UP ============ */

// Runs after a successful login (or when an existing login is found).
async function startApp(user) {
  currentUser = user;
  var loaded = await loadData();
  if (!currentUser) return;   // a 401 during loading already sent us to the login screen
  if (!loaded) {
    showAuth('Could not load your data from the server. Please try again.');
    return;
  }

  $('user-name').textContent = user.name;
  loadWatchlist();
  populateStockSelect();
  hideNotice();
  $('auth-screen').hidden = true;
  $('app').hidden = false;
  showView(window.location.hash.slice(1) || settings.landing);
  renderAll();
  startAutoRefresh();
}


/* ============ HISTORY CHART (price history from the database; simulated prices) ============ */

var histRange = '1M';
var histReq = 0;        // counts requests, so a slow old answer can't overwrite a newer one
var histTimer = null;   // the one refresh timer (created once, in initHistoryChart)
var HIST_NS = 'http://www.w3.org/2000/svg';

function histSvg(tag, attrs) {
  var node = document.createElementNS(HIST_NS, tag);
  Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  return node;
}

function histFormat(date, withTime) {
  var opts = { day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return date.toLocaleString('en-IN', opts);
}

function histAxisLabel(date) {
  if (histRange === '1Y') return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Shows a loading / empty / error message in place of the chart.
function histMessage(text, isError, canRetry) {
  var box = $('hist-chart');
  $('hist-stats').replaceChildren();
  box.replaceChildren();
  var msg = el('p', 'hist-msg' + (isError ? ' error' : ''), text);
  if (canRetry) {
    var btn = el('button', 'btn btn-small', 'Retry');
    btn.type = 'button';
    btn.addEventListener('click', function () { histLoad(false); });
    msg.append(document.createElement('br'), btn);
  }
  box.appendChild(msg);
}

// Turns the server's rows into { price, time } objects, oldest first.
function histClean(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (r) { return { price: Number(r.price), time: new Date(r.recorded_at) }; })
    .filter(function (p) { return Number.isFinite(p.price) && !Number.isNaN(p.time.getTime()); })
    .sort(function (a, b) { return a.time - b.time; });
}


/* Samples evenly across time, preserving the first and last points. */
function histDownsample(points, max) {
  if (points.length <= max) return points;

  var firstTime = points[0].time.getTime();
  var lastTime = points[points.length - 1].time.getTime();
  var out = [];
  var index = 0;

  for (var i = 0; i < max; i++) {
    var target = firstTime +
      (lastTime - firstTime) * i / (max - 1);

    while (
      index < points.length - 1 &&
      points[index + 1].time.getTime() <= target
    ) {
      index++;
    }

    var chosen = points[index];

    if (index < points.length - 1) {
      var next = points[index + 1];

      if (
        Math.abs(next.time.getTime() - target) <
        Math.abs(chosen.time.getTime() - target)
      ) {
        index++;
        chosen = next;
      }
    }

    if (out.length === 0 || out[out.length - 1] !== chosen) {
      out.push(chosen);
    }
  }

  var lastPoint = points[points.length - 1];

  if (out[out.length - 1] !== lastPoint) {
    out.push(lastPoint);
  }

  return out;
}


function histPopulate() {
  var select = $('hist-stock');
  if (stocks.length > 0 && select.options.length === stocks.length) return;
  var previous = select.value;
  select.replaceChildren();
  stocks.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.symbol;
    opt.textContent = s.symbol + ' — ' + s.name;
    select.appendChild(opt);
  });
  if (previous && stockBySymbol.has(previous)) select.value = previous;
}

function histSyncButtons() {
  document.querySelectorAll('#hist-ranges button').forEach(function (b) {
    var active = (b.getAttribute('data-range') === histRange);
    b.classList.toggle('btn-active', active);
    b.classList.toggle('btn-ghost', !active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function histDraw(all) {
  var points = histDownsample(all, 160);
  var W = 640, H = 280, L = 62, R = 12, T = 12, B = 30;
  var t0 = points[0].time.getTime();
  var t1 = points[points.length - 1].time.getTime();
  var span = (t1 - t0) || 1;
  var prices = all.map(function (p) { return p.price; });
  var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
  var pad = (hi - lo) * 0.08 || 1;
  var min = lo - pad, max = hi + pad;
  function px(t) { return L + ((t - t0) / span) * (W - L - R); }
  function py(v) { return T + (1 - (v - min) / (max - min)) * (H - T - B); }

  var svg = histSvg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'hist-svg', role: 'img',
    'aria-label': 'Simulated price chart, ' + histRange });

  // Horizontal grid lines with price labels
  for (var g = 0; g <= 3; g++) {
    var v = min + ((max - min) * g) / 3, gy = py(v);
    svg.appendChild(histSvg('line', { x1: L, x2: W - R, y1: gy, y2: gy, 'class': 'hist-grid' }));
    var yl = histSvg('text', { x: L - 8, y: gy + 4, 'text-anchor': 'end', 'class': 'hist-label' });
    yl.textContent = '₹' + Math.round(v).toLocaleString('en-IN');
    svg.appendChild(yl);
  }
  // Date labels along the bottom
  [0, 1 / 3, 2 / 3, 1].forEach(function (f, i) {
    var t = t0 + span * f;
    var xl = histSvg('text', { x: px(t), y: H - 8, 'class': 'hist-label',
      'text-anchor': i === 0 ? 'start' : (i === 3 ? 'end' : 'middle') });
    xl.textContent = histAxisLabel(new Date(t));
    svg.appendChild(xl);
  });

  var pts = points.map(function (p) { return px(p.time.getTime()).toFixed(1) + ',' + py(p.price).toFixed(1); });
  svg.appendChild(histSvg('polygon', { 'class': 'hist-area',
    points: pts.join(' ') + ' ' + px(t1).toFixed(1) + ',' + (H - B) + ' ' + px(t0).toFixed(1) + ',' + (H - B) }));
  svg.appendChild(histSvg('polyline', { 'class': 'hist-line', points: pts.join(' ') }));

  // Hover / touch marker
  var cursor = histSvg('line', { 'class': 'hist-cursor', y1: T, y2: H - B, visibility: 'hidden' });
  var dot = histSvg('circle', { 'class': 'hist-dot', r: 5, visibility: 'hidden' });
  var overlay = histSvg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
  svg.append(cursor, dot, overlay);

  var tip = el('div', 'hist-tip');

  function show(ev) {
    var rect = svg.getBoundingClientRect();
    var x = (ev.clientX - rect.left) * (W / rect.width);
    var best = points[0], bestD = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = Math.abs(px(points[i].time.getTime()) - x);
      if (d < bestD) { bestD = d; best = points[i]; }
    }
    var bx = px(best.time.getTime()), by = py(best.price);
    cursor.setAttribute('x1', bx); cursor.setAttribute('x2', bx); cursor.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', bx); dot.setAttribute('cy', by); dot.setAttribute('visibility', 'visible');
    tip.replaceChildren(el('div', '', histFormat(best.time, true)), el('strong', '', formatINR(best.price)));
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max((bx * rect.width) / W, 70), rect.width - 70) + 'px';
  }
  function hide() {
    cursor.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.style.display = 'none';
  }
  overlay.addEventListener('pointermove', show);
  overlay.addEventListener('pointerdown', show);
  overlay.addEventListener('pointerleave', hide);
  overlay.addEventListener('pointercancel', hide);

  var box = $('hist-chart');
  box.replaceChildren(svg, tip);

  // Summary figures (from all points in the range, not only the drawn ones)
  var first = all[0], last = all[all.length - 1];

var trendColor = last.price >= first.price ? '#22c55e' : '#ef4444';
svg.style.setProperty('--hist-trend', trendColor);

var stats = $('hist-stats');
  stats.replaceChildren();
  [['Latest', formatINR(last.price)], ['High', formatINR(hi)], ['Low', formatINR(lo)],
   ['Change over range', formatSignedPct(((last.price - first.price) / first.price) * 100)],
   ['Last point', histFormat(last.time, true)]
  ].forEach(function (pair) {
    var item = el('div');
    item.append(el('span', '', pair[0] + ': '), el('strong', '', pair[1]));
    stats.appendChild(item);
  });
}

// quiet = true is used by the timer: no loading flash, and an error keeps the old chart.
async function histLoad(quiet) {
  if (!currentUser || stocks.length === 0) return;
  histPopulate();
  var symbol = $('hist-stock').value;
  if (!symbol) return;

  var myReq = ++histReq;
  if (!quiet) histMessage('Loading price history…', false, false);

  var result = await api('GET', '/api/market/history/' + encodeURIComponent(symbol) + '?range=' + histRange);
  if (myReq !== histReq) return;   // a newer request has started; ignore this answer

  if (!result.ok) {
    if (!quiet) histMessage('Could not load price history. ' + (result.data.error || ''), true, true);
    return;
  }
  var all = histClean(result.data.history);
  if (all.length < 2) {
    histMessage('No history is available for this stock and range yet.', false, false);
    return;
  }
  histDraw(all);
}

function initHistoryChart() {
  $('hist-stock').addEventListener('change', function () { histLoad(false); });
  $('hist-ranges').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-range]');
    if (!btn) return;
    histRange = btn.getAttribute('data-range');
    histSyncButtons();
    histLoad(false);
  });
  histSyncButtons();
  // One timer for the whole page. It only fetches while the Market Research page
  // is open and the browser tab is visible, so it never spams the server.
  if (!histTimer) {
    histTimer = setInterval(function () {
      if (currentUser && !document.hidden && !$('view-market').hidden) histLoad(true);
    }, 60000);
  }
}



async function init() {
  initSettings();   // theme applies immediately, even on the login screen

  // All listeners are attached once, here. Logging in and out never adds duplicates.
  $('auth-form').addEventListener('submit', handleAuthSubmit);
  $('auth-switch').addEventListener('click', function () {
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
  $('logout-btn').addEventListener('click', handleLogout);

  $('search-input').addEventListener('input', renderMarket);
  $('trade-stock').addEventListener('change', updateTradePreview);
  $('trade-qty').addEventListener('input', updateTradePreview);
  initHistoryChart();
  $('buy-btn').addEventListener('click', function () { handleTrade('BUY'); });
  $('sell-btn').addEventListener('click', function () { handleTrade('SELL'); });
  $('reset-btn').addEventListener('click', handleReset);

  // Pressing Enter inside the trade form must not reload the page.
  $('trade-form').addEventListener('submit', function (e) { e.preventDefault(); });

  // "Refresh View" now asks the server for fresh data.
  $('refresh-btn').addEventListener('click', async function () {
    var ok = await loadData();
    if (!currentUser) return;
    if (!ok) { showNotice('Could not refresh from the server.'); return; }
    hideNotice();
    populateStockSelect();
    renderAll();
    $('last-refresh').textContent = 'Refreshed at ' + new Date().toLocaleTimeString('en-IN') + ' (sample prices)';
  });

  window.addEventListener('hashchange', function () { showView(window.location.hash.slice(1)); });

  // Are we already logged in? (the login cookie may still be valid after a page refresh)
  var me = await api('GET', '/api/me');
  if (me.ok) await startApp(me.data);
  else showAuth('');
}

init();



 
// ===== INVESTOROS FEEDBACK =====
(function () {
  var form = document.getElementById('feedback-form');
  var status = document.getElementById('feedback-status');
  var adminPanel = document.getElementById('admin-feedback-panel');
  var loadButton = document.getElementById('load-feedback-btn');
  var adminStatus = document.getElementById('admin-feedback-status');
  var feedbackList = document.getElementById('admin-feedback-list');

  if (!form) return;

  // Show the admin inbox only to an account marked as admin.
  async function checkAdminAccess() {
    var me = await api('GET', '/api/me');

    if (me.ok && Number(me.data.is_admin) === 1 && adminPanel) {
      adminPanel.hidden = false;
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    status.textContent = 'Submitting...';

    var result = await api('POST', '/api/feedback', {
      rating: document.getElementById('feedback-rating').value,
      feature: document.getElementById('feedback-feature').value,
      message: document.getElementById('feedback-message').value,
      contact: document.getElementById('feedback-contact').value
    });

    if (result.ok) {
      status.textContent = '🎉 Thank you! Your feedback has been submitted successfully. 💚';
      form.reset();
    } else {
      status.textContent = result.data.error || 'Could not submit feedback.';
    }
  });

  if (loadButton) {
    loadButton.addEventListener('click', async function () {
      adminStatus.textContent = 'Loading feedback...';
      feedbackList.replaceChildren();

      var result = await api('GET', '/api/admin/feedback');

      if (!result.ok) {
        adminStatus.textContent = result.data.error || 'Could not load feedback.';
        return;
      }

      if (!result.data.length) {
        adminStatus.textContent = 'No feedback submissions yet.';
        return;
      }

      adminStatus.textContent = 'Loaded ' + result.data.length + ' submission(s).';

      result.data.forEach(function (item) {
        var card = document.createElement('article');
        card.className = 'feedback-entry';

        var heading = document.createElement('h4');
        heading.textContent = '⭐ ' + item.rating + '/5 · ' + item.feature;

        var sender = document.createElement('p');
        sender.textContent = 'From: ' + item.user_name + ' (' + item.user_email + ')';

        var date = document.createElement('p');
        date.textContent = 'Date: ' + new Date(item.created_at).toLocaleString('en-IN');

        var message = document.createElement('p');
        message.textContent = item.message;

        card.append(heading, sender, date, message);

        if (item.contact) {
          var contact = document.createElement('p');
          contact.textContent = 'Optional contact: ' + item.contact;
          card.appendChild(contact);
        }

        feedbackList.appendChild(card);
      });
    });
  }

  checkAdminAccess();
})();



// Redraw the comparison when either dropdown changes.
document.addEventListener('change', function (e) {
  if (e.target.id === 'compare-a' || e.target.id === 'compare-b') renderCompare();
});


// ===== INVESTMENT JOURNAL =====
; (function () {
  var storageKey = 'investoros_journal_entries_v1';
  var form = document.getElementById('journal-form');
  var entriesBox = document.getElementById('journal-entries');
  var message = document.getElementById('journal-message');

  if (!form || !entriesBox) return;

  function loadEntries() {
    try {
      var saved = localStorage.getItem(storageKey);
      var entries = saved ? JSON.parse(saved) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      return [];
    }
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(entries));
      return true;
    } catch (error) {
      message.textContent = 'Could not save. Browser storage may be unavailable.';
      return false;
    }
  }

  function renderEntries() {
    var entries = loadEntries();
    entriesBox.replaceChildren();

    if (!entries.length) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No journal entries yet. Add your first investment thesis above.';
      entriesBox.appendChild(empty);
      return;
    }

    entries.slice().reverse().forEach(function (entry) {
      var card = document.createElement('article');
      card.className = 'panel';

      var heading = document.createElement('h3');
      heading.textContent = entry.stock + ' — ' + entry.type;

      var date = document.createElement('p');
      date.className = 'muted small';
      date.textContent = entry.date;

      card.append(heading, date);

      [
        ['Reasoning', entry.thesis],
        ['Risks', entry.risks],
        ['Review notes', entry.review]
      ].forEach(function (item) {
        if (!item[1]) return;
        var title = document.createElement('strong');
        title.textContent = item[0];
        var body = document.createElement('p');
        body.textContent = item[1];
        card.append(title, body);
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-small btn-ghost';
      remove.textContent = 'Delete entry';

      remove.addEventListener('click', function () {
        if (!confirm('Delete this journal entry?')) return;
        var latest = loadEntries().filter(function (item) {
          return item.id !== entry.id;
        });
        if (saveEntries(latest)) renderEntries();
      });

      card.appendChild(remove);
      entriesBox.appendChild(card);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var stock = document.getElementById('journal-stock').value.trim();
    var thesis = document.getElementById('journal-thesis').value.trim();

    if (!stock || !thesis) {
      message.textContent = 'Enter a company and your investment reasoning.';
      return;
    }

    var entries = loadEntries();
    entries.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      stock: stock,
      type: document.getElementById('journal-type').value,
      thesis: thesis,
      risks: document.getElementById('journal-risks').value.trim(),
      review: document.getElementById('journal-review').value.trim(),
      date: new Date().toLocaleString()
    });

    if (!saveEntries(entries)) return;

    form.reset();
    message.textContent = 'Journal entry saved.';
    renderEntries();
  });

  renderEntries();
})();