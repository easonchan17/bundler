import '@nomiclabs/hardhat-ethers'
import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'

import fs from 'fs'

import { HardhatUserConfig } from 'hardhat/config'
import { NetworkUserConfig } from 'hardhat/src/types/config'

const mnemonicFileName = process.env.MNEMONIC_FILE
let mnemonic = 'test '.repeat(11) + 'junk'
if (mnemonicFileName != null && fs.existsSync(mnemonicFileName)) {
  mnemonic = fs.readFileSync(mnemonicFileName, 'ascii').trim()
}

const infuraUrl = (name: string): string => `https://${name}.infura.io/v3/${process.env.INFURA_ID}`

function getNetwork (url: string): NetworkUserConfig {
  return {
    url,
    accounts: {
      mnemonic
    }
  }
}

function getInfuraNetwork (name: string): NetworkUserConfig {
  return getNetwork(infuraUrl(name))
}

const config: HardhatUserConfig = {
  typechain: {
    outDir: 'src/types',
    target: 'ethers-v5'
  },
  networks: {
    localhost: {
      url: 'http://localhost:8545/',
      saveDeployments: false,
      deterministicDeploymentProxy: {
      }
    },
    goerli: getInfuraNetwork('goerli'),
    coreLocalhost: {
      url: 'http://localhost:8579',
      saveDeployments: false,
      deterministicDeploymentProxy: {
        "gasPrice": 100000000000,
        "gasLimit": 100000,
        "signerAddress": "1e440618d32b94d7bc8ecf9c658174ac18b21026",
        "transaction": "f8a78085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf38208dda08bcfb8460e3ce571e322939399c9f3f0026d19336a6172f36c68da1d8dc8420ea00d0aefe6e2748e13977e2bf65ff4858bafb8958610c4c108647c7fab4b76b433",
        "address": "6024784e42f669ced84a868647836ea94a4dc56c",
        "chainId": 1117
      }
    },
    coreTestnet: {
      url:''
    },
    coreMainnet: {
      url:''
    }
  },
  solidity: {
    version: '0.8.15',
    settings: {
      optimizer: { enabled: true }
    }
  }
}

export default config
