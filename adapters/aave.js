/** Aave V3 aggregate reader plus verified V3.3 UI-provider reads on Ethereum/Base. */
const GET_USER_ACCOUNT_DATA_SELECTOR='0xb691bc39';
const GET_RESERVES_DATA_SELECTOR='0xec489c21';
const GET_USER_RESERVES_DATA_SELECTOR='0x51974cc0';
const RAY=10n**27n;

function wordAt(hex,byteOffset){const start=2+byteOffset*2,end=start+64;if(!/^0x[0-9a-fA-F]*$/.test(hex)||end>hex.length)throw new Error('Aave ABI response is truncated');return BigInt('0x'+hex.slice(start,end));}
function addressWord(value){return '0x'+value.toString(16).padStart(64,'0').slice(24);}
function stringAt(hex,tupleStart,relativeOffset){const start=tupleStart+Number(relativeOffset),length=Number(wordAt(hex,start));if(!Number.isSafeInteger(length)||length>4096)throw new Error('Invalid Aave ABI string length');const first=2+(start+32)*2,last=first+length*2;if(last>hex.length)throw new Error('Truncated Aave ABI string');const bytes=hex.slice(first,last).match(/.{2}/g)||[];return new TextDecoder().decode(Uint8Array.from(bytes,b=>parseInt(b,16)));}
function rayMul(value,index){return (value*index+RAY/2n)/RAY;}
function rawUsd(raw,decimals,price,baseUnit){return Number(raw)*Number(price)/Number(10n**BigInt(decimals))/Number(baseUnit);}

/** Decode Aave Origin V3.3 getReservesData: dynamic 40-word tuples + base info. */
function decodeReservesData(hex){
  const arrayStart=Number(wordAt(hex,0)),baseCurrencyUnit=wordAt(hex,32),length=Number(wordAt(hex,arrayStart));
  if(!Number.isSafeInteger(length)||length>256)throw new Error('Invalid Aave reserve count');
  const offsetsStart=arrayStart+32,reserves=[];
  for(let i=0;i<length;i++){
    const tupleStart=offsetsStart+Number(wordAt(hex,offsetsStart+i*32));
    const w=n=>wordAt(hex,tupleStart+n*32);
    reserves.push({underlyingAsset:addressWord(w(0)),name:stringAt(hex,tupleStart,w(1)),symbol:stringAt(hex,tupleStart,w(2)),decimals:Number(w(3)),
      baseLtvBps:Number(w(4)),liquidationThresholdBps:Number(w(5)),liquidationBonusBps:Number(w(6)),reserveFactorBps:Number(w(7)),
      usageAsCollateralEnabled:w(8)!==0n,borrowingEnabled:w(9)!==0n,isActive:w(10)!==0n,isFrozen:w(11)!==0n,
      liquidityIndex:w(12),variableBorrowIndex:w(13),aTokenAddress:addressWord(w(17)),variableDebtTokenAddress:addressWord(w(18)),
      priceInMarketReferenceCurrency:w(22),priceOracle:addressWord(w(23)),isPaused:w(28)!==0n,isSiloedBorrowing:w(29)!==0n,
      isolationModeTotalDebt:w(31),debtCeiling:w(33),debtCeilingDecimals:Number(w(34)),borrowCap:w(35),supplyCap:w(36),
      borrowableInIsolation:w(37)!==0n,virtualUnderlyingBalance:w(38),deficit:w(39)});
  }
  return {reserves,baseCurrencyUnit};
}

/** Decode Aave Origin V3.3 getUserReservesData: static four-word tuples + eMode id. */
function decodeUserReservesData(hex){
  const arrayStart=Number(wordAt(hex,0)),userEmodeCategoryId=Number(wordAt(hex,32)),length=Number(wordAt(hex,arrayStart));
  if(!Number.isSafeInteger(length)||length>256)throw new Error('Invalid Aave user reserve count');
  const items=[];for(let i=0;i<length;i++){const start=arrayStart+32+i*128,w=n=>wordAt(hex,start+n*32);items.push({underlyingAsset:addressWord(w(0)),scaledATokenBalance:w(1),usageAsCollateralEnabledOnUser:w(2)!==0n,scaledVariableDebt:w(3)});}
  return {items,userEmodeCategoryId};
}

