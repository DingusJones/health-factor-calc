/**
 * Main application logic for the DeFi Health Factor Calculator.
 *
 * Features:
 * - Live position fetching across Moonwell, Aave V3, Save
 * - Health factor gauge with zone labels
 * - Collateral + borrow tables
 * - Per-asset liquidation prices (requires price feeds)
 * - What-if simulator: edit supplied/borrowed/price/CF, add new tokens
 *
 * ADDING A NEW PROTOCOL:
 * 1. Create adapters/yourprotocol.js with fetchPosition(wallet, chainId, chainConfig)
 * 2. Add a PROTOCOLS entry in config/chains.js
 * 3. Add chain config to CHAINS in config/chains.js
 */

// ── State ──
let state = {
  selectedProtocol: 'moonwell',
  selectedChain: 8453,
  wallet: '',
  position: null,
  loading: false,
  error: null,
  simMode: false,
  simCollaterals: [],
  simBorrows: [],
  prices: {}, // { symbol: price }
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  populateProtocolSelect();
  populateChainSelect();
  bindEvents();
});

function populateProtocolSelect() {
  const sel = document.getElementById('protocol-select');
  sel.innerHTML = '';
  for (const [id, proto] of Object.entries(PROTOCOLS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = proto.name;
    sel.appendChild(opt);
  }
  state.selectedProtocol = sel.value;
}

function populateChainSelect() {
  const sel = document.getElementById('chain-select');
  sel.innerHTML = '';
  const proto = PROTOCOLS[state.selectedProtocol];
  if (!proto) return;
  for (const chainId of proto.chains) {
    const chain = CHAINS[chainId];
    if (!chain) continue;
    const opt = document.createElement('option');
    opt.value = chainId;
    opt.textContent = chain.name;
    sel.appendChild(opt);
  }
  state.selectedChain = sel.value;
}

function bindEvents() {
  document.getElementById('protocol-select').addEventListener('change', e => {
    state.selectedProtocol = e.target.value;
    state.position = null;
    state.simMode = false;
    populateChainSelect();
    renderAll();
  });
  document.getElementById('chain-select').addEventListener('change', e => {
    state.selectedChain = e.target.value;
    state.position = null;
    state.simMode = false;
    renderAll();
  });
  document.getElementById('fetch-btn').addEventListener('click', fetchPosition);
  document.getElementById('wallet-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchPosition();
  });
  document.getElementById('sim-toggle').addEventListener('click', toggleSimulator);
}

// ── Fetch ──
async function fetchPosition() {
  const wallet = document.getElementById('wallet-input').value.trim();
  if (!wallet) { showError('Enter a wallet address'); return; }
  if (PROTOCOLS[state.selectedProtocol]?.chainType === 'evm' && !isEvmAddress(wallet)) {
    showError('Enter a valid EVM address (0x followed by 40 hex characters)'); return;
  }

  state.wallet = wallet;
  state.loading = true;
  state.error = null;
  state.position = null;
  state.simMode = false;
  renderAll();

  try {
    const chainConfig = CHAINS[state.selectedChain];
    if (!chainConfig) throw new Error(`Unknown chain configuration: ${state.selectedChain}`);
    if (PROTOCOLS[state.selectedProtocol]?.chainType === 'evm') validateRpcConfig(chainConfig.rpcs);
    let position;
    if (state.selectedProtocol === 'moonwell') {
      position = await MoonwellAdapter.fetchPosition(wallet, parseInt(state.selectedChain), chainConfig);
    } else if (state.selectedProtocol === 'aave') {
      position = await AaveAdapter.fetchPosition(wallet, parseInt(state.selectedChain), chainConfig);
    } else if (state.selectedProtocol === 'save') {
      position = await SaveAdapter.fetchPosition(wallet);
    } else if (state.selectedProtocol === 'morpho') {
      position = await MorphoAdapter.fetchPosition(wallet, parseInt(state.selectedChain), chainConfig);
    } else {
      throw new Error(`Unknown protocol: ${state.selectedProtocol}`);
    }

    state.position = position;
    state.simCollaterals = JSON.parse(JSON.stringify(position.collaterals || []));
    state.simBorrows = JSON.parse(JSON.stringify(position.borrows || []));

    // Fetch prices for all assets in the position
    const allSymbols = [
      ...(position.collaterals || []).map(c => c.asset),
      ...(position.borrows || []).map(b => b.asset),
    ].map(s => normalizeSymbol(s));

    if (allSymbols.length > 0) {
      state.prices = await fetchPrices(allSymbols);
      // External spot is display-only for Moonwell; never overwrite its risk basis.
      (position.collaterals || []).forEach(c => { const external=state.prices[normalizeSymbol(c.asset)]||null;if(position.protocol==='moonwell')MoonwellAdapter.applyDisplayPrice(c,external);else{c.displayPrice=external;c.displayPriceSource=external?'Coinbase/CoinGecko external spot':null;if(!(c.price>0))c.price=external||0;}c.previousPrice=c.price; });
      (position.borrows || []).forEach(b => { const external=state.prices[normalizeSymbol(b.asset)]||null;if(position.protocol==='moonwell')MoonwellAdapter.applyDisplayPrice(b,external);else{b.displayPrice=external;b.displayPriceSource=external?'Coinbase/CoinGecko external spot':null;if(!(b.price>0))b.price=external||0;}b.previousPrice=b.price; });
      state.simCollaterals = JSON.parse(JSON.stringify(position.collaterals || []));
      state.simBorrows = JSON.parse(JSON.stringify(position.borrows || []));
    }
  } catch (err) {
    state.error = err.message || 'Failed to fetch position';
  }

  state.loading = false;
  renderAll();
}

