// runner script, to create

/**
 * a simple script runner, to test the bundler and API.
 * for a simple target method, we just call the "nonce" method of the account itself.
 */

import { BigNumber, Signer, Wallet } from 'ethers'
import { JsonRpcProvider } from '@ethersproject/providers'
import { SimpleAccountFactory__factory } from '@account-abstraction/contracts'
import { formatEther, keccak256, parseEther } from 'ethers/lib/utils'
import { Command } from 'commander'
import { erc4337RuntimeVersion } from '@account-abstraction/utils'
import fs from 'fs'
import { DeterministicDeployer, HttpRpcClient, SimpleAccountAPI } from '@account-abstraction/sdk'
import { runBundler } from '../runBundler'
import { BundlerServer } from '../BundlerServer'
import { getNetworkProvider } from '../Config'
import * as readline from 'readline'

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

// during testing, it is necessary to replace the configuration data with your own, 
// which should match the hre.network.config.deterministicDeploymentProxy configuration
const DeterministicDeploymentProxy = {
  "gasPrice": 100000000000,
  "gasLimit": 100000,
  "signerAddress": "4c3f2fb71d114824115b44d6c60093167963eb8b",
  "transaction": "f8a78085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf38208dea07f9f8732ccf15277c33a3b4d8553d7ffea29f3615095ba4cc83399da1a5a64dfa07e3d2d32cdbd90b18c7d22918a73d33d88387ca833b63fd5974413afa4a52176",
  "address": "367888abd495445fa37db7e94d3c55323ee835c9",
  "chainId": 1117
}

// const DeterministicDeploymentProxy = { // EIP1559链
//   "gasPrice": 100000000000,
//   "gasLimit": 100000,
//   "signerAddress": "01c55e6957e54f61928991460bec55a86bf9854e",
//   "transaction": "f8a78085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf38208dda09c5aa2144cdb410cf0f2b22fadcc68b5bb1c406bbe32902b9a4c269e4725eb8aa0376701297c2586ae9b0303c0ccc7ccf09e8945bb1816d41fdbcdcbca8e00b197",
//   "address": "8704101c9e985507b0881602cfc65c26fb85ef6e",
//   "chainId": 1117
// }

class Runner {
  bundlerProvider!: HttpRpcClient
  accountApi!: SimpleAccountAPI

  /**
   *
   * @param provider - a provider for initialization. This account is used to fund the created account contract, but it is not the account or its owner.
   * @param bundlerUrl - a URL to a running bundler. must point to the same network the provider is.
   * @param accountOwner - the wallet signer account. used only as signer (not as transaction sender)
   * @param entryPointAddress - the entrypoint address to use.
   * @param index - unique salt, to allow multiple accounts with the same owner
   */
  constructor (
    readonly provider: JsonRpcProvider,
    readonly bundlerUrl: string,
    readonly accountOwner: Signer,
    readonly entryPointAddress = ENTRY_POINT,
    readonly index = 0
  ) {
  }

  async getAddress (): Promise<string> {
    return await this.accountApi.getCounterFactualAddress()
  }

  async init (deploymentSigner?: Signer): Promise<this> {
    console.log('#Runner: init')
    const net = await this.provider.getNetwork()
    const chainId = net.chainId
    DeterministicDeployer.overwriteDDPConfig(DeterministicDeploymentProxy)
    const dep = new DeterministicDeployer(this.provider)
    const accountDeployer = await DeterministicDeployer.getAddress(new SimpleAccountFactory__factory(), 0, [this.entryPointAddress])
    console.log('#Runner: init - SimpleAccountFactory address is ', accountDeployer)
    // const accountDeployer = await new SimpleAccountFactory__factory(this.provider.getSigner()).deploy().then(d=>d.address)
    if (!await dep.isContractDeployed(accountDeployer)) {
      if (deploymentSigner == null) {
        console.log(`AccountDeployer not deployed at ${accountDeployer}. run with --deployFactory`)
        process.exit(1)
      }
      DeterministicDeployer.checkDDPConfigInited()
      const dep1 = new DeterministicDeployer(deploymentSigner.provider as any, deploymentSigner)
      console.log('#Runner: init - SimpleAccountFactory deploying')
      await dep1.deterministicDeploy(new SimpleAccountFactory__factory(), 0, [this.entryPointAddress])
      
      await new Promise(resolve => setTimeout(resolve, 3000))
      console.log('#Runner: init - SimpleAccountFactory deployed')
    } else {
      console.log('#Runner: init - SimpleAccountFactory deployed')
    }
    this.bundlerProvider = new HttpRpcClient(this.bundlerUrl, this.entryPointAddress, chainId)
    this.accountApi = new SimpleAccountAPI({
      provider: this.provider,
      entryPointAddress: this.entryPointAddress,
      factoryAddress: accountDeployer,
      owner: this.accountOwner,
      index: this.index,
      overheads: {
        // perUserOp: 100000
      }
    })

    console.log('#Runner: inited')
    return this
  }

  parseExpectedGas (e: Error): Error {
    // parse a custom error generated by the BundlerHelper, which gives a hint of how much payment is missing
    const match = e.message?.match(/paid (\d+) expected (\d+)/)
    if (match != null) {
      const paid = Math.floor(parseInt(match[1]) / 1e9)
      const expected = Math.floor(parseInt(match[2]) / 1e9)
      return new Error(`Error: Paid ${paid}, expected ${expected} . Paid ${Math.floor(paid / expected * 100)}%, missing ${expected - paid} `)
    }
    return e
  }

