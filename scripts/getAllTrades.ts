import { ethers } from "hardhat";
import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

interface Purchase {
    address: string;
    amount: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
}

// Uniswap V2 Pool ABI for Swap events
const UNISWAP_V2_POOL_ABI = [
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
];

const POOL_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";

const START_DATE = new Date("2025-06-30T00:00:00Z");
const END_DATE = new Date("2025-07-18T23:59:59Z");

async function getAllTrades(): Promise<void> {
    console.log("Starting to collect token purchases...");

    const provider = ethers.provider;
    const poolContract = new ethers.Contract(POOL_ADDRESS, UNISWAP_V2_POOL_ABI, provider);

    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();
    console.log(`Pool token0: ${token0Address}`);
    console.log(`Pool token1: ${token1Address}`);

    const latestBlock = await provider.getBlockNumber();
    console.log(`Current block: ${latestBlock}`);

    console.log(`Date range: ${START_DATE.toISOString()} to ${END_DATE.toISOString()}`);

    const purchases: Purchase[] = [];
    const chunkSize = 10000;
    const POOL_CREATION_BLOCK = 31733046;

    let collectingSwaps = false;
    let currentBlock = POOL_CREATION_BLOCK;

    console.log(`Starting from pool creation block: ${POOL_CREATION_BLOCK}`);

    while (currentBlock <= latestBlock) {
        const toBlock = Math.min(currentBlock + chunkSize - 1, latestBlock);
        console.log(`Processing blocks ${currentBlock} to ${toBlock}...`);

        try {
            const firstBlock = await provider.getBlock(currentBlock);
            const lastBlock = await provider.getBlock(toBlock);

            if (!firstBlock || !lastBlock) {
                currentBlock = toBlock + 1;
                continue;
            }

            const firstTimestamp = firstBlock.timestamp;
            const lastTimestamp = lastBlock.timestamp;

            if (!collectingSwaps && lastTimestamp >= START_DATE.getTime() / 1000) {
                collectingSwaps = true;
                console.log(`🎯 Started collecting swaps from ${new Date(firstTimestamp * 1000).toISOString()}`);
            }

            if (collectingSwaps && firstTimestamp > END_DATE.getTime() / 1000) {
                console.log(`🛑 Past target date range, stopping at ${new Date(firstTimestamp * 1000).toISOString()}`);
                break;
            }

            const chunkOverlapsTarget = (
                firstTimestamp <= END_DATE.getTime() / 1000 && lastTimestamp >= START_DATE.getTime() / 1000
            );

            if (!chunkOverlapsTarget) {
                currentBlock = toBlock + 1;
                continue;
            }

            const swapEventHash = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
            const logs = await provider.getLogs({
                address: POOL_ADDRESS,
                fromBlock: currentBlock,
                toBlock: toBlock,
                topics: [swapEventHash]
            });

            let purchasesInChunk = 0;

            for (const log of logs) {
                const block = await provider.getBlock(log.blockNumber);
                const timestamp = block!.timestamp;

                // Only process events within our target date range
                if (timestamp >= START_DATE.getTime() / 1000 && timestamp <= END_DATE.getTime() / 1000) {
                    try {
                        // Decode the log data
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                            ["uint256", "uint256", "uint256", "uint256"],
                            log.data
                        );

                        const amount0In = decoded[0];
                        const amount1Out = decoded[3];

                        // Extract recipient from topics (remove padding)
                        const to = "0x" + log.topics[2].slice(26);

                        // Token1 is our target token - check for purchases (receiving token1)
                        if (amount1Out > 0 && amount0In > 0) {
                            purchasesInChunk++;

                            purchases.push({
                                address: to,
                                amount: ethers.formatUnits(amount1Out, 18),
                                timestamp: timestamp,
                                blockNumber: log.blockNumber,
                                txHash: log.transactionHash
                            });
                        }

                    } catch (decodeError) {
                        console.log(`❌ Error decoding log at block ${log.blockNumber}: ${decodeError}`);
                    }
                }
            }

            if (purchasesInChunk > 0) {
                console.log(`✅ Found ${purchasesInChunk} purchases in blocks ${currentBlock}-${toBlock} (${purchases.length} total)`);
            }

        } catch (error) {
            console.error(`❌ Error processing blocks ${currentBlock}-${toBlock}:`, error);
        }

        currentBlock = toBlock + 1;

        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`Found ${purchases.length} token purchases`);

    const aggregatedPurchases = aggregatePurchasesByAddress(purchases);

    await savePurchasesToCSV(aggregatedPurchases);

    console.log(`Results saved to purchases.csv`);
    console.log(`Total unique buyers: ${aggregatedPurchases.size}`);
}



function aggregatePurchasesByAddress(purchases: Purchase[]): Map<string, { totalAmount: bigint, transactions: number, firstPurchase: number }> {
    const aggregated = new Map<string, { totalAmount: bigint, transactions: number, firstPurchase: number }>();

    for (const purchase of purchases) {
        const address = purchase.address.toLowerCase();
        const amount = ethers.parseUnits(purchase.amount, 18);

        if (aggregated.has(address)) {
            const existing = aggregated.get(address)!;
            existing.totalAmount += amount;
            existing.transactions += 1;
            existing.firstPurchase = Math.min(existing.firstPurchase, purchase.timestamp);
        } else {
            aggregated.set(address, {
                totalAmount: amount,
                transactions: 1,
                firstPurchase: purchase.timestamp
            });
        }
    }

    return aggregated;
}

async function savePurchasesToCSV(purchases: Map<string, { totalAmount: bigint, transactions: number, firstPurchase: number }>): Promise<void> {
    let csvContent = "address,total_amount,transaction_count,first_purchase_timestamp\n";

    // Sort by total amount descending
    const sortedEntries = Array.from(purchases.entries()).sort((a, b) => {
        if (a[1].totalAmount > b[1].totalAmount) return -1;
        if (a[1].totalAmount < b[1].totalAmount) return 1;
        return 0;
    });

    for (const [address, data] of sortedEntries) {
        const amountFormatted = ethers.formatUnits(data.totalAmount, 18);
        csvContent += `${address},${amountFormatted},${data.transactions},${data.firstPurchase}\n`;
    }

    fs.writeFileSync("purchases.csv", csvContent);
}

// Main execution
async function main() {
    try {
        await getAllTrades();
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
