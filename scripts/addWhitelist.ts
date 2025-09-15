import { run, ethers } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

const PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";
const addresses : { address: string, tier: string }[] = [];

function readWhitelistCSV(csvPath: string): void {
	const csvContent = fs.readFileSync(csvPath, 'utf8');
	const lines = csvContent.trim().split('\n');

	for (let i = 1; i < lines.length; i++) {
		const [address, , tier] = lines[i].trim().split(',');
		if (address && tier) {
			addresses.push({ address: address.trim(), tier: tier.trim() });
		}
	}
}


async function addToWhitelist(contract: any, addresses: string[], batchSize: number = 50): Promise<void> {
	const totalBatches = Math.ceil(addresses.length / batchSize);

	for (let i = 0; i < totalBatches; i++) {
		const start = i * batchSize;
		const end = Math.min(start + batchSize, addresses.length);
		const batch = addresses.slice(start, end);

		console.log(`\nProcessing batch ${i + 1}/${totalBatches} (${batch.length} addresses)...`);

		try {
			const tx = await contract.addMultipleToWhitelist(batch);
			console.log(`Transaction submitted: ${tx.hash}`);

			const receipt = await tx.wait();
			console.log(`Batch ${i + 1} confirmed in block ${receipt.blockNumber}`);
			console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

			// Show addresses in this batch
			batch.forEach((addr, index) => {
				console.log(`   ${start + index + 1}. ${addr}`);
			});
		} catch (error: any) {
			console.error(`Failed to add batch ${i + 1}:`, error.message);

			// Try to add addresses one by one if batch fails
			console.log("Attempting to add addresses individually...");
			for (const address of batch) {
				try {
					const tx = await contract.addMultipleToWhitelist([address]);
					await tx.wait();
					console.log(`Added individually: ${address}`);
				} catch (individualError: any) {
					console.error(`Failed to add ${address}:`, individualError.message);
				}
			}
		}
	}
}

async function main(): Promise<void> {
	const presaleContract = await ethers.getContractAt("Presale", PRESALE_ADDRESS);

	readWhitelistCSV('./stakers.csv');

	addresses.forEach(async (address) => {
		console.log(`Adding ${address.address} to whitelist with tier ${address.tier}`);
	});

	// try {
	// 	await addToWhitelist(presaleContract, whitelistedAddresses);

	// 	console.log("\n🎉 Whitelist update completed successfully!");
	// 	console.log(`✅ Added ${whitelistedAddresses.length} addresses to the whitelist`);


	// } catch (error: any) {
	// 	console.error("\n❌ Failed to add addresses to whitelist:", error.message);
	// 	process.exit(1);
	// }
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
