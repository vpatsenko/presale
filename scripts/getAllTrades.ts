import { ethers } from "hardhat";
import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Types and Interfaces
interface Purchase {
	address: string;
	amount: string;
	timestamp: number;
	blockNumber: number;
	txHash: string;
}

interface AggregatedPurchase {
	totalAmount: bigint;
	transactions: number;
	firstPurchase: number;
}

interface Config {
	poolAddress: string;
	startDate: Date;
	endDate: Date;
	poolCreationBlock: number;
	chunkSize: number;
	delayMs: number;
	maxBlocksPerRequest: number;
}

// Configuration - Optimized for better performance
const CONFIG: Config = {
	poolAddress: "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5",
	startDate: new Date("2025-06-18T00:00:00Z"),
	endDate: new Date("2025-07-30T23:59:59Z"),
	poolCreationBlock: 31733046,
	chunkSize: 5_000, // Much smaller chunks for faster processing
	delayMs: 100, // Slightly longer delay to avoid rate limiting
	maxBlocksPerRequest: 5_000 // Limit RPC request size
};

// Uniswap V2 Pool ABI for Swap events
const UNISWAP_V2_POOL_ABI = [
	"event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
	"function token0() external view returns (address)",
	"function token1() external view returns (address)"
];

// Utility functions
function validateConfig(config: Config): void {
	try {
		ethers.getAddress(config.poolAddress);
	} catch {
		throw new Error(`Invalid pool address: ${config.poolAddress}`);
	}

	if (config.startDate >= config.endDate) {
		throw new Error("Start date must be before end date");
	}

	if (config.poolCreationBlock < 0) {
		throw new Error("Pool creation block must be positive");
	}

	if (config.chunkSize <= 0 || config.chunkSize > 5_001) {
		throw new Error("Chunk size must be between 1 and 5000");
	}
}

function isWithinDateRange(timestamp: number, startDate: Date, endDate: Date): boolean {
	const startTimestamp = Math.floor(startDate.getTime() / 1000);
	const endTimestamp = Math.floor(endDate.getTime() / 1000);
	return timestamp >= startTimestamp && timestamp <= endTimestamp;
}

async function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Optimized block processing
async function processBlockRange(
	provider: ethers.providers.JsonRpcProvider,
	poolAddress: string,
	fromBlock: number,
	toBlock: number,
	startDate: Date,
	endDate: Date
): Promise<Purchase[]> {
	const purchases: Purchase[] = [];
	const swapEventHash = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");

	try {
		// Get logs for this block range
		const logs = await provider.getLogs({
			address: poolAddress,
			fromBlock: fromBlock,
			toBlock: toBlock,
			topics: [swapEventHash]
		});

		if (logs.length === 0) {
			return [];
		}

		console.log(`Found ${logs.length} swap events in blocks ${fromBlock}-${toBlock}`);

		// Process logs in small batches
		const batchSize = 50;
		let processedCount = 0;

		for (let i = 0; i < logs.length; i += batchSize) {
			const batch = logs.slice(i, i + batchSize);

			// Get block timestamps for this batch
			const blockNumbers = [...new Set(batch.map(log => log.blockNumber))];
			const blockPromises = blockNumbers.map(blockNum => provider.getBlock(blockNum));
			const blocks = await Promise.all(blockPromises);

			// Create a map of block number to timestamp
			const blockTimestamps = new Map();
			blocks.forEach(block => {
				if (block) {
					blockTimestamps.set(block.number, block.timestamp);
				}
			});

			// Process each log in the batch
			for (const log of batch) {
				try {
					const timestamp = blockTimestamps.get(log.blockNumber);
					if (!timestamp) continue;

					// Check if within date range
					if (!isWithinDateRange(timestamp, startDate, endDate)) {
						continue;
					}

					// Decode the log data
					const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
						["uint256", "uint256", "uint256", "uint256"],
						log.data
					);

					const amount0In = decoded[0];
					const amount1Out = decoded[3];


					// Extract recipient from topics
					// const to = "0x" + log.topics[2].slice(26);
					const to = (await provider.getTransaction(log.transactionHash)).to;

					// console.log(to);



					// Check for purchases (receiving token1)
					if (amount1Out > 0 && amount0In > 0) {
						purchases.push({
							address: to,
							amount: ethers.formatUnits(amount1Out, 18),
							timestamp: timestamp,
							blockNumber: log.blockNumber,
							txHash: log.transactionHash
						});
					}

				} catch (decodeError) {
					// Skip malformed logs
					continue;
				}
			}

			processedCount += batch.length;
			if (processedCount % 200 === 0) {
				console.log(`Processed ${processedCount}/${logs.length} events...`);
			}

			// Small delay between batches
			if (i + batchSize < logs.length) {
				await delay(20);
			}
		}

	} catch (error) {
		console.error(`Error processing blocks ${fromBlock}-${toBlock}:`, error);
	}

	return purchases;
}

