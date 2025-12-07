import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { run } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

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
    constructorArgs: any[],
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
    constructorArgs: any[],
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
async function verifyDeployment(contractAddress: string): Promise<void> {
    try {
        const contract = await ethers.getContractAt(
            'TestToken',
            contractAddress
        );

        const [name, symbol, totalSupply, decimals] = await Promise.all([
            contract.name(),
            contract.symbol(),
            contract.totalSupply(),
            contract.decimals(),
        ]);

        console.log('\n✅ Deployment Verification:');
        console.log(`   Name: ${name}`);
        console.log(`   Symbol: ${symbol}`);
        console.log(`   Decimals: ${decimals}`);
        console.log(
            `   Total Supply: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`
        );

        // Validate expected values
        if (name !== 'Test Token') {
            console.warn(
                `   ⚠️  Warning: Expected name "Test Token", got "${name}"`
            );
        }
        if (symbol !== 'TEST') {
            console.warn(
                `   ⚠️  Warning: Expected symbol "TEST", got "${symbol}"`
            );
        }
        if (decimals !== 6n) {
            console.warn(
                `   ⚠️  Warning: Expected decimals 6, got ${decimals}`
            );
        }

        console.log('\n✅ Contract state verified successfully!');
    } catch (error: any) {
        console.warn('\n⚠️  Verification Warning:');
        console.warn(`   Could not verify deployment: ${error.message}`);
        console.log('   Contract was deployed successfully.');
        console.log('   You can manually verify by calling contract methods.');
    }
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;

    const { deployer } = await getNamedAccounts();
    const deployerSigner = await ethers.getSigner(deployer);

    console.log('\n🚀 Deploying TestToken');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Deploying contracts with the account:', deployer);

    const balance = await deployerSigner.provider.getBalance(deployer);
    console.log('Account balance:', ethers.formatEther(balance), 'ETH\n');

    try {
        const deployment = await deploy('TestToken', {
            from: deployer,
            log: true,
            waitConfirmations: 2, // Increased from 1 for better reliability
        });

        console.log('\n✅ Deployment Successful!');
        console.log(`   Address: ${deployment.address}`);
        console.log(`   Transaction: ${deployment.transactionHash}`);

        // Get transaction receipt for block number and status
        if (deployment.transactionHash) {
            try {
                const receipt =
                    await deployerSigner.provider.getTransactionReceipt(
                        deployment.transactionHash
                    );
                if (receipt) {
                    console.log(`   Block: ${receipt.blockNumber}`);
                    if (receipt.status === 1) {
                        console.log('   Status: ✅ Success');
                    } else {
                        console.log('   Status: ❌ Failed');
                        throw new Error('Transaction failed');
                    }
                }
            } catch (error) {
                console.warn(
                    '   ⚠️  Could not fetch transaction receipt immediately'
                );
            }
        }

        // Verify deployment state
        await verifyDeployment(deployment.address);

        // Verify contract on explorer (only on non-local networks)
        const network = await deployerSigner.provider.getNetwork();
        if (network.chainId !== 31337n) {
            // Not local network, attempt verification
            await verifyContract(deployment.address, [], network.chainId);
        } else {
            console.log('\n⏭️  Skipping explorer verification (local network)');
        }

        console.log(
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
        );
    } catch (error: any) {
        console.error('\n❌ Deployment failed!');
        console.error(`   Error: ${error.message}`);
        if (error.transactionHash) {
            console.error(`   Transaction hash: ${error.transactionHash}`);
        }
        throw error;
    }
};

export default func;

func.tags = ['TestToken'];
