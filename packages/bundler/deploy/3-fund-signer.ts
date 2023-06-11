import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { parseEther } from 'ethers/lib/utils'

const fundsigner: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // on geth, fund the default "hardhat node" account.
  if (hre.network.name !== 'localhost' ) return
    
  const provider = hre.ethers.provider
  const signer = provider.getSigner()
  console.log('sponsor address is', await signer.getAddress())
  const signerBalance = await provider.getBalance(signer.getAddress())
  const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  const bal = await provider.getBalance(account)
  if (bal.lt(parseEther('1')) && signerBalance.gte(parseEther('10000'))) {
    console.log('funding hardhat account', account)
    await signer.sendTransaction({
      to: account,
      value: parseEther('1').sub(bal)
    })
  } else {
    console.log('no need funding')
  }
}

export default fundsigner
