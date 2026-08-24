/** Pure pooled-position health and liquidation math.
 * Pooled fields suppliedUsd, adjustedUsd, and borrowedUsd are already USD.
 * Boundary prices apply a dimensionless value multiplier to currentPrice.
 */
function finite(value) { return Number.isFinite(value) ? value : 0; }
function computeHealthFactor(collaterals, borrows) {
  const debt = borrows.reduce((sum, item) => sum + finite(item.borrowedUsd), 0);
  if (debt === 0) return Infinity;
  return collaterals.reduce((sum, item) => sum + finite(item.adjustedUsd), 0) / debt;
}
function computeAdjustedCollateral(collaterals) {
  return collaterals.map(item => ({ ...item, adjustedUsd: finite(item.suppliedUsd) * finite(item.collateralFactor) }));
}
function pooledStatus(adjusted, debt) { return debt === 0 ? 'no-debt' : adjusted <= debt ? 'already-liquidatable' : 'healthy'; }
function hasKnownAmountPrice(item) {
  return item.unitsKnown === true && item.liquidationModelKnown !== false && Number.isFinite(item.amount) && item.amount >= 0 && Number.isFinite(item.price) && item.price > 0;
}
function computeLiquidationPrices(collaterals, borrows) {
  const debt = borrows.reduce((sum, item) => sum + finite(item.borrowedUsd), 0);
  const adjusted = collaterals.reduce((sum, item) => sum + finite(item.adjustedUsd), 0);
  const positionStatus = pooledStatus(adjusted, debt);
  const rows = collaterals.map(item => {
    const base = { asset:item.asset, currentPrice:item.price||0, liquidationPrice:null, dropPct:null, status:positionStatus, isWeakest:false };
    if (positionStatus === 'no-debt') return base;
    if (positionStatus === 'already-liquidatable') return base;
    const required = debt - (adjusted - finite(item.adjustedUsd));
    if (required <= 0) return { ...base, status:'other-collateral-covers', liquidationPrice:0, dropPct:100 };
    if (!hasKnownAmountPrice(item) || finite(item.adjustedUsd) <= 0) return { ...base, status:'no-price' };
    const multiplier = required / finite(item.adjustedUsd);
    return { ...base, liquidationPrice:item.price*multiplier, dropPct:(1-multiplier)*100 };
  });
  const candidates = rows.filter(row => row.status === 'healthy' && Number.isFinite(row.dropPct));
  if (candidates.length) candidates.reduce((a,b) => a.dropPct <= b.dropPct ? a : b).isWeakest = true;
  return rows;
}
function computeDebtLiquidationPrices(collaterals, borrows) {
  const debt = borrows.reduce((sum, item) => sum + finite(item.borrowedUsd), 0);
  const adjusted = collaterals.reduce((sum, item) => sum + finite(item.adjustedUsd), 0);
  const positionStatus = pooledStatus(adjusted, debt);
  const rows = borrows.map(item => {
    const base = { asset:item.asset, currentPrice:item.price||0, liquidationPrice:null, risePct:null, status:positionStatus, isWeakest:false };
    if (finite(item.borrowedUsd) === 0) return { ...base, status:'no-debt' };
    if (positionStatus === 'already-liquidatable') return base;
    if (!hasKnownAmountPrice(item)) return { ...base, status:'no-price' };
    const capacity = adjusted - (debt - finite(item.borrowedUsd));
    if (capacity <= 0) return { ...base, status:'already-liquidatable' };
    const multiplier = capacity / finite(item.borrowedUsd);
    return { ...base, liquidationPrice:item.price*multiplier, risePct:(multiplier-1)*100 };
  });
  const candidates = rows.filter(row => row.status === 'healthy' && Number.isFinite(row.risePct));
  if (candidates.length) candidates.reduce((a,b) => a.risePct <= b.risePct ? a : b).isWeakest = true;
  return rows;
}
/** Integer-safe isolated boundaries; all values must already share one value unit. */
function computeLiquidationBoundaries(input) {
  const collateral=BigInt(input.collateralValue||0), debt=BigInt(input.debtValue||0), otherCollateral=BigInt(input.otherCollateralValue||0), otherDebt=BigInt(input.otherDebtValue||0);
  const threshold=BigInt(input.threshold||0), scale=BigInt(input.scale||10n**18n), collateralPrice=BigInt(input.currentCollateralPrice||0), debtPrice=BigInt(input.currentDebtPrice||0);
  if (debt+otherDebt===0n) return {status:'no-debt',collateralPriceDown:null,debtPriceUp:null};
  if (threshold===0n||collateralPrice===0n||debtPrice===0n||collateral===0n||debt===0n) return {status:'no-price',collateralPriceDown:null,debtPriceUp:null};
  const adjusted=collateral*threshold/scale+otherCollateral,totalDebt=debt+otherDebt,status=adjusted<=totalDebt?'already-liquidatable':'healthy',needed=totalDebt-otherCollateral;
  const collateralPriceDown=needed<=0n?{status:'other-collateral-covers',price:'0'}:{status,price:(collateralPrice*needed*scale/(collateral*threshold)).toString()};
  const capacity=adjusted-otherDebt,debtPriceUp=capacity<=0n?{status:'already-liquidatable',price:'0'}:{status,price:(debtPrice*capacity/debt).toString()};
  return {status,collateralPriceDown,debtPriceUp};
}
function healthZone(hf) { if(hf===Infinity||hf>100)return{label:'No Borrow',color:'#4ade80',zone:'safe'};if(hf>=1.5)return{label:'Safe',color:'#4ade80',zone:'safe'};if(hf>=1.4)return{label:'Comfortable',color:'#a3e635',zone:'comfortable'};if(hf>=1.2)return{label:'Aggressive',color:'#fbbf24',zone:'aggressive'};if(hf>=1)return{label:'Danger',color:'#fb923c',zone:'danger'};return{label:'Liquidatable',color:'#f87171',zone:'liquidatable'}; }
function formatUsd(v){if(v===Infinity)return'∞';if(v>=1e9)return`$${(v/1e9).toFixed(2)}B`;if(v>=1e6)return`$${(v/1e6).toFixed(2)}M`;if(v>=1e3)return`$${(v/1e3).toFixed(1)}K`;return`$${finite(v).toFixed(2)}`;}
function formatPrice(v){if(!Number.isFinite(v)||v<=0)return'$0';if(v>=1000)return`$${v.toLocaleString('en-US',{maximumFractionDigits:0})}`;return v>=1?`$${v.toFixed(2)}`:`$${v.toFixed(6)}`;}
function formatPct(v){return v===Infinity?'∞':`${v.toFixed(1)}%`;}
const exportsObject={computeHealthFactor,computeAdjustedCollateral,computeLiquidationPrices,computeDebtLiquidationPrices,computeLiquidationBoundaries,healthZone,formatUsd,formatPrice,formatPct};
if(typeof window!=='undefined')Object.assign(window,exportsObject);
if(typeof module!=='undefined')module.exports=exportsObject;
