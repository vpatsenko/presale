import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { run } from 'hardhat';

// ============================================================================
// Deployment Configuration
// ============================================================================
const CONFIG = {
    USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    STAKING_ADDRESS: '0x34b2Cc9eA1CBCd70227D72f86144f446648cD260',
    SALE_DURATION: 5 * 60, // 5 minutes in seconds
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates that an address is a valid Ethereum address and not zero address
 */
function validateAddress(address: string, name: string): void {
    if (!ethers.isAddress(address)) {
        throw new Error(`Invalid ${name}: must be a valid Ethereum address`);
    }
    if (address === ethers.ZeroAddress) {
        throw new Error(`Invalid ${name}: cannot be zero address`);
    }
}

/**
 * Validates that a number is positive
 */
function validatePositiveNumber(value: number, name: string): void {
    if (value <= 0 || !Number.isInteger(value)) {
        throw new Error(`Invalid ${name}: must be a positive integer`);
    }
}

/**
 * Formats duration in seconds to human-readable format
 */
function formatDuration(seconds: number): string {
    const days = seconds / (24 * 3600);
    const hours = seconds / 3600;
    const minutes = seconds / 60;

    if (days >= 1) {
        return `${days.toFixed(2)} days`;
    } else if (hours >= 1) {
        return `${hours.toFixed(2)} hours`;
    } else {
        return `${minutes.toFixed(2)} minutes`;
    }
}

/**
 * Helper function to wait/delay
 */
const delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets the explorer URL for a contract address based on network
 */
function getExplorerUrl(address: string, chainId: bigint): string {
    if (chainId === 8453n) {
        // Base Mainnet
        return `https://basescan.org/address/${address}`;
    } else if (chainId === 84532n) {
        // Base Sepolia
        return `https://sepolia.basescan.org/address/${address}`;
    } else {
        return address;
    }
}

/**
 * Attempts to verify the contract on Etherscan/Basescan
 */
async function attemptVerification(
    contractAddress: string,
    constructorArgs: (string | number)[],
    attempt: number,
    maxAttempts: number
): Promise<boolean> {
    try {
        console.log(`\n🔍 Verification attempt ${attempt}/${maxAttempts}...`);

        await run('verify:verify', {
            address: contractAddress,
            constructorArguments: constructorArgs,
        });

        console.log('✅ Contract verified successfully on explorer!');
        return true;
    } catch (error: any) {
        const errorMessage = error.message?.toLowerCase() || '';
        if (
            errorMessage.includes('already verified') ||
            errorMessage.includes('already been verified')
        ) {
            console.log('✅ Contract is already verified!');
            return true;
        } else {
            console.warn(`⚠️  Attempt ${attempt} failed: ${error.message}`);
            return false;
        }
    }
}

/**
 * Verifies the contract on Etherscan/Basescan with retries
 */
async function verifyContract(
    contractAddress: string,
    constructorArgs: (string | number)[],
    chainId: bigint
): Promise<void> {
    const maxAttempts = 4;
    const delayBetweenAttempts = 3000; // 3 seconds

    console.log('\n🔐 Verifying contract on explorer...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const success = await attemptVerification(
            contractAddress,
            constructorArgs,
            attempt,
            maxAttempts
        );

        if (success) {
            const explorerUrl = getExplorerUrl(contractAddress, chainId);
            console.log(`\n🔗 View on explorer: ${explorerUrl}`);
            return;
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
            console.log(
                `⏳ Waiting ${delayBetweenAttempts / 1000} seconds before next attempt...`
            );
            await delay(delayBetweenAttempts);
        }
    }

    // If we get here, all attempts failed
    console.warn(`\n⚠️  All ${maxAttempts} verification attempts failed`);
    console.log('💡 Manual verification options:');
    console.log('   1. Try again later when API is more stable');
    console.log('   2. Use manual verification on explorer:');
    const explorerUrl = getExplorerUrl(contractAddress, chainId);
    console.log(`      ${explorerUrl}#code`);
    console.log('   3. Check your ETHERSCAN_API_KEY is valid for Basescan');
}

/**
 * Verifies the deployed contract by checking its state
 */