  async runUserOp (target: string, data: string): Promise<void> {
    const userOp = await this.accountApi.createSignedUserOp({
      target,
      data
    })

    console.log('#Runner: runUserOp createSignedUserOp', userOp)

    try {
      console.log('#Runner: runUserOp sendUserOpToBundler')
      const userOpHash = await this.bundlerProvider.sendUserOpToBundler(userOp)
      console.log('#Runner: runUserOp getUserOpReceipt, userOpHash=', userOpHash)
      const txid = await this.accountApi.getUserOpReceipt(userOpHash)
      console.log('reqId', userOpHash, 'txid=', txid)
    } catch (e: any) {
      throw this.parseExpectedGas(e)
    }
  }
}

function waitForInput( message:string ) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise<string>((resolve) => {
    rl.question(message, (input) => {
      rl.close()
      resolve(input)
    })
  })
}

async function main (): Promise<void> {
  const program = new Command()
    .version(erc4337RuntimeVersion)
    .option('--network <string>', 'network name or url', 'http://localhost:8545')
    .option('--mnemonic <file>', 'mnemonic/private-key file of signer account (to fund account)')
    .option('--bundlerUrl <url>', 'bundler URL', 'http://localhost:3000/rpc')
    .option('--entryPoint <string>', 'address of the supported EntryPoint contract', ENTRY_POINT)
    .option('--nonce <number>', 'account creation nonce. default to random (deploy new account)')
    .option('--deployFactory', 'Deploy the "account deployer" on this network (default for testnet)')
    .option('--show-stack-traces', 'Show stack traces.')
    .option('--selfBundler', 'run bundler in-process (for debugging the bundler)')

  const opts = program.parse().opts()
  const provider = getNetworkProvider(opts.network)
  let signer: Signer
  const deployFactory: boolean = opts.deployFactory
  let bundler: BundlerServer | undefined
  if (opts.selfBundler != null) {
    // todo: if node is geth, we need to fund our bundler's account:
    const signer = provider.getSigner()

    const signerBalance = await provider.getBalance(signer.getAddress())
    const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    const bal = await provider.getBalance(account)
    if (bal.lt(parseEther('1')) && signerBalance.gte(parseEther('10000'))) {
      console.log('funding hardhat account', account)

      await signer.sendTransaction({
        to: account,
        value: parseEther('1').sub(bal),
        type: 0
      })
    }

    const argv = ['node', 'exec', '--config', './localconfig/bundler.config.json', '--unsafe', '--auto']
    if (opts.entryPoint != null) {
      argv.push('--entryPoint', opts.entryPoint)
    }
    bundler = await runBundler(argv)
    await bundler.asyncStart()
  }
  if (opts.mnemonic != null) {
    console.log('mnemonic file is', opts.mnemonic)
    signer = Wallet.fromMnemonic(fs.readFileSync(opts.mnemonic, 'ascii').trim()).connect(provider)
  } else {
    try {
      const accounts = await provider.listAccounts()
      if (accounts.length === 0) {
        console.log('fatal: no account. use --mnemonic (needed to fund account)')
        process.exit(1)
      }
      // for hardhat/node, use account[0]
      signer = provider.getSigner()
      // deployFactory = true
    } catch (e) {
      throw new Error('must specify --mnemonic')
    }
  }

  const signerBal = await getBalance(await signer.getAddress())
  console.log( '#Runner: signer balance is ', signerBal )

  // accountOwner is used to sign userOp
  // const accountOwner = new Wallet('0x'.padEnd(66, '7'))

  let privKey = await waitForInput("Enter the private key of the Account Owner, Otherwise, simply pressing the Enter key will use the default test private key:" )
  if ( privKey == null || privKey.length != 66 ) {
    privKey = '0x'.padEnd(66, '7')
  }
  console.log('Your private key is:', privKey)
  const accountOwner = new Wallet(privKey)

  const index = opts.nonce ?? Date.now()
  console.log('#using account index=', index, 'accountOwner address=', await accountOwner.getAddress(), 'signer address=', await signer.getAddress())
  const client = await new Runner(provider, opts.bundlerUrl, accountOwner, opts.entryPoint, index).init(deployFactory ? signer : undefined)

  const addr = await client.getAddress()

  async function isDeployed (addr: string): Promise<boolean> {
    return await provider.getCode(addr).then(code => code !== '0x')
  }

  async function getBalance (addr: string): Promise<BigNumber> {
    return await provider.getBalance(addr)
  }

  const bal = await getBalance(addr)
  console.log('account address', addr, 'deployed=', await isDeployed(addr), 'bal=', formatEther(bal))

  const gasPrice = await provider.getGasPrice()
  // TODO: actual required val
  const requiredBalance = gasPrice.mul(2e6)
  console.log('#Runner: requiredBalance is', requiredBalance)
  if (bal.lt(requiredBalance.div(2))) {
    console.log('funding account to', requiredBalance.toString())

    await signer.sendTransaction({
      to: addr,
      value: requiredBalance.sub(bal),
      type: 0
    }).then(async tx => await tx.wait())
  } else {
    console.log('not funding account. balance is enough')
  }

  const addBal = await getBalance(addr)
  const dest = addr
  const data = keccak256(Buffer.from('entryPoint()')).slice(0, 10)
  console.log('data=', data)
  await client.runUserOp(dest, data)
  console.log('after run1')
  const addBal2 = await getBalance(addr)
  console.log('#Runner: run first userOp cost', addBal.sub(addBal2).toString())
  // client.accountApi.overheads!.perUserOp = 30000
  await client.runUserOp(dest, data)
  console.log('after run2')
  const addBal3 = await getBalance(addr)
  console.log('#Runner: run second userOp cost', addBal2.sub(addBal3).toString())
  await bundler?.stop()
}

void main()
  .catch(e => { console.log(e); process.exit(1) })
  .then(() => process.exit(0))