/**
 * Normalize token symbols for price lookup.
 * mWETH → WETH, mcbBTC → cbBTC, mUSDC → USDC, etc.
 */
function normalizeSymbol(sym) {
  if (!sym) return '';
  // Strip m-prefix (Moonwell mTokens): mWETH→WETH, mcbBTC→cbBTC, mUSDC→USDC
  let s = sym.replace(/^m/, '');
  // Strip w/W prefix for wrapped tokens that track underlying
  if (s === 'WETH') s = 'ETH';
  if (s === 'WBTC') s = 'BTC';
  return s;
}

// ── Simulator ──
function toggleSimulator() {
  if (!state.position) return;
  state.simMode = !state.simMode;
  if (state.simMode) {
    state.simCollaterals = JSON.parse(JSON.stringify(state.position.collaterals || []));
    state.simBorrows = JSON.parse(JSON.stringify(state.position.borrows || []));
    // Inject prices
    state.simCollaterals.forEach(c => { if (state.position.protocol !== 'moonwell' && !(c.price > 0)) c.price = state.prices[normalizeSymbol(c.asset)] || 0; });
    state.simBorrows.forEach(b => { if (state.position.protocol !== 'moonwell' && !(b.price > 0)) b.price = state.prices[normalizeSymbol(b.asset)] || 0; });
  }
  renderAll();
}

function updateSimCollateral(idx, field, value) {
  if (!state.simMode) return;
  const col = state.simCollaterals[idx];
  if (!col) return;
  if (field === 'suppliedUsd') {
    col.suppliedUsd = parseFloat(value) || 0;
    if (col.unitsKnown === true && col.price > 0) col.amount = col.suppliedUsd / col.price;
    col.adjustedUsd = col.suppliedUsd * (col.collateralFactor || 0);
  } else if (field === 'collateralFactor') {
    col.collateralFactor = (parseFloat(value) || 0) / 100;
    col.adjustedUsd = (col.suppliedUsd || 0) * col.collateralFactor;
  } else if (field === 'price') {
    col.price = parseFloat(value) || 0;
    if (col.unitsKnown === true && Number.isFinite(col.amount)) col.suppliedUsd = col.amount * col.price;
    col.previousPrice = col.price;
    col.adjustedUsd = col.suppliedUsd * (col.collateralFactor || 0);
  }
  renderResults();
}

function updateSimBorrow(idx, field, value) {
  if (!state.simMode) return;
  const bor = state.simBorrows[idx];
  if (!bor) return;
  if (field === 'borrowedUsd') { bor.borrowedUsd = parseFloat(value) || 0; if (bor.unitsKnown === true && bor.price > 0) bor.amount = bor.borrowedUsd / bor.price; }
  if (field === 'price') {
    bor.price = parseFloat(value) || 0;
    if (bor.unitsKnown === true && Number.isFinite(bor.amount)) bor.borrowedUsd = bor.amount * bor.price;
    bor.previousPrice = bor.price;
  }
  renderResults();
}

