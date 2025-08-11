import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface PresaleAllocation {
    address: string;
    amount: string;
}

const ROOM_TOKEN_ADDRESS = "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7";

function parsePresaleAllocCSV(csvContent: string): PresaleAllocation[] {
    const lines = csvContent.trim().split('\n');
    const allocations: PresaleAllocation[] = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [address, amount] = line.split(',');
            if (address && amount) {
                allocations.push({
                    address: address.trim(),
                    amount: amount.trim()
                });
            }
        }
    }

    return allocations;
}

async function checkTransferEvents(): Promise<void> {
    console.log(`\nChecking Transfer events from ROOM token contract...`);
    console.log("═".repeat(80));

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;
    const adminWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);

    const ERC20_ABI = [
        "event Transfer(address indexed from, address indexed to, uint256 value)"
    ];

    const roomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, provider);

    // Get current block number
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 10000; // Look back 10k blocks

    console.log(`Searching Transfer events from block ${fromBlock} to ${currentBlock}...`);

    // Query Transfer events from admin wallet
    const transferFilter = roomToken.filters.Transfer(adminWallet.address, null);
    const events = await roomToken.queryFilter(transferFilter, fromBlock, currentBlock);

    console.log(`Found ${events.length} Transfer events from admin wallet`);

    const distributedAddresses: Array<{ address: string, amount: string, txHash: string, blockNumber: number }> = [];

    for (const event of events) {
        if (event.args) {
            const to = event.args.to;
            const value = event.args.value;
            const amountFormatted = ethers.formatEther(value);

            console.log(`  ✅ Transfer to ${to}: ${amountFormatted} ROOM (tx: ${event.transactionHash})`);
            
            distributedAddresses.push({
                address: to,
                amount: amountFormatted,
                txHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        }
    }

    // Generate CSV content
    const csvHeader = "address,amount,tx_hash,block_number\n";
    const csvRows = distributedAddresses.map(item =>
        `${item.address},${item.amount},${item.txHash},${item.blockNumber}`
    ).join('\n');

    const csvContent = csvHeader + csvRows;

    // Write to file
    const outputPath = path.join(__dirname, '..', 'distributed_addresses.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');

    console.log("\n" + "═".repeat(80));
    console.log("TRANSFER EVENTS SUMMARY");
    console.log("═".repeat(80));
    console.log(`📊 Total Transfer events found: ${distributedAddresses.length}`);
    console.log(`📁 Results saved to: ${outputPath}`);

    const totalDistributed = distributedAddresses.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    console.log(`💎 Total ROOM tokens distributed: ${totalDistributed.toFixed(6)} tokens`);

    console.log("\n🎉 Export completed!");
}

async function main(): Promise<void> {
    console.log("Starting Distributed Addresses Export...\n");

    try {
        await checkTransferEvents();

        console.log("\n Process completed successfully!");
    } catch (error: any) {
        console.error("💥 Process failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error("💥 Script failed:", error);
        process.exit(1);
    });
