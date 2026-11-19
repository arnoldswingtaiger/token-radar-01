// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, two charts, a filterable table, a model sandbox, and a per-protocol
// detail drawer with the model's own inputs, live comparables and the protocol's farm plan.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, earlyOnly: false, growingOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: { growth: DATA.model.growth_weight, category: true } };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The calibration lookup: a category's own median where it has enough live comparables, else the
  // market-wide median, clamped to the model's floor and cap. Same rule as model.ts multipleFor.
  function multipleFor(category, useCategory) {
    var m = DATA.model;
    if (useCategory) {
      var key = category || 'Other';
      var row = null;
      for (var i = 0; i < DATA.calibration.categories.length; i++) {
        if (DATA.calibration.categories[i].category === key) { row = DATA.calibration.categories[i]; break; }
      }
      if (row && row.used) return Math.min(m.multiple_cap, Math.max(m.multiple_floor, row.median));
    }
    return Math.min(m.multiple_cap, Math.max(m.multiple_floor, DATA.calibration.market_median));
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox may override the growth weight and the category multiples.
  function impliedOf(row, sandbox) {
    var m = DATA.model;
    var multiple = multipleFor(row.category, sandbox ? sandbox.category : true);
    var growthWeight = sandbox ? sandbox.growth : m.growth_weight;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = 1 + m.breadth_per_chain * Math.min((row.chains || []).length, m.breadth_max_chains);
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity * breadth));
  }

  function sandboxActive() {
    return state.sandbox.growth !== DATA.model.growth_weight || state.sandbox.category !== true;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the second action, the capital, the hold and every cost and time. No name is
  // special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum' || c === 'bitcoin') return { words: 'gas can run $5-20 a transaction on this chain', setupUsd: 12, weeklyUsd: 8 };
    return { words: 'gas is a few cents a transaction on this chain', setupUsd: 1, weeklyUsd: 1 };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perps') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis strategy on " + chain + ' and hold the position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the deposit and repay it once, so the position shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Make one swap through ' + name + "'s own router, so the wallet's activity is more than the deposit.";
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back, so the wallet shows a round trip.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake or delegate the receipt token once, if ' + name + ' offers it, to show a second interaction.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perps') >= 0) return 'Close the hedge and open a second small one, so the account shows more than one trade.';
    if (c.indexOf('prediction') >= 0) return 'Resolve the first position and place a second one on a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit into a second ' + name + ' vault, so the wallet holds more than one position.';
    if (c.indexOf('stable') >= 0) return 'Swap a small amount of the stable asset through ' + name + "'s own pool.";
    if (c.indexOf('rwa') >= 0) return 'Claim one yield distribution, so the wallet\'s activity is recorded on chain.';
    if (c.indexOf('insurance') >= 0) return 'Renew or top up the policy once, so the account shows repeat cover.';
    if (c.indexOf('basis') >= 0) return 'Add a second, smaller deposit a week later, so the position grows over time.';
    return 'Make one more qualifying action, such as a second deposit or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var action = actionFor(p, capital, chain);
    var second = secondActionFor(p);
    var words = gas.words.charAt(0).toUpperCase() + gas.words.slice(1);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action + ' ' + words + '.', cost: '$' + capital + ' of capital and about $' + gas.setupUsd + ' of gas', time: '15 minutes to set up' },
      { text: second, cost: 'about $' + gas.weeklyUsd + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + gas.weeklyUsd + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The rows the filters keep, each with the implied value the page shows: the board's own, or the
  // sandbox's recompute when the sandbox is active.
  function rows() {
    var q = state.q.trim().toLowerCase();
    var active = sandboxActive();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.earlyOnly && r.watchlist) return false;
      if (state.growingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).map(function (r) {
      return { row: r, shown: active ? impliedOf(r, state.sandbox) : r.implied_value_usd };
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -Infinity : a.row.change_7d; bv = b.row.change_7d === null ? -Infinity : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? Infinity : a.row.age_days; bv = b.row.age_days === null ? Infinity : b.row.age_days; }
      else if (key === 'multiple') { av = a.row.multiple; bv = b.row.multiple; }
      else { av = a.shown; bv = b.shown; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  // One horizontal bar chart as an SVG string: labels on the left, bars, values on the right.
  function barChart(items, maxVal) {
    var rowH = 26, labelW = 170, valW = 80, chartW = 600;
    var h = items.length * rowH + 8;
    var parts = ['<svg viewBox="0 0 ' + chartW + ' ' + h + '" role="img" aria-label="Bar chart">'];
    items.forEach(function (it, i) {
      var y = 4 + i * rowH;
      var w = Math.max(4, Math.round(((chartW - labelW - valW - 12) * it.value) / maxVal));
      parts.push('<g class="bar-row"><text x="0" y="' + (y + 16) + '">' + esc(it.label) + '</text>' +
        '<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + w + '" height="14" rx="3"></rect>' +
        '<text class="val" x="' + (labelW + w + 8) + '" y="' + (y + 16) + '">' + esc(it.text) + '</text></g>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function topTenChart() {
    var top = DATA.rows.slice(0, 10);
    var max = top.length ? top[0].implied_value_usd : 1;
    var items = top.map(function (r) { return { label: r.rank + '. ' + r.name, value: r.implied_value_usd, text: fmtUsd(r.implied_value_usd) }; });
    return el('section', { class: 'panel chart' },
      el('h2', { text: 'The biggest launches' }),
      el('p', { class: 'sub', text: 'The ten pre-token protocols with the highest implied value.' }),
      el('div', { html: barChart(items, max) })
    );
  }

  function categoryChart() {
    var totals = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!totals[c]) totals[c] = { value: 0, n: 0 };
      totals[c].value += r.implied_value_usd;
      totals[c].n += 1;
    });
    var list = Object.keys(totals).map(function (c) { return { category: c, value: totals[c].value, n: totals[c].n }; })
      .sort(function (a, b) { return b.value - a.value; }).slice(0, 8);
    var max = list.length ? list[0].value : 1;
    var items = list.map(function (c) { return { label: c.category + ' (' + c.n + ')', value: c.value, text: fmtUsd(c.value) }; });
    return el('section', { class: 'panel chart' },
      el('h2', { text: 'Implied value by category' }),
      el('p', { class: 'sub', text: 'Where the board\'s launch value sits, with the row count in brackets.' }),
      el('div', { html: barChart(items, max) })
    );
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, each valued at the multiple its category trades at. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Market median multiple' }), el('b', { text: fmtMult(DATA.calibration.market_median) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL', selected: state.minTvl === 0 ? 'selected' : null }),
      el('option', { value: '10000000', text: 'TVL $10M+', selected: state.minTvl === 10000000 ? 'selected' : null }),
      el('option', { value: '50000000', text: 'TVL $50M+', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL $100M+', selected: state.minTvl === 100000000 ? 'selected' : null })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = parseInt(tvlSelect.value, 10) || 0; render(); });
    var earlyBox = el('input', { type: 'checkbox', id: 'early', checked: state.earlyOnly ? 'checked' : null });
    earlyBox.addEventListener('change', function () { state.earlyOnly = earlyBox.checked; render(); });
    var growBox = el('input', { type: 'checkbox', id: 'growing', checked: state.growingOnly ? 'checked' : null });
    growBox.addEventListener('change', function () { state.growingOnly = growBox.checked; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'TVL' }), tvlSelect),
      el('label', { class: 'check' }, earlyBox, 'Early only'),
      el('label', { class: 'check' }, growBox, 'Growing only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.earlyOnly = false; state.growingOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].shown || 1;
    var tbody = el('tbody');
    list.forEach(function (item) {
      var r = item.row;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'badge', text: 'watchlist' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((item.shown / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(item.shown) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their multiples calibrate the pre-token board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var top = cal.categories.slice(0, 12);
    var tbody = el('tbody');
    top.forEach(function (c) {
      tbody.appendChild(el('tr', { class: c.used ? 'used' : null },
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.p25) }),
        el('td', { class: 'num', text: fmtMult(c.p75) }),
        el('td', { text: c.used ? 'used' : 'too few' })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The multiple is not a guess: it is the market-cap-to-TVL multiple the snapshot\'s own live protocols trade at.' }),
      el('div', { class: 'formula' },
        'multiple = category median mcap/TVL (' + m.min_category_n + '+ live comparables), else market median ' + cal.market_median + 'x\n' +
        'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.breadth_per_chain + ' x min(chains, ' + m.breadth_max_chains + ')) )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Breadth counts the chains a protocol runs on: more chains reach more users. The market range of a row applies the same formula at the 25th and 75th percentile multiples of its comparables.' }),
      el('h3', { text: 'Calibration: live multiples by category' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Live n' }),
            el('th', { scope: 'col', text: 'Median' }),
            el('th', { scope: 'col', text: '25th' }),
            el('th', { scope: 'col', text: '75th' }),
            el('th', { scope: 'col', text: 'Multiple' })
          )),
          tbody
        )
      ),
      el('p', { class: 'sub', text: 'Calibration over ' + cal.live_n + ' live protocols (market median ' + fmtMult(cal.market_median) + ', 25th ' + fmtMult(cal.market_p25) + ', 75th ' + fmtMult(cal.market_p75) + '). A category with fewer than ' + m.min_category_n + ' live comparables falls back to the market median.' }),
      el('h3', { text: 'What the board leaves out, and why' }),
      el('p', { class: 'sub', text: 'Above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor the board ranks exactly the watchlist. Below it, the early radar ranks every pre-token protocol that passes the watchlist\'s own rule: no wrapped, staked or bridged product of a token that already trades, no exchange, no versioned pool. A protocol above the floor that the watchlist leaves out is left out here too, since the house\'s record marks it as a product of another protocol. Below the floor that record is not in the snapshot, so a few early rows may be products of another protocol. The board says a protocol records no token, never that it has none: DefiLlama\'s record is not proof.' })
    );
  }

  function sandboxPanel() {
    var m = DATA.model;
    var growth = el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.1', value: String(state.sandbox.growth), 'aria-label': 'Growth weight' });
    var growthOut = el('output', { for: 'sb-growth', text: String(state.sandbox.growth) });
    growth.addEventListener('input', function () { state.sandbox.growth = parseFloat(growth.value); growthOut.textContent = growth.value; render(); });
    var catBox = el('input', { type: 'checkbox', id: 'sb-cat', checked: state.sandbox.category ? 'checked' : null });
    catBox.addEventListener('change', function () { state.sandbox.category = catBox.checked; render(); });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Change the model and watch the board re-rank. The detail view always shows the board\'s own numbers.' }),
      el('div', { class: 'sliders' },
        el('div', { class: 'slider' }, el('label', { for: 'sb-growth', text: 'Growth weight (board: ' + m.growth_weight + ')' }), growth, growthOut),
        el('label', { class: 'check' }, catBox, 'Use category multiples (off: market median for all)')
      ),
      sandboxActive()
        ? el('p', { class: 'sandbox-note', text: 'Sandbox active: the board is re-ranked with growth weight ' + state.sandbox.growth + ' and category multiples ' + (state.sandbox.category ? 'on' : 'off') + '. Ranks shown are the board\'s; the order is the sandbox\'s.' })
        : el('p', { class: 'sub', text: 'The sandbox is at the board\'s own settings.' }),
      el('div', null, el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { state.sandbox = { growth: DATA.model.growth_weight, category: true }; render(); } }))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, null);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Multiple (' + (row.multiple_source === 'category' ? 'category median' : 'market median') + ')' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Market range' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The range applies the 25th and 75th percentile multiples of its comparables. This is an estimate, not a price.' })
    ));
    var comps = DATA.comparables[row.category || 'Other'] || [];
    if (comps.length > 0) {
      var compRows = comps.map(function (c) {
        return el('div', null, el('span', null, el('b', { text: c.name })), el('span', { class: 'num', text: fmtUsd(c.mcap_usd) + ' mcap · ' + fmtMult(c.multiple) }));
      });
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables: ' + (row.category || 'Other') + ' protocols that already trade' }),
        el('div', { class: 'comps' }, compRows),
        el('p', { class: 'sub', text: 'Their multiples are what the board is calibrated on.' })
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'About ' + fmtUsd(row.farm_cost_usd) + ' to farm for a month: the capital plus gas on ' + chainOf(row) + '.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '. The snapshot is frozen: it does not move, and neither does this board.' }),
      el('p', { text: 'Implied value is the entry\'s own claim, never make.fun\'s. A protocol on this board records no token; that is DefiLlama\'s record, not proof that it has none. Farming carries risk: a protocol may never issue a token, and a position can lose value.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(el('div', { class: 'charts' }, topTenChart(), categoryChart()));
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(sandboxPanel());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
