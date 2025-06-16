import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

dotenv.config();

const RPC_URL_BASE = process.env.RPC_URL_BASE;
const RPC_URL_MAINNET = process.env.RPC_URL_MAINNET;

if (!RPC_URL_BASE || !RPC_URL_MAINNET) {
	throw new Error('Missing RPC URLs in environment variables');
}

const TOKEN_ADDRESS = '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b';
const TOKEN_ABI = [
	'function balanceOf(address owner) view returns (uint256)'
];

// Multicall3 contract ABI (deployed on most networks)
const MULTICALL3_ABI = [
	'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)',
	'function getEthBalance(address addr) view returns (uint256 balance)'
];

// Multicall3 addresses
const MULTICALL3_ADDRESS_BASE = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ADDRESS_MAINNET = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Create CSV file with headers
const csvFilePath = path.join(__dirname, 'balances.csv');
const csvHeaders = 'Address,ETH Mainnet Balance,ETH Base Mainnet Balance,VIRTUAL Balance\n';
fs.writeFileSync(csvFilePath, csvHeaders);

// Helper function to wait/delay
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Batch size for multicall
const BATCH_SIZE = 50;

async function getBalancesBatch(addresses: string[]) {
	const baseProvider = new ethers.JsonRpcProvider(RPC_URL_BASE);
	const mainnetProvider = new ethers.JsonRpcProvider(RPC_URL_MAINNET);

	const multicallBase = new ethers.Contract(MULTICALL3_ADDRESS_BASE, MULTICALL3_ABI, baseProvider);
	const multicallMainnet = new ethers.Contract(MULTICALL3_ADDRESS_MAINNET, MULTICALL3_ABI, mainnetProvider);

	const tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, baseProvider);

	try {
		// Prepare multicall data for Base network (ETH balances + token balances)
		const baseCalls = [];

		// Add ETH balance calls for Base
		for (const address of addresses) {
			baseCalls.push({
				target: MULTICALL3_ADDRESS_BASE,
				allowFailure: true,
				callData: multicallBase.interface.encodeFunctionData('getEthBalance', [address])
			});
		}

		// Add token balance calls for Base
		for (const address of addresses) {
			baseCalls.push({
				target: TOKEN_ADDRESS,
				allowFailure: true,
				callData: tokenContract.interface.encodeFunctionData('balanceOf', [address])
			});
		}

		// Prepare multicall data for Mainnet (ETH balances only)
		const mainnetCalls = addresses.map(address => ({
			target: MULTICALL3_ADDRESS_MAINNET,
			allowFailure: true,
			callData: multicallMainnet.interface.encodeFunctionData('getEthBalance', [address])
		}));

		// Execute multicalls
		const [baseResults, mainnetResults] = await Promise.all([
			multicallBase.aggregate3(baseCalls),
			multicallMainnet.aggregate3(mainnetCalls)
		]);

		// Process results
		const results = [];
		for (let i = 0; i < addresses.length; i++) {
			const address = addresses[i];

			// Base ETH balance (first half of baseResults)
			const baseEthResult = baseResults[i];
			const baseEthBalance = baseEthResult.success
				? ethers.formatEther(ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], baseEthResult.returnData)[0])
				: '0';

			// Token balance (second half of baseResults)
			const tokenResult = baseResults[i + addresses.length];
			const tokenBalance = tokenResult.success
				? ethers.formatEther(ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], tokenResult.returnData)[0])
				: '0';

			// Mainnet ETH balance
			const mainnetEthResult = mainnetResults[i];
			const mainnetEthBalance = mainnetEthResult.success
				? ethers.formatEther(ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], mainnetEthResult.returnData)[0])
				: '0';

			results.push({
				address,
				baseEthBalance,
				mainnetEthBalance,
				tokenBalance
			});
		}

		return results;
	} catch (error) {
		console.error(`Error fetching balances for batch:`, error);
		// Return default values for all addresses in case of error
		return addresses.map(address => ({
			address,
			baseEthBalance: '0',
			mainnetEthBalance: '0',
			tokenBalance: '0',
			error: true
		}));
	}
}

async function processCSV() {
	const parser = fs
		.createReadStream(path.join(__dirname, 'users.csv'))
		.pipe(parse({
			columns: true,
			relax_column_count: true,
			skip_empty_lines: true,
			trim: true
		}));

	let totalProcessed = 0;
	let totalSaved = 0;
	const totalRecords = 5000; // Total records (5001 lines - 1 header)
	let addressBatch: string[] = [];

	console.log(`Starting to process ${totalRecords} records in batches of ${BATCH_SIZE}...`);

	for await (const record of parser) {
		totalProcessed++;

		const toAddress = record['To'];
		if (
			typeof toAddress !== 'string' ||
			!toAddress.match(/^0x[a-fA-F0-9]{40}$/) ||
			toAddress === '0x0000000000000000000000000000000000000000'
		) {
			// Skip invalid addresses
		} else {
			// Add valid address to batch
			addressBatch.push(toAddress);
		}

		// Process batch when it reaches BATCH_SIZE or we're at the end
		if (addressBatch.length >= BATCH_SIZE || totalProcessed === totalRecords) {
			if (addressBatch.length > 0) {
				console.log(`Processing batch of ${addressBatch.length} addresses...`);
				const batchResults = await getBalancesBatch(addressBatch);

				// Write batch results to CSV
				for (const result of batchResults) {
					const csvRow = `${result.address},${result.mainnetEthBalance},${result.baseEthBalance},${result.tokenBalance}\n`;
					fs.appendFileSync(csvFilePath, csvRow);
					totalSaved++;
				}

				// Clear the batch
				addressBatch = [];
			}
		}

		// Log progress and delay every 500 records
		if (totalProcessed % 500 === 0) {
			const remaining = totalRecords - totalProcessed;
			console.log(`Progress: ${totalProcessed}/${totalRecords} processed, ${totalSaved} saved, ${remaining} remaining`);

			// Wait 5 seconds every 500 requests to avoid rate limiting
			console.log('Waiting 5 seconds to avoid rate limiting...');
			await delay(5000);
		}
	}

	console.log(`\nCompleted! Total processed: ${totalProcessed}, Total saved: ${totalSaved}`);
	console.log(`Balances written to: ${csvFilePath}`);
}

processCSV().catch(console.error);
