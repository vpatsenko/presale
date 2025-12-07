import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
    NUM_ADDRESSES: 10, // Number of addresses to generate/use
    MIN_TOKEN_ALLOCATION: ethers.parseUnits('100', 18), // Minimum token allocation (18 decimals)
    MAX_TOKEN_ALLOCATION: ethers.parseUnits('10000', 18), // Maximum token allocation
    MIN_USDC_REFUND: ethers.parseUnits('10', 6), // Minimum USDC refund (6 decimals)
    MAX_USDC_REFUND: ethers.parseUnits('1000', 6), // Maximum USDC refund
    DEPOSIT_AMOUNT: ethers.parseUnits('100', 6), // USDC amount to deposit per address (if needed)
} as const;

// Try to get address from environment variable first, then from deployment file
async function getInvestmentContractAddress(): Promise<string> {
    // Check environment variable
    const envAddress = process.env.INVESTMENT_CONTRACT_ADDRESS;
    if (envAddress) {
        return envAddress;
    }

    // Try to read from deployment file
    try {
        const deployments = await import(
            '../deployments/baseSepolia/InvestmentContract.json'
        );
        if (deployments.address) {
            return deployments.address;
        }
    } catch (error) {
        // Deployment file doesn't exist or is not accessible
    }

    // Try base mainnet deployment
    try {
        const network = await ethers.provider.getNetwork();
        if (network.chainId === 8453n) {
            const deployments = await import(
                '../deployments/base/InvestmentContract.json'
            );
            if (deployments.address) {
                return deployments.address;
            }
        }
    } catch (error) {
        // Deployment file doesn't exist
    }

    throw new Error(
        'InvestmentContract address not found. Please set INVESTMENT_CONTRACT_ADDRESS in .env or ensure deployment file exists.'
    );
}

/**
 * Generates a random Ethereum address
 */
function generateRandomAddress(): string {
    const randomBytes = ethers.randomBytes(20);
    return ethers.getAddress(ethers.hexlify(randomBytes));
}

/**
 * Generates a random number between min and max (inclusive)
 */
function randomBigInt(min: bigint, max: bigint): bigint {
    const range = max - min;
    const randomBytes = ethers.randomBytes(32);
    const randomBigInt = BigInt(ethers.hexlify(randomBytes));
    return min + (randomBigInt % (range + 1n));
}

/**
 * Gets existing investors from the contract
 */
async function getExistingInvestors(
    contract: any,
    limit: number
): Promise<string[]> {
    const investors: string[] = [];
    let offset = 0;
    const batchSize = 100;

    while (investors.length < limit) {
        try {
            const batch = await contract.getAllInvestors(offset, batchSize);
            if (batch.length === 0) {
                break;
            }

            for (const investorInfo of batch) {
                if (investors.length >= limit) {
                    break;
                }
                investors.push(investorInfo.investor);
            }

            if (batch.length < batchSize) {
                break;
            }

            offset += batchSize;
        } catch (error) {
            console.warn('Error fetching investors:', error);
            break;
        }
    }

    return investors;
}

/**
 * Makes deposits for addresses if sale is active
 */
async function makeDepositsForAddresses(
    contract: any,
    addresses: string[],
    signer: HardhatEthersSigner,
    usdcAddress: string,
    depositAmount: bigint
): Promise<void> {
    console.log(`\n💰 Making deposits for ${addresses.length} addresses...`);

    const usdcContract = await ethers.getContractAt('IERC20', usdcAddress);
    const decimals = await usdcContract.decimals();

    // Check if sale is active
    const isActive = await contract.isSaleActive();
    if (!isActive) {
        console.log('⚠️  Sale is not active. Skipping deposits.');
        return;
    }

    // Check USDC balance
    const balance = await usdcContract.balanceOf(signer.address);
    const totalNeeded = depositAmount * BigInt(addresses.length);

    if (balance < totalNeeded) {
        console.log(
            `⚠️  Insufficient USDC balance. Need ${ethers.formatUnits(totalNeeded, decimals)}, have ${ethers.formatUnits(balance, decimals)}. Skipping deposits.`
        );
        return;
    }

    // Approve USDC spending
    console.log('   Approving USDC spending...');
    const approveTx = await usdcContract
        .connect(signer)
        .approve(await contract.getAddress(), totalNeeded);
    await approveTx.wait();

    // Make deposits
    for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        try {
            // Check if already invested
            const amountInvested = await contract.amountInvested(address);
            if (amountInvested > 0n) {
                console.log(
                    `   Address ${i + 1}/${addresses.length}: ${address} already invested, skipping...`
                );
                continue;
            }

            // Create a signer for this address (we'll need to fund it first)
            // For simplicity, we'll use the owner to make deposits on behalf of addresses
            // But the contract requires msg.sender to be the investor, so we need to fund the addresses
            // Actually, we can't easily do this without private keys. Let's skip this for now.
            console.log(
                `   Address ${i + 1}/${addresses.length}: ${address} - would need private key to deposit`
            );
        } catch (error: any) {
            console.warn(
                `   Error depositing for ${address}: ${error.message}`
            );
        }
    }

    console.log(
        '⚠️  Note: To deposit for random addresses, you need their private keys.'
    );
    console.log(
        '   For testing, consider using existing investors or funded test addresses.\n'
    );
}

