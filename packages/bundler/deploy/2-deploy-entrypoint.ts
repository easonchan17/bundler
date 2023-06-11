import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { ethers } from 'hardhat'
import { DeterministicDeployer } from '@account-abstraction/sdk'
import { EntryPoint__factory } from '@account-abstraction/contracts'

// deploy entrypoint - but only on debug network..
const deployEP: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  DeterministicDeployer.overwriteDDPConfig( hre.network.config.deterministicDeploymentProxy )
  DeterministicDeployer.checkDDPConfigInited()
  
  const dep = new DeterministicDeployer(ethers.provider)
  console.log('The signer address of the deployment entrypoint contract transaction is', await ethers.provider.getSigner().getAddress())
  const epAddr = DeterministicDeployer.getAddress(EntryPoint__factory.bytecode)
  if (await dep.isContractDeployed(epAddr)) {
    console.log('EntryPoint already deployed at', epAddr)
    return
  }

  const net = await hre.ethers.provider.getNetwork()
  if (net.chainId !== 1337 && net.chainId != 31337 && net.chainId != DeterministicDeployer.deploymentChainId) {
    console.log('NOT deploying EntryPoint. use pre-deployed entrypoint')
    process.exit(1)
  }



  await dep.deterministicDeploy(EntryPoint__factory.bytecode)
  console.log('Deployed EntryPoint at', epAddr)
}

export default deployEP
