const test=require('node:test');
const assert=require('node:assert/strict');
const {SELECTORS,marketForPosition,normalizeNativePosition,suppliedRawFromCToken,decimalString,uintWord,addressWord,apiValuation,applyDisplayPrice,enrichMarket,fetchPosition}=require('../adapters/moonwell');
const wallet='0x'+'11'.repeat(20),mToken='0x'+'22'.repeat(20),underlying='0x'+'33'.repeat(20),zero='0x'+'00'.repeat(20);
const word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');

test('matches Moonwell position to market by address before ambiguous symbol',()=>{
  const markets=[{asset:'USDC',mTokenAddress:'0x'+'44'.repeat(20),collateralFactor:.1},{asset:'USDC',mTokenAddress:mToken,assetAddress:underlying,collateralFactor:.86}];
  const match=marketForPosition({market:'USDC',marketAddress:mToken},markets);
  assert.equal(match.collateralFactor,.86);
  const normalized=normalizeNativePosition({market:'USDC',marketAddress:mToken,suppliedUsd:10,borrowedUsd:2,collateralUsd:8,collateralEnabled:true},match);
  assert.equal(normalized.assetAddress,underlying);assert.equal(normalized.mTokenAddress,mToken);assert.equal(normalized.collateralFactor,.86);
});

test('converts cToken balance through exchangeRateStored without losing raw precision',()=>{
  assert.equal(suppliedRawFromCToken('250000000','20000000000000000'),'5000000');
  assert.equal(decimalString('5000000',6),'5');
  assert.equal(decimalString('1234500',6),'1.2345');
});

test('treats Moonwell mWETH as native ETH with 18 decimals and no zero-address decimals call',async()=>{
  const calls=[];
  const call=async(_rpcs,to,data)=>{calls.push({to,data});if(data.startsWith(SELECTORS.balanceOf))return word(2500000000000000000n);if(data===SELECTORS.exchangeRateStored)return word(1000000000000000000n);if(data.startsWith(SELECTORS.borrowBalanceStored))return word(100000000000000000n);throw new Error('unexpected native ETH call');};
  const result=await enrichMarket(wallet,{mTokenAddress:mToken,assetAddress:zero,symbol:'mWETH'},['rpc'],call,a=>a.slice(2).padStart(64,'0'));
  assert.equal(result.supply.decimals,18);assert.equal(result.supply.humanAmount,'2.5');assert.equal(result.borrow.humanAmount,'0.1');assert.equal(result.warnings.length,0);assert.equal(calls.length,3);
});

test('uses verified selectors and strictly decodes ABI words',()=>{
  assert.deepEqual(SELECTORS,{balanceOf:'0x70a08231',decimals:'0x313ce567',exchangeRateStored:'0x182df0f5',borrowBalanceStored:'0x95dd9193',underlying:'0x6f307dc3'});
  assert.equal(uintWord(word(6),'decimals'),6n);
  assert.equal(addressWord('0x'+'0'.repeat(24)+underlying.slice(2),'underlying'),underlying);
  assert.throws(()=>uintWord('0x01','balanceOf'),/Malformed/);
});

test('preserves API USD fallback and warnings when one RPC amount path fails',async()=>{
  const calls=[];
  const call=async(_rpcs,to,data)=>{calls.push({to,data});if(data.startsWith(SELECTORS.balanceOf))return word(250000000);if(data===SELECTORS.exchangeRateStored)return word(20000000000000000n);if(data.startsWith(SELECTORS.borrowBalanceStored))throw new Error('borrow RPC unavailable');if(data===SELECTORS.decimals)return word(6);throw new Error('unexpected');};
  const result=await enrichMarket(wallet,{mTokenAddress:mToken,assetAddress:underlying},['rpc'],call,a=>a.slice(2).padStart(64,'0'));
  assert.equal(result.supply.rawAmount,'5000000');assert.equal(result.supply.humanAmount,'5');assert.equal(result.borrow,null);
  assert.match(result.warnings.join(' '),/RPC failure for borrowBalance/);
  assert.equal(apiValuation(50,result.supply),10);assert.equal(apiValuation(50,null),null);
  assert.equal(calls.length,4);
});

test('external display price cannot replace Moonwell API valuation risk price',()=>{
  const item={price:10,protocolRiskPrice:10,priceSource:'Moonwell API valuation',priceBasis:'conditional-api-valuation'};
  applyDisplayPrice(item,12);
  assert.equal(item.price,10);assert.equal(item.protocolRiskPrice,10);assert.equal(item.displayPrice,12);
  assert.match(item.displayPriceSource,/external spot/);
});

test('fetchPosition wraps map callback so fetch receives the function, not the array index',async()=>{
  const originalFetch=global.fetch,originalRpc=global.rpcCall,originalEncode=global.encodeAddress;
  const responses={
    '/health/0x1111111111111111111111111111111111111111?chain=base':{success:true,data:{address:wallet,healthFactor:1.5,totalSupplyUsd:0,totalBorrowUsd:0,totalCollateralUsd:0,marketCount:0}},
    '/positions/0x1111111111111111111111111111111111111111?chain=base&active=true':{success:true,data:[]},
    '/markets?chain=base':{success:true,data:[]}
  };
  global.fetch=async url=>{const marker='https://api.moonwell.fi/v1';const path=url.slice(url.indexOf(marker)+marker.length);assert.ok(responses[path],`unexpected Moonwell path: ${path}`);return{ok:true,json:async()=>responses[path]};};
  global.rpcCall=async()=>word(0);global.encodeAddress=address=>address.slice(2).padStart(64,'0');
  try { const result=await fetchPosition('0x1111111111111111111111111111111111111111',8453,{rpcs:['rpc']}); assert.equal(result.healthFactor,1.5); }
  finally { global.fetch=originalFetch;global.rpcCall=originalRpc;global.encodeAddress=originalEncode; }
});
