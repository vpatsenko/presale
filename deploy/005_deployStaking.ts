import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const roomToken = '0x809fe0C6acD263C9CF987f3D30aD47Fdc4706e54';

    const { deployer } = await getNamedAccounts();

    console.log('Deploying Staking contract...');
    console.log('Deploying contracts with the account:', deployer);

    const deployerSigner = await ethers.getSigner(deployer);
    const balance = await deployerSigner.provider.getBalance(deployer);
    console.log('Account balance:', ethers.formatEther(balance), 'ETH');

    const deployment = await deploy('Staking', {
        from: deployer,
        args: [roomToken],
        log: true,
        waitConfirmations: 1,
    });

    console.log('Staking deployed to:', deployment.address);
    console.log('Deployment transaction hash:', deployment.transactionHash);
};

export default func;

func.tags = ['Staking'];