async function verifyDeployment(
    contractAddress: string,
    expectedUsdc: string,
    expectedStaking: string,
    expectedDuration: number
): Promise<void> {
    try {
        const contract = await ethers.getContractAt(
            'InvestmentContract',
            contractAddress
        );

        const [usdcAddress, stakingAddress, saleDuration, owner] =
            await Promise.all([
                contract.usdcToken(),
                contract.stakingContract(),
                contract.saleDuration(),
                contract.owner(),
            ]);

        console.log('\n✅ Deployment Verification:');
        console.log(`   Owner: ${owner}`);
        console.log(`   USDC Token: ${usdcAddress}`);
        console.log(`   Staking Contract: ${stakingAddress}`);
        console.log(
            `   Sale Duration: ${saleDuration.toString()} seconds (${formatDuration(Number(saleDuration))})`
        );

        // Validate deployed values
        const mismatches: string[] = [];
        if (usdcAddress.toLowerCase() !== expectedUsdc.toLowerCase()) {
            mismatches.push('USDC address');
        }
        if (stakingAddress.toLowerCase() !== expectedStaking.toLowerCase()) {
            mismatches.push('Staking address');
        }
        if (saleDuration.toString() !== expectedDuration.toString()) {
            mismatches.push('Sale duration');
        }

        if (mismatches.length > 0) {
            console.warn(
                `\n⚠️  Warning: Parameter mismatches detected: ${mismatches.join(', ')}`
            );
        } else {
            console.log('\n✅ All parameters verified successfully!');
        }
    } catch (error: any) {
        console.warn('\n⚠️  Verification Warning:');
        console.warn(`   Could not verify deployment: ${error.message}`);
        console.log('   Contract was deployed successfully.');
        console.log('   You can manually verify by calling contract methods.');
    }
}

// ============================================================================
// Main Deployment Function
// ============================================================================

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();
    const deployerSigner = await ethers.getSigner(deployer);

    // Display deployment info
    console.log('\n🚀 Deploying InvestmentContract');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Deployer: ${deployer}`);
    const balance = await deployerSigner.provider.getBalance(deployer);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

    // Validate configuration
    validateAddress(CONFIG.USDC_ADDRESS, 'USDC_ADDRESS');
    validateAddress(CONFIG.STAKING_ADDRESS, 'STAKING_ADDRESS');
    validatePositiveNumber(CONFIG.SALE_DURATION, 'SALE_DURATION');

    // Display deployment parameters
    console.log('📋 Deployment Parameters:');
    console.log(`   USDC Token: ${CONFIG.USDC_ADDRESS}`);
    console.log(`   Staking Contract: ${CONFIG.STAKING_ADDRESS}`);
    console.log(
        `   Sale Duration: ${CONFIG.SALE_DURATION} seconds (${formatDuration(CONFIG.SALE_DURATION)})\n`
    );

    // Deploy contract
    console.log('📦 Deploying contract...');
    const deployment = await deploy('InvestmentContract', {
        from: deployer,
        args: [
            CONFIG.USDC_ADDRESS,
            CONFIG.STAKING_ADDRESS,
            CONFIG.SALE_DURATION,
        ],
        log: false, // We'll handle logging ourselves
        waitConfirmations: 1,
    });

    console.log('\n✅ Deployment Successful!');
    console.log(`   Address: ${deployment.address}`);
    console.log(`   Transaction: ${deployment.transactionHash}`);

    // Get transaction receipt for block number
    if (deployment.transactionHash) {
        try {
            const receipt = await deployerSigner.provider.getTransactionReceipt(
                deployment.transactionHash
            );
            if (receipt) {
                console.log(`   Block: ${receipt.blockNumber}`);
            }
        } catch (error) {
            // Receipt might not be available immediately, that's okay
        }
    }

    // Verify deployment state
    await verifyDeployment(
        deployment.address,
        CONFIG.USDC_ADDRESS,
        CONFIG.STAKING_ADDRESS,
        CONFIG.SALE_DURATION
    );

    // Verify contract on explorer (only on non-local networks)
    const network = await deployerSigner.provider.getNetwork();
    if (network.chainId !== 31337n) {
        // Not local network, attempt verification
        const constructorArgs = [
            CONFIG.USDC_ADDRESS,
            CONFIG.STAKING_ADDRESS,
            CONFIG.SALE_DURATION,
        ];
        await verifyContract(
            deployment.address,
            constructorArgs,
            network.chainId
        );
    } else {
        console.log('\n⏭️  Skipping explorer verification (local network)');
    }

    // Display next steps
    console.log('\n💡 Next Steps:');
    console.log('   1. Call startSale() to begin the investment period');
    console.log('   2. Users can deposit USDC during the sale period');
    console.log(
        '   3. After sale ends, call setAllocations() to set final allocations'
    );
    console.log('   4. Call withdrawFunds() to withdraw collected USDC');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
};

export default func;

func.tags = ['InvestmentContract'];
