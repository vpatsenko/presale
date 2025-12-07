import { ethers } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

// Addresses from the previous run
const ADDRESSES = [
    '0x02bEe7C52ADD5eb1c587ab6EF065e0D04FDA1Aa7',
    '0x858d25B2B5054E3131Ddb33Df98fc410818A112B',
    '0x07F4099cca059f3b7Cd226eAd3cC4D4F29698D60',
    '0x012006147aA9a03F6893C1c6F375CB88Ed603De2',
    '0xf0ce042d4051442b1728e6131681E8D7FE3AFd28',
    '0xF0d5A5470B955A951172F71241869F58386C42a7',
    '0x61DC1d5Fe9d016CFbC44B18C785299F47e142328',
    '0x423697aB51c820e456E227752E8C689026Cfa9d1',
    '0x41b4e08EB173e6C107b1E84Ba3eC4f32043Abf45',
    '0x46E5A19C8100A130F003031662FA8C2580fF6029',
];

const USDC_DECIMALS = 6;
const USDC_SYMBOL = 'USDC';

async function getInvestmentContractAddress(): Promise<string> {
    const envAddress = process.env.INVESTMENT_CONTRACT_ADDRESS;
    if (envAddress) {
        return envAddress;
    }

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

    throw new Error('InvestmentContract address not found');
}

async function main(): Promise<void> {
    console.log('🔍 Fetching Allocations from Investment Contract');
    console.log('=================================================\n');

    const contractAddress = await getInvestmentContractAddress();
    console.log(`Contract: ${contractAddress}\n`);

    const investmentContract = await ethers.getContractAt(
        'InvestmentContract',
        contractAddress
    );

    console.log('📊 Allocation Details:\n');

    for (let i = 0; i < ADDRESSES.length; i++) {
        const address = ADDRESSES[i];
        
        try {
            // Get individual mappings
            const amountInvested = await investmentContract.amountInvested(address);
            const stakedSnapshot = await investmentContract.stakedSnapshot(address);
            const tokenAllocation = await investmentContract.tokenAllocation(address);
            const usdcRefund = await investmentContract.usdcRefund(address);

            console.log(`${i + 1}. ${address}:`);
            console.log(`   Amount Invested: ${ethers.formatUnits(amountInvested, USDC_DECIMALS)} ${USDC_SYMBOL}`);
            console.log(`   Staked Snapshot: ${ethers.formatUnits(stakedSnapshot, 18)} tokens`);
            console.log(`   Token Allocation: ${ethers.formatUnits(tokenAllocation, 18)} tokens`);
            console.log(`   USDC Refund: ${ethers.formatUnits(usdcRefund, USDC_DECIMALS)} ${USDC_SYMBOL}\n`);
        } catch (error: any) {
            console.log(`${i + 1}. ${address}: Error - ${error.message}\n`);
        }
    }

    // Also check total invested
    const totalInvested = await investmentContract.getTotalInvested();
    console.log(`\n💰 Total Invested: ${ethers.formatUnits(totalInvested, USDC_DECIMALS)} ${USDC_SYMBOL}`);

    // Check sale status
    const [saleStart, saleEnd, saleDuration] = await investmentContract.getSaleTimes();
    const isActive = await investmentContract.isSaleActive();
    
    console.log('\n📅 Sale Status:');
    console.log(`   Active: ${isActive}`);
    if (saleStart > 0n) {
        console.log(`   Start: ${new Date(Number(saleStart) * 1000).toLocaleString()}`);
        console.log(`   End: ${new Date(Number(saleEnd) * 1000).toLocaleString()}`);
    } else {
        console.log(`   Not started yet`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
