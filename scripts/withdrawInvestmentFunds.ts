import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import dotenv from 'dotenv';

dotenv.config();

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

async function getUSDCTokenInfo(contract: any) {
    try {
        const usdcAddress = await contract.usdcToken();
        const usdcContract = await ethers.getContractAt('IERC20', usdcAddress);
        const symbol = await usdcContract.symbol();
        const decimals = await usdcContract.decimals();
        return { address: usdcAddress, symbol, decimals };
    } catch (error) {
        return { address: 'Unknown', symbol: 'USDC', decimals: 6 };
    }
}

async function main(): Promise<void> {
    console.log('💰 Investment Contract Funds Withdrawal');
    console.log('========================================');

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

    // Get USDC token info
    const usdcInfo = await getUSDCTokenInfo(investmentContract);
    console.log(`USDC Token: ${usdcInfo.address} (${usdcInfo.symbol})\n`);

    // Check contract state
    console.log('📊 Contract State:');
    try {
        const [saleStart, saleEnd, saleDuration] =
            await investmentContract.getSaleTimes();
        const totalInvested = await investmentContract.getTotalInvested();
        const isActive = await investmentContract.isSaleActive();

        const ownerAddress = await investmentContract.owner();
        const usdcContract = await ethers.getContractAt(
            'IERC20',
            usdcInfo.address
        );
        const contractBalance = await usdcContract.balanceOf(contractAddress);

        console.log(`   Owner: ${ownerAddress}`);
        console.log(`   Sale Active: ${isActive}`);
        if (saleStart > 0) {
            console.log(
                `   Sale Start: ${new Date(Number(saleStart) * 1000).toLocaleString()}`
            );
            console.log(
                `   Sale End: ${new Date(Number(saleEnd) * 1000).toLocaleString()}`
            );
            const now = Math.floor(Date.now() / 1000);
            if (now > Number(saleEnd)) {
                const timeSinceEnd = now - Number(saleEnd);
                console.log(`   Sale ended ${timeSinceEnd} seconds ago`);
            } else {
                const timeRemaining = Number(saleEnd) - now;
                console.log(`   Sale ends in ${timeRemaining} seconds`);
            }
        } else {
            console.log(`   Sale has not been started yet`);
        }
        console.log(
            `   Total Invested: ${ethers.formatUnits(totalInvested, usdcInfo.decimals)} ${usdcInfo.symbol}`
        );
        console.log(
            `   Contract Balance: ${ethers.formatUnits(contractBalance, usdcInfo.decimals)} ${usdcInfo.symbol}\n`
        );
    } catch (error: any) {
        console.error(`⚠️  Error reading contract state: ${error.message}`);
    }

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

    // Check if sale has ended
    try {
        const isActive = await investmentContract.isSaleActive();
        if (isActive) {
            console.error(
                `❌ Error: Sale is still active. Cannot withdraw funds until sale ends.`
            );
            const [saleStart, saleEnd] =
                await investmentContract.getSaleTimes();
            const now = Math.floor(Date.now() / 1000);
            const timeRemaining = Number(saleEnd) - now;
            console.log(
                `   Sale ends in ${timeRemaining} seconds (${Math.floor(timeRemaining / 60)} minutes)`
            );
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`❌ Error checking sale status: ${error.message}`);
        process.exit(1);
    }

    // Check contract balance
    const usdcContract = await ethers.getContractAt('IERC20', usdcInfo.address);
    const contractBalance = await usdcContract.balanceOf(contractAddress);

    if (contractBalance === 0n) {
        console.log('⚠️  No funds to withdraw. Contract balance is zero.');
        process.exit(0);
    }

    console.log(
        `💸 Withdrawing ${ethers.formatUnits(contractBalance, usdcInfo.decimals)} ${usdcInfo.symbol}...`
    );

    // Withdraw funds
    try {
        const tx = await investmentContract.connect(owner).withdrawFunds();
        console.log(`   Transaction hash: ${tx.hash}`);
        console.log(`   Waiting for confirmation...`);

        const receipt = await tx.wait();
        console.log(`✅ Funds withdrawn successfully!`);
        console.log(`   Block: ${receipt?.blockNumber}`);

        // Check final balance
        const finalBalance = await usdcContract.balanceOf(contractAddress);
        console.log(
            `   Remaining contract balance: ${ethers.formatUnits(finalBalance, usdcInfo.decimals)} ${usdcInfo.symbol}`
        );
    } catch (error: any) {
        console.error(`❌ Error withdrawing funds: ${error.message}`);
        if (error.reason) {
            console.error(`   Reason: ${error.reason}`);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    });