async function fetchPerAsset(wallet,chainId,chainConfig){
  if(![1,8453].includes(chainId))throw new Error('Per-asset ABI is verified only for Ethereum and Base');
  const cfg=chainConfig.aave,provider=encodeAddress(cfg.poolAddressesProvider),user=encodeAddress(wallet);
  const [reserveHex,userHex]=await Promise.all([
    rpcCall(chainConfig.rpcs,cfg.uiPoolDataProvider,GET_RESERVES_DATA_SELECTOR+provider),
    rpcCall(chainConfig.rpcs,cfg.uiPoolDataProvider,GET_USER_RESERVES_DATA_SELECTOR+provider+user),
  ]);
  const reserveData=decodeReservesData(reserveHex),userData=decodeUserReservesData(userHex);
  const metadata=new Map(reserveData.reserves.map(item=>[item.underlyingAsset.toLowerCase(),item]));
  const collaterals=[],borrows=[];
  for(const userReserve of userData.items){
    const reserve=metadata.get(userReserve.underlyingAsset.toLowerCase());if(!reserve)throw new Error(`Missing reserve metadata for ${userReserve.underlyingAsset}`);
    const supplyRaw=rayMul(userReserve.scaledATokenBalance,reserve.liquidityIndex),debtRaw=rayMul(userReserve.scaledVariableDebt,reserve.variableBorrowIndex);
    const price=Number(reserve.priceInMarketReferenceCurrency)/Number(reserveData.baseCurrencyUnit);
    const emodeActive=userData.userEmodeCategoryId>0;
    const common={asset:reserve.symbol,address:reserve.underlyingAsset,decimals:reserve.decimals,price,priceSource:'Aave oracle',unitsKnown:true,liquidationModelKnown:!emodeActive,
      userEmodeCategoryId:userData.userEmodeCategoryId,reserveLiquidationThresholdBps:reserve.liquidationThresholdBps,isolationMode:reserve.debtCeiling>0n,
      debtCeilingRaw:reserve.debtCeiling.toString(),debtCeilingDecimals:reserve.debtCeilingDecimals,borrowableInIsolation:reserve.borrowableInIsolation,isSiloedBorrowing:reserve.isSiloedBorrowing};
    if(supplyRaw>0n){const suppliedUsd=rawUsd(supplyRaw,reserve.decimals,reserve.priceInMarketReferenceCurrency,reserveData.baseCurrencyUnit),factor=!emodeActive?reserve.liquidationThresholdBps/10000:null;
      collaterals.push({...common,amount:Number(supplyRaw)/10**reserve.decimals,rawAmount:supplyRaw.toString(),scaledATokenBalanceRaw:userReserve.scaledATokenBalance.toString(),suppliedUsd,
        collateralEnabled:userReserve.usageAsCollateralEnabledOnUser,collateralFactor:userReserve.usageAsCollateralEnabledOnUser?factor:0,adjustedUsd:userReserve.usageAsCollateralEnabledOnUser&&factor!=null?suppliedUsd*factor:0});}
    if(debtRaw>0n){borrows.push({...common,amount:Number(debtRaw)/10**reserve.decimals,rawAmount:debtRaw.toString(),scaledVariableDebtRaw:userReserve.scaledVariableDebt.toString(),borrowedUsd:rawUsd(debtRaw,reserve.decimals,reserve.priceInMarketReferenceCurrency,reserveData.baseCurrencyUnit)});}
  }
  return {collaterals,borrows,userEmodeCategoryId:userData.userEmodeCategoryId};
}

async function fetchPosition(wallet,chainId,chainConfig){
  if(!chainConfig?.aave)throw new Error(`Aave not configured on chain ${chainId}`);
  const result=await rpcCall(chainConfig.rpcs,chainConfig.aave.pool,GET_USER_ACCOUNT_DATA_SELECTOR+encodeAddress(wallet));
  const decoded=decodeGetUserAccountData(result);
  if(BigInt(decoded.totalCollateralBaseRaw)===0n&&BigInt(decoded.totalDebtBaseRaw)===0n)return{protocol:'aave',chain:chainConfig.name,chainId,healthFactor:Infinity,totalSuppliedUsd:0,totalBorrowedUsd:0,totalCollateralUsd:0,collaterals:[],borrows:[],noPosition:true};
  const position={protocol:'aave',chain:chainConfig.name,chainId,healthFactor:decoded.healthFactor,totalSuppliedUsd:decoded.totalCollateralBase,totalBorrowedUsd:decoded.totalDebtBase,
    totalCollateralUsd:decoded.totalCollateralBase*(decoded.currentLiquidationThresholdBps/10000),liquidationThreshold:decoded.currentLiquidationThreshold,availableBorrowsUsd:decoded.availableBorrowsBase,
    collaterals:[],borrows:[],liquidationPrices:[],warnings:[],raw:decoded};
  try{const detail=await fetchPerAsset(wallet,chainId,chainConfig);position.collaterals=detail.collaterals;position.borrows=detail.borrows;position.userEmodeCategoryId=detail.userEmodeCategoryId;
    if(detail.userEmodeCategoryId>0)position.warnings.push(`User eMode category ${detail.userEmodeCategoryId} is active. Aggregate Pool health is authoritative; per-asset liquidation thresholds are displayed but boundaries are withheld because category bitmaps were not decoded.`);
  }catch(error){position.warnings.push(`Aggregate Aave totals and health factor are available. Per-asset data is unavailable: ${error.message}. No per-asset liquidation prices are estimated.`);}
  return position;
}
if(typeof window!=='undefined')window.AaveAdapter={fetchPosition};
if(typeof module!=='undefined')module.exports={fetchPosition,decodeReservesData,decodeUserReservesData,rayMul};