function addSimCollateral(assetMtoken) {
  if (!state.simMode || !state.position) return;
  if (!assetMtoken) return;
  const available = state.position.availableMarkets || [];
  const found = available.find(m => m.mToken === assetMtoken);
  const cf = found ? found.collateralFactor : 0.8;
  const sym = normalizeSymbol(assetMtoken);
  state.simCollaterals.push({
    asset: assetMtoken,
    suppliedUsd: 0,
    collateralFactor: cf,
    adjustedUsd: 0,
    price: state.prices[sym] || 0,
    unitsKnown: false,
  });
  renderResults();
}

function addSimBorrow(assetMtoken) {
  if (!state.simMode || !state.position) return;
  if (!assetMtoken) return;
  const sym = normalizeSymbol(assetMtoken);
  state.simBorrows.push({
    asset: assetMtoken,
    borrowedUsd: 0,
    price: state.prices[sym] || 0,
    unitsKnown: false,
  });
  renderResults();
}

/**
 * Build a dropdown that lets the user pick which available market to add.
 * @param {string} kind - 'collateral' or 'borrow'
 * @returns {string} HTML for a select + add button, or empty if nothing available
 */
function simAddPicker(kind) {
  if (!state.simMode || !state.position) return '';
  const available = state.position.availableMarkets || [];
  const used = kind === 'collateral'
    ? new Set(state.simCollaterals.map(c => c.asset))
    : new Set(state.simBorrows.map(b => b.asset));
  const options = available
    .filter(m => !used.has(m.mToken))
    .map(m => `<option value="${escapeHtml(m.mToken)}">${escapeHtml(m.mToken)}${kind === 'collateral' && m.collateralFactor ? ` (${Math.round(m.collateralFactor*100)}% CF)` : ''}</option>`)
    .join('');

  if (!options) return '<span class="sim-add-empty">No more assets to add</span>';

  const fn = kind === 'collateral' ? 'addSimCollateral' : 'addSimBorrow';
  return `
    <div class="sim-add-picker">
      <select class="sim-add-select" id="sim-add-select-${kind}">
        <option value="">Add ${kind === 'collateral' ? 'collateral' : 'borrow'}…</option>
        ${options}
      </select>
      <button class="btn-add" onclick="${fn}(document.getElementById('sim-add-select-${kind}').value)">+</button>
    </div>`;
}

function removeSimCollateral(idx) {
  if (!state.simMode) return;
  state.simCollaterals.splice(idx, 1);
  renderResults();
}

function removeSimBorrow(idx) {
  if (!state.simMode) return;
  state.simBorrows.splice(idx, 1);
  renderResults();
}