async function main(): Promise<void> {
    console.log('🚀 Setting Allocations for Investment Contract');
    console.log('==============================================\n');

    const [owner]: HardhatEthersSigner[] = await ethers.getSigners();
    console.log(`Owner: ${owner.address}`);

    // Get contract address
    let contractAddress: string;
    try {
        contractAddress = await getInvestmentContractAddress();
    } catch (error: any) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }

    console.log(`Contract: ${contractAddress}\n`);

    // Attach to contract
    const InvestmentContract =
        await ethers.getContractFactory('InvestmentContract');
    const investmentContract = InvestmentContract.attach(contractAddress);

    // USDC constants (USDC always has 6 decimals)
    const USDC_DECIMALS = 6;
    const USDC_SYMBOL = 'USDC';

    // Check if caller is owner
    try {
        const ownerAddress = await investmentContract.owner();
        if (ownerAddress.toLowerCase() !== owner.address.toLowerCase()) {
            console.error(`❌ Error: You are not the owner of this contract.`);
            console.error(`   Contract owner: ${ownerAddress}`);
            console.error(`   Your address: ${owner.address}`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`❌ Error checking ownership: ${error.message}`);
        process.exit(1);
    }

    // Get addresses to use
    console.log(`📋 Getting addresses...`);
    let addresses: string[] = [];

    // Try to get existing investors first
    const existingInvestors = await getExistingInvestors(
        investmentContract,
        CONFIG.NUM_ADDRESSES
    );

    if (existingInvestors.length > 0) {
        console.log(`   Found ${existingInvestors.length} existing investors`);
        addresses = existingInvestors.slice(0, CONFIG.NUM_ADDRESSES);
    } else {
        console.log(
            '   No existing investors found. Generating random addresses...'
        );
        // Generate random addresses
        for (let i = 0; i < CONFIG.NUM_ADDRESSES; i++) {
            addresses.push(generateRandomAddress());
        }
        console.log(
            `   ⚠️  Note: Random addresses need to have invested first.`
        );
        console.log(
            `   These addresses won't work unless they have amountInvested > 0.`
        );
    }

    console.log(`\n📝 Addresses to set allocations for:`);
    addresses.forEach((addr, i) => {
        console.log(`   ${i + 1}. ${addr}`);
    });

    // Generate random allocations and refunds
    console.log(`\n🎲 Generating random allocations and refunds...`);
    const tokenAllocations: bigint[] = [];
    const usdcRefunds: bigint[] = [];

    for (let i = 0; i < addresses.length; i++) {
        const tokenAllocation = randomBigInt(
            CONFIG.MIN_TOKEN_ALLOCATION,
            CONFIG.MAX_TOKEN_ALLOCATION
        );
        const usdcRefund = randomBigInt(
            CONFIG.MIN_USDC_REFUND,
            CONFIG.MAX_USDC_REFUND
        );

        tokenAllocations.push(tokenAllocation);
        usdcRefunds.push(usdcRefund);

        console.log(`   ${i + 1}. ${addresses[i]}:`);
        console.log(
            `      Token Allocation: ${ethers.formatUnits(tokenAllocation, 18)} tokens`
        );
        console.log(
            `      USDC Refund: ${ethers.formatUnits(usdcRefund, USDC_DECIMALS)} ${USDC_SYMBOL}`
        );
    }

    // Set allocations
    console.log(`\n📤 Setting allocations on contract...`);
    try {
        const tx = await investmentContract
            .connect(owner)
            .setAllocations(addresses, tokenAllocations, usdcRefunds);
        console.log(`   Transaction hash: ${tx.hash}`);
        console.log(`   Waiting for confirmation...`);

        const receipt = await tx.wait();
        console.log(`✅ Allocations set successfully!`);
        console.log(`   Block: ${receipt?.blockNumber}\n`);

        // Verify allocations were set
        console.log(`🔍 Verifying allocations...`);
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            const [amountInvested, , tokenAllocation, usdcRefund] =
                await investmentContract.getUserInfo(address);

            console.log(`\n   ${i + 1}. ${address}:`);
            console.log(
                `      Amount Invested: ${ethers.formatUnits(amountInvested, USDC_DECIMALS)} ${USDC_SYMBOL}`
            );
            console.log(
                `      Token Allocation: ${ethers.formatUnits(tokenAllocation, 18)} tokens`
            );
            console.log(
                `      USDC Refund: ${ethers.formatUnits(usdcRefund, USDC_DECIMALS)} ${USDC_SYMBOL}`
            );
        }
    } catch (error: any) {
        console.error(`❌ Error setting allocations: ${error.message}`);
        if (error.reason) {
            console.error(`   Reason: ${error.reason}`);
        }
        if (error.data) {
            console.error(`   Data: ${error.data}`);
        }
        process.exit(1);
    }

    console.log('\n✅ Script completed successfully!');
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
