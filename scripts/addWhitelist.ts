import { run, ethers } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
// CSV parsing without external dependencies

dotenv.config();

const PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";



async function addToWhitelist(contract: any, addresses: string[], batchSize: number = 50): Promise<void> {
	const totalBatches = Math.ceil(addresses.length / batchSize);

	for (let i = 0; i < totalBatches; i++) {
		const start = i * batchSize;
		const end = Math.min(start + batchSize, addresses.length);
		const batch = addresses.slice(start, end);

		console.log(`\n🔄 Processing batch ${i + 1}/${totalBatches} (${batch.length} addresses)...`);

		try {
			const tx = await contract.addMultipleToWhitelist(batch);
			console.log(`⏳ Transaction submitted: ${tx.hash}`);

			const receipt = await tx.wait();
			console.log(`✅ Batch ${i + 1} confirmed in block ${receipt.blockNumber}`);
			console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

			// Show addresses in this batch
			batch.forEach((addr, index) => {
				console.log(`   ${start + index + 1}. ${addr}`);
			});
		} catch (error: any) {
			console.error(`❌ Failed to add batch ${i + 1}:`, error.message);

			// Try to add addresses one by one if batch fails
			console.log("🔄 Attempting to add addresses individually...");
			for (const address of batch) {
				try {
					const tx = await contract.addMultipleToWhitelist([address]);
					await tx.wait();
					console.log(`✅ Added individually: ${address}`);
				} catch (individualError: any) {
					console.error(`❌ Failed to add ${address}:`, individualError.message);
				}
			}
		}
	}
}

async function main(): Promise<void> {
	console.log("🔐 Adding addresses to Presale whitelist...");
	console.log("==========================================");

	// Check if contract address is provided
	if (!PRESALE_ADDRESS) {
		console.error("❌ BACKROOM_PRESALE_ADDRESS not found in environment variables");
		console.log("Please set BACKROOM_PRESALE_ADDRESS in your .env file");
		process.exit(1);
	}

	const whitelistedAddress = "0x3594d081447dFf7583FeB9861Ec6b9FEfF553b3b";
	const presaleContract = await ethers.getContractAt("Presale", PRESALE_ADDRESS);

	try {
		await addToWhitelist(presaleContract, [whitelistedAddress]);

		console.log("\n🎉 Whitelist update completed successfully!");
		console.log(`✅ Added ${whitelistedAddress} addresses to the whitelist`);


	} catch (error: any) {
		console.error("\n❌ Failed to add addresses to whitelist:", error.message);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
