import { run, ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const BACKROOM_PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

async function main(): Promise<void> {
	console.log("Verifying BackroomPresale contract...");
	console.log("=====================================");

	if (!BACKROOM_PRESALE_ADDRESS) {
		console.error("❌ BACKROOM_PRESALE_ADDRESS not found in environment variables");
		console.log("Please set BACKROOM_PRESALE_ADDRESS in your .env file");
		process.exit(1);
	}

	// Check required environment variables
	if (!process.env.SOFT_CAP) {
		throw new Error("SOFT_CAP environment variable is required");
	}
	if (!process.env.HARD_CAP) {
		throw new Error("HARD_CAP environment variable is required");
	}
	if (!process.env.MIN_CONTRIBUTION) {
		throw new Error("MIN_CONTRIBUTION environment variable is required");
	}
	if (!process.env.MAX_CONTRIBUTION) {
		throw new Error("MAX_CONTRIBUTION environment variable is required");
	}

	console.log("Contract address:", BACKROOM_PRESALE_ADDRESS);

	console.log("\nConstructor arguments:");
	console.log("- Soft Cap:", ethers.formatEther(process.env.SOFT_CAP), "ETH");
	console.log("- Hard Cap:", ethers.formatEther(process.env.HARD_CAP), "ETH");
	console.log("- Min Contribution:", ethers.formatEther(process.env.MIN_CONTRIBUTION), "ETH");
	console.log("- Max Contribution:", ethers.formatEther(process.env.MAX_CONTRIBUTION), "ETH");

	try {
		console.log("\nStarting verification...");

		await run("verify:verify", {
			address: BACKROOM_PRESALE_ADDRESS,
			constructorArguments: [
				process.env.SOFT_CAP,
				process.env.HARD_CAP,
				process.env.MIN_CONTRIBUTION,
				process.env.MAX_CONTRIBUTION
			],
		});

		console.log("✅ Contract verified successfully!");

		const network = await ethers.provider.getNetwork();
		console.log(`\n🔗 View on explorer:`);

		if (network.chainId === 8453n) { // Base Mainnet
			console.log(`https://basescan.org/address/${BACKROOM_PRESALE_ADDRESS}`);
		} else if (network.chainId === 84532n) { // Base Sepolia
			console.log(`https://sepolia.basescan.org/address/${BACKROOM_PRESALE_ADDRESS}`);
		} else {
			console.log(`Contract address: ${BACKROOM_PRESALE_ADDRESS}`);
		}

	} catch (error: any) {
		if (error.message.toLowerCase().includes("already verified")) {
			console.log("✅ Contract is already verified!");
		} else {
			console.error("❌ Verification failed:");
			console.error(error.message);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