// Main processing function
async function getAllTradesOptimized(config: Config = CONFIG, endBlock?: number): Promise<void> {
	console.log("Starting optimized token purchase collection...");
	console.log(`Date range: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
	console.log(`Pool address: ${config.poolAddress}`);
	console.log(`Chunk size: ${config.chunkSize}`);
	console.log(`Max blocks per request: ${config.maxBlocksPerRequest}`);

	// Validate configuration
	validateConfig(config);

	const provider = ethers.provider;
	const poolContract = new ethers.Contract(config.poolAddress, UNISWAP_V2_POOL_ABI, provider);

	// Get pool information
	let latestBlock: number;
	try {
		const [token0Address, token1Address, currentBlockNumber] = await Promise.all([
			poolContract.token0(),
			poolContract.token1(),
			provider.getBlockNumber()
		]);

		latestBlock = currentBlockNumber;

		console.log(`Pool token0: ${token0Address}`);
		console.log(`Pool token1: ${token1Address}`);
		console.log(`Current block: ${latestBlock}`);
		console.log(`Starting from block: ${config.poolCreationBlock}`);
		console.log(`Ending at block: ${endBlock || latestBlock}`);
	} catch (error) {
		throw new Error(`Failed to get pool information: ${error}`);
	}

	const purchases: Purchase[] = [];
	let currentBlock = config.poolCreationBlock;
	let processedChunks = 0;
	const targetEndBlock = endBlock || latestBlock;
	let totalChunks = Math.ceil((targetEndBlock - config.poolCreationBlock) / config.chunkSize);
	let lastProgressTime = Date.now();

	console.log(`Estimated total chunks to process: ${totalChunks}`);

	while (currentBlock <= targetEndBlock) {
		const toBlock = Math.min(currentBlock + config.chunkSize - 1, targetEndBlock);
		processedChunks++;

		// Progress update every 10 seconds
		const now = Date.now();
		if (now - lastProgressTime > 10000) {
			console.log(`Progress: ${processedChunks}/${totalChunks} chunks (${Math.round(processedChunks / totalChunks * 100)}%)`);
			lastProgressTime = now;
		}

		try {
			const chunkPurchases = await processBlockRange(
				provider,
				config.poolAddress,
				currentBlock,
				toBlock,
				config.startDate,
				config.endDate
			);

			purchases.push(...chunkPurchases);

			if (chunkPurchases.length > 0) {
				console.log(`Found ${chunkPurchases.length} purchases in chunk ${processedChunks} (${purchases.length} total)`);
			}

		} catch (error) {
			console.error(`Error processing chunk ${processedChunks}:`, error);
		}

		currentBlock = toBlock + 1;
		await delay(config.delayMs);
	}

	console.log(`Found ${purchases.length} total token purchases`);
	console.log(`Processing ${purchases.length} purchases...`);

	const aggregatedPurchases = aggregatePurchasesByAddress(purchases);
	await savePurchasesToCSV(aggregatedPurchases);

	console.log(`Results saved to purchases.csv`);
	console.log(`Total unique buyers: ${aggregatedPurchases.size}`);
}

// Data processing functions
function aggregatePurchasesByAddress(purchases: Purchase[]): Map<string, AggregatedPurchase> {
	const aggregated = new Map<string, AggregatedPurchase>();

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

async function savePurchasesToCSV(purchases: Map<string, AggregatedPurchase>): Promise<void> {
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

// Block finding utility
async function findBlockForDate(provider: any, targetDate: Date): Promise<number> {
	const targetTimestamp = Math.floor(targetDate.getTime() / 1000);

	// Get the latest block to establish upper bound
	const latestBlock = await provider.getBlockNumber();
	const latestBlockData = await provider.getBlock(latestBlock);
	const latestTimestamp = latestBlockData.timestamp;

	if (targetTimestamp > latestTimestamp) {
		throw new Error(`Target date ${targetDate.toISOString()} is in the future. Latest block timestamp: ${new Date(latestTimestamp * 1000).toISOString()}`);
	}

	// Binary search to find the closest block
	let left = 0;
	let right = latestBlock;
	let closestBlock = 0;
	let closestDiff = Infinity;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const blockData = await provider.getBlock(mid);
		const blockTimestamp = blockData.timestamp;

		const diff = Math.abs(blockTimestamp - targetTimestamp);
		if (diff < closestDiff) {
			closestDiff = diff;
			closestBlock = mid;
		}

		if (blockTimestamp === targetTimestamp) {
			return mid;
		} else if (blockTimestamp < targetTimestamp) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return closestBlock;
}

// Main execution
async function main() {
	try {
		console.log("Finding blocks for start and end dates...");

		const startBlock = await findBlockForDate(ethers.provider, CONFIG.startDate);
		const endBlock = await findBlockForDate(ethers.provider, CONFIG.endDate);

		console.log(`Start date ${CONFIG.startDate.toISOString()} -> Block ${startBlock}`);
		console.log(`End date ${CONFIG.endDate.toISOString()} -> Block ${endBlock}`);

		// Update config with found blocks
		const updatedConfig = {
			...CONFIG,
			poolCreationBlock: startBlock
		};

		console.log("Starting trade analysis...");
		await getAllTradesOptimized(updatedConfig, endBlock);

	} catch (error) {
		console.error("Fatal error:", error);
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error("Unhandled error:", error);
		process.exit(1);
	});
}