// ── Render ──
function renderAll() {
  const container = document.getElementById('results');
  const simToggle = document.getElementById('sim-toggle');
  simToggle.style.display = state.position && !shouldRenderRiskContainers(state.position) ? 'inline-block' : 'none';

  if (state.loading) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Fetching position...</p></div>`;
    return;
  }
  if (state.error) {
    container.innerHTML = `<div class="error-msg">⚠ ${escapeHtml(state.error)}</div>`;
    return;
  }
  if (!state.position || state.position.noPosition) {
    const protoLabel = escapeHtml(PROTOCOLS[state.selectedProtocol]?.name || state.selectedProtocol);
    const chainLabel = escapeHtml(CHAINS[state.selectedChain]?.name || state.selectedChain);
    container.innerHTML = `
      <div class="position-card">
        <div class="card-header">
          <span class="proto-badge">${protoLabel}</span>
          <span class="chain-badge">${chainLabel}</span>
        </div>
        <div class="placeholder" style="padding: 30px 20px">
          No active position found on ${protoLabel} (${chainLabel}).<br>
          <span class="muted" style="font-size: 0.8rem">This wallet may not have any borrows on this protocol/chain.</span>
        </div>
      </div>`;
    return;
  }
  renderResults();
}

function renderResults() {
  const container = document.getElementById('results');
  if (!state.simMode && shouldRenderRiskContainers(state.position)) return renderRiskContainers(container, state.position);
  const collaterals = state.simMode ? state.simCollaterals : (state.position.collaterals || []);
  const borrows = state.simMode ? state.simBorrows : (state.position.borrows || []);

  // Compute HF
  let hf = state.position.healthFactor;
  let totalSupplied, totalBorrowed, totalCollateral;
  if (state.simMode) {
    hf = computeHealthFactor(collaterals, borrows);
    totalSupplied = collaterals.reduce((s, c) => s + (c.suppliedUsd || 0), 0);
    totalBorrowed = borrows.reduce((s, b) => s + (b.borrowedUsd || 0), 0);
    totalCollateral = collaterals.reduce((s, c) => s + (c.adjustedUsd || 0), 0);
  } else {
    hf = state.position.healthFactor;
    totalSupplied = state.position.totalSuppliedUsd;
    totalBorrowed = state.position.totalBorrowedUsd;
    totalCollateral = state.position.totalCollateralUsd;
  }

  const zone = healthZone(hf);
  const gaugeHtml = renderGauge(hf, zone);

  // Liquidation prices
  const liqPrices = computeLiquidationPrices(collaterals, borrows);
  const debtLiqPrices = computeDebtLiquidationPrices(collaterals, borrows);

  // ── Collateral table ──
  const collHeaders = state.simMode
    ? '<tr><th>Asset</th><th>Supplied</th><th>CF</th><th>Price</th><th></th></tr>'
    : '<tr><th>Asset</th><th>Supplied</th><th>CF</th><th>Price</th></tr>';

  const collRows = collaterals.length > 0
    ? collaterals.map((c, i) => {
      const cf = Number.isFinite(c.collateralFactor) ? (c.collateralFactor * 100).toFixed(0) + '%' : 'eMode';
      const priceStr = c.price > 0 ? `${formatPrice(c.price)}${c.priceSource?`<br><span class="muted">${escapeHtml(c.priceSource)}</span>`:''}${c.displayPrice>0?`<br>${formatPrice(c.displayPrice)} <span class="muted">${escapeHtml(c.displayPriceSource||'external display')}</span>`:''}` : (c.displayPrice>0?`${formatPrice(c.displayPrice)}<br><span class="muted">${escapeHtml(c.displayPriceSource||'external display only')}</span>`:'Unavailable');
      if (state.simMode) {
        return `<tr>
          <td>${escapeHtml(c.asset)}</td>
          <td><input type="number" step="0.01" value="${(c.suppliedUsd||0).toFixed(2)}" class="sim-input" onchange="updateSimCollateral(${i},'suppliedUsd',this.value)"/></td>
          <td><input type="number" step="1" value="${c.collateralFactor ? (c.collateralFactor*100).toFixed(0) : ''}" class="sim-input sim-input-sm" onchange="updateSimCollateral(${i},'collateralFactor',this.value)"/>%</td>
          <td><input type="number" step="0.01" value="${(c.price||0).toFixed(2)}" class="sim-input" onchange="updateSimCollateral(${i},'price',this.value)"/></td>
          <td><button class="btn-remove" onclick="removeSimCollateral(${i})">✕</button></td>
        </tr>`;
      }
      return `<tr><td>${escapeHtml(c.asset)}</td><td>${formatUsd(c.suppliedUsd || 0)}</td><td>${cf}</td><td>${priceStr}</td></tr>`;
    }).join('')
    : `<tr><td colspan="${state.simMode ? 5 : 4}" class="muted">No collateral</td></tr>`;

  // ── Borrow table ──
  const borrowHeaders = state.simMode
    ? '<tr><th>Asset</th><th>Borrowed</th><th>Price</th><th></th></tr>'
    : '<tr><th>Asset</th><th>Borrowed</th><th>Price</th></tr>';

  const borrowRows = borrows.length > 0
    ? borrows.map((b, i) => {
      const priceStr = b.price > 0 ? `${formatPrice(b.price)}${b.priceSource?`<br><span class="muted">${escapeHtml(b.priceSource)}</span>`:''}${b.displayPrice>0?`<br>${formatPrice(b.displayPrice)} <span class="muted">${escapeHtml(b.displayPriceSource||'external display')}</span>`:''}` : (b.displayPrice>0?`${formatPrice(b.displayPrice)}<br><span class="muted">${escapeHtml(b.displayPriceSource||'external display only')}</span>`:'Unavailable');
      if (state.simMode) {
        return `<tr>
          <td>${escapeHtml(b.asset)}</td>
          <td><input type="number" step="0.01" value="${(b.borrowedUsd||0).toFixed(2)}" class="sim-input" onchange="updateSimBorrow(${i},'borrowedUsd',this.value)"/></td>
          <td><input type="number" step="0.01" value="${(b.price||0).toFixed(2)}" class="sim-input" onchange="updateSimBorrow(${i},'price',this.value)"/></td>
          <td><button class="btn-remove" onclick="removeSimBorrow(${i})">✕</button></td>
        </tr>`;
      }
      return `<tr><td>${escapeHtml(b.asset)}</td><td>${formatUsd(b.borrowedUsd || 0)}</td><td>${priceStr}</td></tr>`;
    }).join('')
    : `<tr><td colspan="${state.simMode ? 4 : 3}" class="muted">No borrows</td></tr>`;

  // ── Liquidation prices table ──
  const liqRows = liqPrices.length > 0
    ? liqPrices.map(lp => {
      const weak = lp.isWeakest ? ' class="weakest"' : '';
      return `<tr${weak}><td>${escapeHtml(lp.asset)}</td><td>${lp.currentPrice>0?formatPrice(lp.currentPrice):'—'}</td><td>${Number.isFinite(lp.liquidationPrice)?formatPrice(lp.liquidationPrice):'—'}</td><td>${boundaryStatus(lp,'down')}</td></tr>`;
    }).join('')
    : `<tr><td colspan="4" class="muted">No collateral assets</td></tr>`;
  const debtLiqRows = debtLiqPrices.length > 0 ? debtLiqPrices.map(lp => {
    const weak=lp.isWeakest?' class="weakest"':'';
    return `<tr${weak}><td>${escapeHtml(lp.asset)}</td><td>${lp.currentPrice>0?formatPrice(lp.currentPrice):'—'}</td><td>${Number.isFinite(lp.liquidationPrice)?formatPrice(lp.liquidationPrice):'—'}</td><td>${boundaryStatus(lp,'up')}</td></tr>`;
  }).join('') : `<tr><td colspan="4" class="muted">No debt</td></tr>`;

  // ── Simulator add pickers (choose which asset) ──
  const simControls = state.simMode
    ? `<div class="sim-controls">
         ${simAddPicker('collateral')}
         ${simAddPicker('borrow')}
       </div>`
    : '';

  const protocolLabel = escapeHtml(PROTOCOLS[state.selectedProtocol]?.name || state.selectedProtocol);
  const chainLabel = escapeHtml(CHAINS[state.selectedChain]?.name || state.selectedChain);

  container.innerHTML = `
    <div class="position-card">
      <div class="card-header">
        <span class="proto-badge">${protocolLabel}</span>
        <span class="chain-badge">${chainLabel}</span>
        ${state.simMode ? '<span class="sim-badge">SIMULATOR</span>' : ''}
      </div>

      ${gaugeHtml}
      ${state.position.healthFactorSource?`<p class="table-note">${escapeHtml(state.position.healthFactorSource)}</p>`:''}

      <div class="totals-row">
        <div class="total-cell"><span class="total-label">Supplied</span><span class="total-value">${formatUsd(totalSupplied)}</span></div>
        <div class="total-cell"><span class="total-label">Borrowed</span><span class="total-value">${formatUsd(totalBorrowed)}</span></div>
        <div class="total-cell"><span class="total-label">Adj. Collateral</span><span class="total-value">${formatUsd(totalCollateral)}</span></div>
      </div>

      ${state.position.note ? `<p class="note">${escapeHtml(state.position.note)}</p>` : ''}
      ${(state.position.warnings||[]).map(w=>`<p class="note">⚠ ${escapeHtml(w)}</p>`).join('')}

      <div class="section">
        <h3>Collateral</h3>
        <table class="data-table">
          <thead>${collHeaders}</thead>
          <tbody>${collRows}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Borrows</h3>
        <table class="data-table">
          <thead>${borrowHeaders}</thead>
          <tbody>${borrowRows}</tbody>
        </table>
      </div>

      ${simControls}

      <div class="section">
        <h3>Collateral Price Falls</h3>
        <table class="data-table">
          <thead><tr><th>Asset</th><th>Current Price</th><th>Liq. Price</th><th>Drop Needed</th></tr></thead>
          <tbody>${liqRows}</tbody>
        </table>
        ${liqPrices.length > 0 ? `<p class="table-note">🔴 Weakest link highlighted — closest to liquidation. ${state.position.protocol==='moonwell'?'Moonwell API-valuation thresholds are conditional, with all other asset prices held constant; they are not protocol-oracle claims.':''}</p>` : ''}
      </div>

      <div class="section">
        <h3>Debt Price Rises</h3>
        <table class="data-table">
          <thead><tr><th>Debt Asset</th><th>Current Price</th><th>Liq. Price</th><th>Rise Needed / Status</th></tr></thead>
          <tbody>${debtLiqRows}</tbody>
        </table>
        <p class="table-note">Each row changes only that debt asset, with other prices held constant. Moonwell API-valuation thresholds are conditional and require successful on-chain token-unit enrichment; otherwise they are explicitly unavailable.</p>
      </div>
    </div>
  `;
}

function showError(msg) {
  document.getElementById('results').innerHTML = `<div class="error-msg">⚠ ${escapeHtml(msg)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function boundaryStatus(row,direction) {
  if(row.status==='no-debt')return 'No debt';
  if(row.status==='already-liquidatable')return 'Already liquidatable';
  if(row.status==='no-price')return 'Unavailable — canonical amount/price units required';
  if(row.status==='other-collateral-covers')return 'Other collateral covers the debt (100% fall)';
  const pct=direction==='up'?row.risePct:row.dropPct;
  return Number.isFinite(pct)?formatPct(pct):'Unavailable';
}

function renderRiskContainers(container, position) {
  container.innerHTML = position.riskContainers.map(rc => {
    const warnings = [...(position.warnings || []), ...(rc.warnings || [])];
    const rows = rc.assets.map(a => `<tr><td>${escapeHtml(a.role)}</td><td>${escapeHtml(a.symbol)}<br><span class="muted">${escapeHtml(a.id)}</span></td><td>${escapeHtml(a.humanAmount)}</td><td>${a.protocolRiskPrice == null ? 'Unavailable' : escapeHtml(a.protocolRiskPrice)}<br><span class="muted">${escapeHtml(a.oracleSource || 'unknown')}</span></td><td>${a.displayUsdPrice == null ? 'Not fetched' : escapeHtml(a.displayUsdPrice)}</td></tr>`).join('');
    return `<div class="position-card"><div class="card-header"><span class="proto-badge">${escapeHtml(PROTOCOLS[position.protocol]?.name || position.protocol)}</span><span class="chain-badge">${escapeHtml(position.chain)}</span></div>
      <h3>Isolated market ${escapeHtml(rc.marketId || rc.id)}</h3><p>Health factor: ${rc.healthFactor == null ? 'Not applicable / unavailable' : escapeHtml(rc.healthFactor)}</p><table class="data-table"><thead><tr><th>Role</th><th>Asset</th><th>Amount</th><th>Protocol oracle</th><th>External display price</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="section"><h3>Liquidation boundaries</h3><table class="data-table"><tbody><tr><th>Collateral price falls</th><td>${escapeHtml(rc.liquidation?.collateralPriceDown?.price ?? 'Unavailable — canonical oracle quote required')} ${rc.liquidation?'(oracle-scaled pair price)':''}</td></tr><tr><th>Debt price rises</th><td>${escapeHtml(rc.liquidation?.debtPriceUp?.price ?? 'Unavailable — canonical oracle quote required')} ${rc.liquidation?'× current debt price':''}</td></tr></tbody></table><p class="table-note">Pair-denominated; each boundary assumes the other asset price is held constant. Any USD translation is conditional.</p></div>
      ${warnings.map(w => `<p class="note">⚠ ${escapeHtml(w)}</p>`).join('')}</div>`;
  }).join('');
}
