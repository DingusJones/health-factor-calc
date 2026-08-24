/** Morpho Blue: API discovery, one independent container per market. */
const MORPHO_QUERY = `query UserRisk($chainId: Int!, $address: String!) {
  userByAddress(chainId: $chainId, address: $address) {
    address
    marketPositions {
      market { marketId lltv oracle { address } loanAsset { address symbol decimals } collateralAsset { address symbol decimals } }
      state { supplyShares supplyAssets supplyAssetsUsd borrowShares borrowAssets borrowAssetsUsd collateral collateralUsd }
    }
    vaultPositions { vault { address name } state { assets assetsUsd shares } }
    vaultV2Positions { vault { address name } assets assetsUsd shares }
  }
}`;
async function morphoGraphql(api, query, variables) {
  const response=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables})});
  if(!response.ok) throw new Error(`Morpho API HTTP ${response.status}`); const body=await response.json();
  if(body.errors?.length) throw new Error(`Morpho API: ${body.errors.map(e=>e.message).join('; ')}`); return body.data;
}
function decimalRaw(value) { if(value===null||value===undefined||!/^[0-9]+$/.test(String(value))) throw new Error(`Invalid Morpho integer field: ${value}`); return BigInt(value); }
function normalizeMorphoUser(data) {
  if (data == null || typeof data !== 'object') throw new Error('Malformed Morpho GraphQL response');
  const user=data.userByAddress;if(user==null)return null;
  if(!Array.isArray(user.marketPositions)||!Array.isArray(user.vaultPositions)||!Array.isArray(user.vaultV2Positions))throw new Error('Malformed Morpho user position arrays');
  for(const position of user.marketPositions){const m=position?.market,s=position?.state;
    if(!m?.marketId||!m?.oracle?.address||!m?.loanAsset?.address||!m?.collateralAsset?.address||s==null)throw new Error('Malformed Morpho market position');
    decimalRaw(m.lltv);decimalRaw(s.collateral);decimalRaw(s.borrowAssets);
  }
  return user;
}
function divCeil(n,d) { return (n+d-1n)/d; }
function morphoMarketContainer(pos,chainId,oraclePrice) {
  const m=pos.market,s=pos.state,collateral=decimalRaw(s.collateral),debt=decimalRaw(s.borrowAssets),lltv=decimalRaw(m.lltv);
  const warnings=[]; let hf=null, liquidation=null;
  if(debt===0n) warnings.push(collateral>0n?'Collateral-only market; no borrower HF applies.':'Supply-only market; no borrower HF applies.');
  else if(oraclePrice===null) warnings.push('Canonical oracle price is missing, zero, or reverted; HF is withheld.');
  else if(collateral===0n) warnings.push('Debt exists without collateral; position is already liquidatable.');
  else { const value=collateral*oraclePrice/(10n**36n), maxBorrow=value*lltv/(10n**18n); hf=ratioDecimal(maxBorrow,debt,18);
    const boundary=divCeil(debt*(10n**36n)*(10n**18n),collateral*lltv);
    liquidation={status:maxBorrow<=debt?'already-liquidatable':'healthy',collateralPriceDown:{price:boundary.toString(),direction:'falls'},
      debtPriceUp:{price:ratioDecimal(oraclePrice,boundary,18),direction:'rises',unit:'multiple of current debt price'},assumption:'other asset price held constant'};
    if(maxBorrow<=debt) warnings.push('Position is already liquidatable at the protocol oracle price.'); }
  if(oraclePrice!==null) warnings.push('Oracle value was read at RPC latest; the response has no oracle update timestamp, so freshness cannot be proven.');
  const assets=[makeAsset({chainId,address:m.collateralAsset.address,symbol:m.collateralAsset.symbol,decimals:m.collateralAsset.decimals,rawAmount:collateral,role:'collateral',protocolRiskPrice:oraclePrice?.toString()??null,oracleSource:m.oracle.address,warnings:debt?warnings:[]}),
    makeAsset({chainId,address:m.loanAsset.address,symbol:m.loanAsset.symbol,decimals:m.loanAsset.decimals,rawAmount:debt,role:'debt',oracleSource:m.oracle.address})];
  return makeRiskContainer({id:`morpho:${chainId}:${m.marketId}`,protocol:'morpho',chainId,marketId:m.marketId,assets,healthFactor:hf,liquidation,warnings,
    provenance:{discovery:'Morpho official GraphQL API',oracle:m.oracle.address,oracleRead:'direct IOracle.price() eth_call at latest'}});
}
async function fetchPosition(wallet,chainId,chainConfig) {
  if(!isEvmAddress(wallet)) throw new Error('Invalid EVM wallet address'); if(!chainConfig?.morpho) throw new Error(`Morpho not configured on chain ${chainId}`);
  const data=await morphoGraphql(chainConfig.morpho.api,MORPHO_QUERY,{chainId,address:wallet}); const user=normalizeMorphoUser(data);
  if(!user) return {protocol:'morpho',chainId,chain:chainConfig.name,noPosition:true,riskContainers:[],collaterals:[],borrows:[]};
  const containers=await Promise.all((user.marketPositions||[]).map(async p=>{
    let price=null; try { const raw=await rpcCall(chainConfig.rpcs,p.market.oracle.address,'0xa035b1fe');
      if(!/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error('malformed oracle response'); const value=BigInt(raw); if(value===0n) throw new Error('zero oracle price'); price=value;
    } catch(e) { const c=morphoMarketContainer(p,chainId,null); c.warnings.push(`Oracle read failed: ${e.message}`); return c; }
    return morphoMarketContainer(p,chainId,price);
  }));
  const unsupported=[...(user.vaultPositions||[]),...(user.vaultV2Positions||[])];
  const warnings=unsupported.map(v=>`Vault position ${v.vault?.name||v.vault?.address||'unknown'} is supply-only and is not assigned a borrower HF.`);
  return {protocol:'morpho',chainId,chain:chainConfig.name,healthFactor:null,totalSuppliedUsd:0,totalBorrowedUsd:0,totalCollateralUsd:0,
    collaterals:[],borrows:[],riskContainers:containers,warnings,noPosition:containers.length===0&&unsupported.length===0,
    note:'Morpho markets are isolated. Each market is shown independently; canonical liquidation values are withheld when the market oracle cannot be safely read.'};
}
if(typeof window!=='undefined') window.MorphoAdapter={fetchPosition,MORPHO_QUERY,morphoMarketContainer};
if(typeof module!=='undefined') module.exports={fetchPosition,MORPHO_QUERY,morphoMarketContainer,decimalRaw,normalizeMorphoUser};
