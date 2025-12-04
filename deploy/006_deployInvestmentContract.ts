import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';

// Deployment constants - update these as needed
const USDC_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: Set USDC token address
const SALE_DURATION = 7 * 24 * 3600; // 7 days in seconds

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, get } = deployments;

    const { deployer } = await getNamedAccounts();

    console.log('Deploying InvestmentContract...');
    console.log('Deploying contracts with the account:', deployer);

    // Get deployer balance
    const deployerSigner = await ethers.getSigner(deployer);
    const balance = await deployerSigner.provider.getBalance(deployer);
    console.log('Account balance:', ethers.formatEther(balance), 'ETH');

    // Get Staking contract address - try to get from previous deployment first
    let stakingAddress: string;
    try {
        const stakingDeployment = await get('Staking');
        stakingAddress = stakingDeployment.address;
        console.log('Using Staking contract from previous deployment:', stakingAddress);
    } catch (error) {
        throw new Error(
            'Staking contract must be deployed first. Deploy it using: npx hardhat deploy --tags Staking'
        );
    }

    const usdcAddress = USDC_ADDRESS;
    const saleDuration = SALE_DURATION;

    // Validate addresses
    if (!ethers.isAddress(usdcAddress) || usdcAddress === ethers.ZeroAddress) {
        throw new Error('Invalid USDC_ADDRESS: must be a valid Ethereum address. Update USDC_ADDRESS constant in deploy script.');
    }

    if (!ethers.isAddress(stakingAddress)) {
        throw new Error('Invalid Staking address: must be a valid Ethereum address');
    }

    console.log('\nDeployment parameters:');
    console.log('- USDC Token:', usdcAddress);
    console.log('- Staking Contract:', stakingAddress);
    console.log('- Sale Duration:', saleDuration, 'seconds (' + saleDuration / (24 * 3600) + ' days)');

    // Deploy the contract using hardhat-deploy
    const deployment = await deploy('InvestmentContract', {
        from: deployer,
        args: [usdcAddress, stakingAddress, saleDuration],
        log: true,
        waitConfirmations: 1,
    });

    console.log('\n✅ InvestmentContract deployed to:', deployment.address);
    console.log('Deployment transaction hash:', deployment.transactionHash);

    // Verify deployment by checking contract state
    const investmentContract = await ethers.getContractAt(
        'InvestmentContract',
        deployment.address
    );
    const deployedUsdcAddress = await investmentContract.usdcToken();
    const deployedStakingAddress = await investmentContract.stakingContract();
    const deployedSaleDuration = await investmentContract.saleDuration();
    const contractOwner = await investmentContract.owner();

    console.log('\n✅ Deployment verification:');
    console.log('- Contract owner:', contractOwner);
    console.log('- USDC Token address:', deployedUsdcAddress);
    console.log('- Staking Contract address:', deployedStakingAddress);
    console.log('- Sale Duration:', deployedSaleDuration.toString(), 'seconds');

    // Validate deployed values
    if (deployedUsdcAddress.toLowerCase() !== usdcAddress.toLowerCase()) {
        throw new Error('Deployment verification failed: USDC address mismatch');
    }
    if (deployedStakingAddress.toLowerCase() !== stakingAddress.toLowerCase()) {
        throw new Error('Deployment verification failed: Staking address mismatch');
    }
    if (deployedSaleDuration.toString() !== saleDuration.toString()) {
        throw new Error('Deployment verification failed: Sale duration mismatch');
    }

    console.log('✅ All deployment parameters verified successfully!');

    console.log('\n💡 Next steps:');
    console.log('1. Call startSale() to begin the investment period');
    console.log('2. Users can deposit USDC during the sale period');
    console.log('3. After sale ends, call setAllocations() to set final token allocations and refunds');
    console.log('4. Call withdrawFunds() to withdraw collected USDC');
};

export default func;

func.tags = ['InvestmentContract'];

// Note: Staking contract should be deployed first (or update the script to use a constant address)
