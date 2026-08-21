/**
 * Chain configuration — RPC endpoints and protocol contract addresses.
 *
 * To add a new chain: add an entry to CHAINS with an id, name, and at least one RPC.
 * To add a new protocol to a chain: add its contract addresses under that chain.
 * Adapters reference this config by chainId.
 */

const CHAINS = {
  // ── EVM ──
  1: {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    rpcs: ['https://1rpc.io/eth', 'https://ethereum.publicnode.com', 'https://cloudflare-eth.com'],
    aave: {
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
      uiPoolDataProvider: '0x56b7A1012765C285afAC8b8F25C69Bf10ccfE978',
    },
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'BASE',
    rpcs: ['https://mainnet.base.org', 'https://base.publicnode.com'],
    aave: {
      pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
      uiPoolDataProvider: '0xb84A20e848baE3e13897934bB4e74E2225f4546B',
    },
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'OP',
    rpcs: ['https://mainnet.optimism.io', 'https://optimism.publicnode.com'],
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
      uiPoolDataProvider: '0xa6741111f4CcB5162Ec6A825465354Ed8c6F7095',
    },
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'ARB',
    rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.publicnode.com'],
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
      uiPoolDataProvider: '0x13c833256BD767da2320d727a3691BAff3770E39',
    },
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    rpcs: ['https://polygon-rpc.com', 'https://polygon-bor.publicnode.com'],
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
      uiPoolDataProvider: '0xFa1A7c4a8A63C9CAb150529c26f182cBB5500944',
    },
  },
  43114: {
    id: 43114,
    name: 'Avalanche',
    shortName: 'AVAX',
    rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche.publicnode.com'],
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
      uiPoolDataProvider: '0x3518E8927A7827CDdAf841872453003CA95906A3',
    },
  },
  56: {
    id: 56,
    name: 'BNB Chain',
    shortName: 'BNB',
    rpcs: ['https://bsc-dataseed.binance.org'],
    aave: {
      pool: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
      poolAddressesProvider: '0xff75B6da14FffbbfD355Daf7a2731456b3562Ba6D',
      uiPoolDataProvider: '0x632b5Dfc315b228bfE779E6442322Ad8a110Ea13',
    },
  },
  100: {
    id: 100,
    name: 'Gnosis',
    shortName: 'GNO',
    rpcs: ['https://rpc.gnosischain.com'],
    aave: {
      pool: '0xb50201558B00496A145fE76f7424749556E326D8',
      poolAddressesProvider: '0x36616cf17557639614c1cdDb356b1B83fc0B2132',
      uiPoolDataProvider: '0xD14F4d3495d5096a31F33605F2D0803bbe2EAdc0',
    },
  },
  534352: {
    id: 534352,
    name: 'Scroll',
    shortName: 'SCR',
    rpcs: ['https://rpc.scroll.io'],
    aave: {
      pool: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
      poolAddressesProvider: '0x69850D0B276776781C063771b161bd8894BCdD04',
      uiPoolDataProvider: '0x6926c8195a8840099Daa643C2d9aDE18C0D233d9',
    },
  },
  59144: {
    id: 59144,
    name: 'Linea',
    shortName: 'LNA',
    rpcs: ['https://rpc.linea.build'],
    aave: {
      pool: '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac',
      poolAddressesProvider: '0x89502c3731F69DDC95B65753708A07F8Cd0373F4',
      uiPoolDataProvider: '0x898813Dd328BD3D7353c77aD0B1C0E10F3773E29',
    },
  },
  5000: {
    id: 5000,
    name: 'Mantle',
    shortName: 'MNT',
    rpcs: ['https://rpc.mantle.xyz'],
    aave: {
      pool: '0x458F293454fE0d67EC0655f3672301301DD51422',
      poolAddressesProvider: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
      uiPoolDataProvider: '0x077df1990bF703fb1687515747ddb13621133649',
    },
  },
  146: {
    id: 146,
    name: 'Sonic',
    shortName: 'S',
    rpcs: ['https://rpc.soniclabs.com'],
    aave: {
      pool: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
      poolAddressesProvider: '0x5C2e738F6E27bCE0F7558051Bf90605dD6176900',
      uiPoolDataProvider: '0x4F3F69979ED28c962028582B1760E98B1a117097',
    },
  },
  42220: {
    id: 42220,
    name: 'Celo',
    shortName: 'CELO',
    rpcs: ['https://forno.celo.org'],
    aave: {
      pool: '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402',
      poolAddressesProvider: '0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5',
      uiPoolDataProvider: '0xe48424542b30b0b8D1Dc09099aceE407f40b4491',
    },
  },
  1088: {
    id: 1088,
    name: 'Metis',
    shortName: 'METIS',
    rpcs: ['https://andromeda.metis.io/ws'],
    aave: {
      pool: '0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57',
      poolAddressesProvider: '0xB9FABd7500B2C6781c35Dd48d54f81fc2299D7AF',
      uiPoolDataProvider: '0xE970Db949A75702bB5A280125742078cF39CE568',
    },
  },
  324: {
    id: 324,
    name: 'zkSync',
    shortName: 'ZK',
    rpcs: ['https://mainnet.era.zksync.io'],
    aave: {
      pool: '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c',
      poolAddressesProvider: '0x2A3948BB219D6B2Fa83D64100006391a96bE6cb7',
      uiPoolDataProvider: '0x419FFd4736671bbe1d9122d797345774Bd5db3b0',
    },
  },

  // ── Solana ──
  'solana': {
    id: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    rpcs: ['https://api.mainnet-beta.solana.com'],
    save: {
      apiBase: 'https://api.solend.fi',
      mainMarket: '4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY',
    },
  },
};

/**
 * Protocol registry — defines which protocols are available on which chains.
 * To add a new protocol: add an entry here with its adapter module and supported chains.
 * The app dynamically loads adapters from this registry.
 */
const PROTOCOLS = {
  moonwell: {
    name: 'Moonwell',
    chains: [8453, 10],
    chainType: 'evm',
    adapter: 'adapters/moonwell.js',
  },
  aave: {
    name: 'Aave V3',
    chains: [1, 8453, 10, 42161, 137, 43114, 56, 100, 534352, 59144, 5000, 146, 42220, 1088, 324],
    chainType: 'evm',
    adapter: 'adapters/aave.js',
  },
  save: {
    name: 'Save (Solend)',
    chains: ['solana'],
    chainType: 'solana',
    adapter: 'adapters/save.js',
  },
  // ── Future protocols (add when validated) ──
  // morpho: {
  //   name: 'Morpho',
  //   chains: [1, 8453],
  //   chainType: 'evm',
  //   adapter: 'adapters/morpho.js',
  // },
  // kamino: {
  //   name: 'Kamino',
  //   chains: ['solana'],
  //   chainType: 'solana',
  //   adapter: 'adapters/kamino.js',
  // },
  // marginfi: {
  //   name: 'Marginfi',
  //   chains: ['solana'],
  //   chainType: 'solana',
  //   adapter: 'adapters/marginfi.js',
  // },
};

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.CHAINS = CHAINS;
  window.PROTOCOLS = PROTOCOLS;
}
if (typeof module !== 'undefined') module.exports = { CHAINS, PROTOCOLS };