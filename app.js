/**
 * Main application logic for the DeFi Health Factor Calculator.
 *
 * Handles UI state, protocol/chain switching, wallet input, position fetching,
 * rendering, and the what-if simulator.
 *
 * ARCHITECTURE:
 * - config/chains.js: chain + protocol registry (add new protocols/chains there)
 * - adapters/*.js: per-protocol fetch logic (add new adapter file + register)
 * - lib/hf-math.js: pure HF + liquidation calculations
 * - lib/gauge.js: SVG gauge rendering
 * - lib/rpc.js: EVM JSON-RPC helper
 *
 * ADDING A NEW PROTOCOL:
 * 1. Create adapters/yourprotocol.js with a fetchPosition(wallet, chainId, chainConfig) function
 * 2. Add a PROTOCOLS entry in config/chains.js with supported chains
 * 3. Add chain config (RPCs, contract addresses) to CHAINS in config/chains.js
 * 4. That's it — the app auto-discovers it from the registry
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
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  populateProtocolSelect();
  populateChainSelect();
  bindEvents();
  // Pre-fill with Jay's wallet for convenience
  // state.wallet = '0x8E94D067874ff30a20d218B53b4dd31b659A2820';
  // document.getElementById('wallet-input').value = state.wallet;
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
  if (!wallet) {
    showError('Enter a wallet address');
    return;
  }

  state.wallet = wallet;
  state.loading = true;
  state.error = null;
  state.position = null;
  state.simMode = false;
  renderAll();

  try {
    const proto = PROTOCOLS[state.selectedProtocol];
    const chainConfig = CHAINS[state.selectedChain];

    let position;
    if (state.selectedProtocol === 'moonwell') {
      position = await MoonwellAdapter.fetchPosition(wallet, parseInt(state.selectedChain));
    } else if (state.selectedProtocol === 'aave') {
      position = await AaveAdapter.fetchPosition(wallet, parseInt(state.selectedChain), chainConfig);
    } else if (state.selectedProtocol === 'save') {
      position = await SaveAdapter.fetchPosition(wallet);
    } else {
      throw new Error(`Unknown protocol: ${state.selectedProtocol}`);
    }

    state.position = position;
    state.simCollaterals = JSON.parse(JSON.stringify(position.collaterals || []));
    state.simBorrows = JSON.parse(JSON.stringify(position.borrows || []));
  } catch (err) {
    state.error = err.message || 'Failed to fetch position';
  }

  state.loading = false;
  renderAll();
}

// ── Simulator ──
function toggleSimulator() {
  if (!state.position) return;
  state.simMode = !state.simMode;
  if (state.simMode) {
    state.simCollaterals = JSON.parse(JSON.stringify(state.position.collaterals || []));
    state.simBorrows = JSON.parse(JSON.stringify(state.position.borrows || []));
  }
  renderAll();
}

function updateSimCollateral(idx, field, value) {
  if (!state.simMode) return;
  const col = state.simCollaterals[idx];
  if (!col) return;

  if (field === 'suppliedUsd') {
    col.suppliedUsd = parseFloat(value) || 0;
    col.adjustedUsd = col.suppliedUsd * (col.collateralFactor || 0);
  } else if (field === 'collateralFactor') {
    col.collateralFactor = (parseFloat(value) || 0) / 100;
    col.adjustedUsd = (col.suppliedUsd || 0) * col.collateralFactor;
  }
  renderResults();
}

function updateSimBorrow(idx, field, value) {
  if (!state.simMode) return;
  const bor = state.simBorrows[idx];
  if (!bor) return;
  if (field === 'borrowedUsd') {
    bor.borrowedUsd = parseFloat(value) || 0;
  }
  renderResults();
}

// ── Render ──
function renderAll() {
  const container = document.getElementById('results');

  // Show/hide sim toggle
  const simToggle = document.getElementById('sim-toggle');
  simToggle.style.display = state.position ? 'inline-block' : 'none';

  if (state.loading) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Fetching position...</p></div>`;
    return;
  }

  if (state.error) {
    container.innerHTML = `<div class="error-msg">⚠ ${state.error}</div>`;
    return;
  }

  if (!state.position || state.position.noPosition) {
    const protoLabel = PROTOCOLS[state.selectedProtocol]?.name || state.selectedProtocol;
    const chainLabel = CHAINS[state.selectedChain]?.name || state.selectedChain;
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
      </div>
    `;
    return;
  }

  renderResults();
}

function renderResults() {
  const container = document.getElementById('results');

  const collaterals = state.simMode ? state.simCollaterals : (state.position.collaterals || []);
  const borrows = state.simMode ? state.simBorrows : (state.position.borrows || []);

  // Recompute HF if in sim mode
  let hf = state.position.healthFactor;
  let totalCollateral = state.position.totalCollateralUsd;
  let totalSupplied = state.position.totalSuppliedUsd;
  let totalBorrowed = state.position.totalBorrowedUsd;

  if (state.simMode) {
    hf = computeHealthFactor(collaterals, borrows);
    totalSupplied = collaterals.reduce((s, c) => s + (c.suppliedUsd || 0), 0);
    totalBorrowed = borrows.reduce((s, b) => s + (b.borrowedUsd || 0), 0);
    totalCollateral = collaterals.reduce((s, c) => s + (c.adjustedUsd || 0), 0);
  }

  const zone = healthZone(hf);
  const gaugeHtml = renderGauge(hf, zone);

  // Liquidation prices
  const liqPrices = computeLiquidationPrices(collaterals, borrows);

  // Collateral table
  const collRows = collaterals.length > 0
    ? collaterals.map((c, i) => {
      const cf = c.collateralFactor ? (c.collateralFactor * 100).toFixed(0) + '%' : '—';
      const adj = c.adjustedUsd ? formatUsd(c.adjustedUsd) : '—';
      const sup = state.simMode
        ? `<input type="number" step="0.01" value="${(c.suppliedUsd||0).toFixed(2)}" class="sim-input" onchange="updateSimCollateral(${i},'suppliedUsd',this.value)"/>`
        : formatUsd(c.suppliedUsd || 0);
      const cfInput = state.simMode
        ? `<input type="number" step="1" value="${c.collateralFactor ? (c.collateralFactor*100).toFixed(0) : ''}" class="sim-input sim-input-sm" onchange="updateSimCollateral(${i},'collateralFactor',this.value)"/>%`
        : cf;
      return `<tr><td>${c.asset}</td><td>${sup}</td><td>${cfInput}</td><td>${adj}</td></tr>`;
    }).join('')
    : `<tr><td colspan="4" class="muted">No collateral</td></tr>`;

  // Borrow table
  const borrowRows = borrows.length > 0
    ? borrows.map((b, i) => {
      const bor = state.simMode
        ? `<input type="number" step="0.01" value="${(b.borrowedUsd||0).toFixed(2)}" class="sim-input" onchange="updateSimBorrow(${i},'borrowedUsd',this.value)"/>`
        : formatUsd(b.borrowedUsd || 0);
      return `<tr><td>${b.asset}</td><td>${bor}</td></tr>`;
    }).join('')
    : `<tr><td colspan="2" class="muted">No borrows</td></tr>`;

  // Liquidation prices table
  const liqRows = liqPrices.length > 0
    ? liqPrices.map(lp => {
      const weak = lp.isWeakest ? ' class="weakest"' : '';
      return `<tr${weak}><td>${lp.asset}</td><td>${formatPrice(lp.currentPrice)}</td><td>${formatPrice(lp.liquidationPrice)}</td><td>${formatPct(lp.dropPct)}</td></tr>`;
    }).join('')
    : `<tr><td colspan="4" class="muted">Need price feeds for liquidation prices</td></tr>`;

  const protocolLabel = PROTOCOLS[state.selectedProtocol]?.name || state.selectedProtocol;
  const chainLabel = CHAINS[state.selectedChain]?.name || state.selectedChain;

  container.innerHTML = `
    <div class="position-card">
      <div class="card-header">
        <span class="proto-badge">${protocolLabel}</span>
        <span class="chain-badge">${chainLabel}</span>
        ${state.simMode ? '<span class="sim-badge">SIMULATOR</span>' : ''}
      </div>

      ${gaugeHtml}

      <div class="totals-row">
        <div class="total-cell"><span class="total-label">Supplied</span><span class="total-value">${formatUsd(totalSupplied)}</span></div>
        <div class="total-cell"><span class="total-label">Borrowed</span><span class="total-value">${formatUsd(totalBorrowed)}</span></div>
        <div class="total-cell"><span class="total-label">Adj. Collateral</span><span class="total-value">${formatUsd(totalCollateral)}</span></div>
      </div>

      ${state.position.note ? `<p class="note">${state.position.note}</p>` : ''}

      <div class="section">
        <h3>Collateral</h3>
        <table class="data-table">
          <thead><tr><th>Asset</th><th>Supplied</th><th>CF</th><th>Adjusted</th></tr></thead>
          <tbody>${collRows}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Borrows</h3>
        <table class="data-table">
          <thead><tr><th>Asset</th><th>Borrowed</th></tr></thead>
          <tbody>${borrowRows}</tbody>
        </table>
      </div>

      <div class="section">
        <h3>Liquidation Prices</h3>
        <table class="data-table">
          <thead><tr><th>Asset</th><th>Current</th><th>Liq. Price</th><th>Drop</th></tr></thead>
          <tbody>${liqRows}</tbody>
        </table>
        ${liqPrices.length > 0 ? '<p class="table-note">🔴 Weakest link highlighted — closest to liquidation</p>' : ''}
      </div>
    </div>
  `;
}

function showError(msg) {
  document.getElementById('results').innerHTML = `<div class="error-msg">⚠ ${msg}</div>`;
}

// ── Adapter references (loaded via script tags in index.html) ──
// These are global because we're using plain script tags, not ES modules.
// MoonwellAdapter, AaveAdapter, SaveAdapter are defined by their adapter files.