import { run, ethers } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

// Helper function to wait/delay
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function attemptVerification(constructorArgs: string[], attempt: number): Promise<boolean> {
	try {
		console.log(`\n🔄 Verification attempt ${attempt}/4...`);

		await run("verify:verify", {
			address: MERKLE_DISTRIBUTOR_ADDRESS,
			constructorArguments: constructorArgs,
		});

		console.log("✅ Contract verified successfully!");
		return true;

	} catch (error: any) {
		if (error.message.toLowerCase().includes("already verified")) {
			console.log("✅ Contract is already verified!");
			return true;
		} else {
			console.error(`❌ Attempt ${attempt} failed:`, error.message);
			return false;
		}
	}
}

async function main(): Promise<void> {
	console.log("Verifying MerkleTreeDistributor contract...");
	console.log("==========================================");

	if (!MERKLE_DISTRIBUTOR_ADDRESS) {
		console.error("❌ MERKLE_DISTRIBUTOR_ADDRESS not found in environment variables");
		console.log("Please set MERKLE_DISTRIBUTOR_ADDRESS in your .env file");
		process.exit(1);
	}

	// Read deployment JSON file
	const network = await ethers.provider.getNetwork();
	const deploymentPath = path.join(
		__dirname,
		"..",
		"deployments",
		network.chainId === 84532n ? "baseSepolia" : "base",
		"MerkleTreeDistributor.json"
	);

	let deploymentData;
	try {
		deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
	} catch (error) {
		console.error("❌ Failed to read deployment file:", error);
		console.log("\n💡 Alternative: Using environment variables for constructor args");
		
		// Fallback to environment variables
		const tokenAddress = process.env.ERC20_ADDRESS || process.env.TOKEN_ADDRESS;
		const merkleRoot = process.env.MERKLE_ROOT;
		
		if (!tokenAddress || !merkleRoot) {
			console.error("❌ Please set ERC20_ADDRESS and MERKLE_ROOT in your .env file");
			process.exit(1);
		}
		
		deploymentData = {
			args: [tokenAddress, merkleRoot]
		};
	}

	if (!deploymentData.args || !Array.isArray(deploymentData.args)) {
		console.error("❌ No constructor arguments found in deployment file or environment");
		process.exit(1);
	}

	const constructorArgs = deploymentData.args;

	console.log("Contract address:", MERKLE_DISTRIBUTOR_ADDRESS);

	console.log("\nConstructor arguments:");
	console.log("- Token Address:", constructorArgs[0]);
	console.log("- Merkle Root:", constructorArgs[1]);

	// Validate arguments
	if (!ethers.isAddress(constructorArgs[0])) {
		console.error("❌ Invalid token address in constructor arguments");
		process.exit(1);
	}

	if (!constructorArgs[1] || !constructorArgs[1].startsWith("0x") || constructorArgs[1].length !== 66) {
		console.error("❌ Invalid merkle root in constructor arguments");
		process.exit(1);
	}

	// Verify the deployed contract matches the expected parameters
	try {
		const merkleDistributor = await ethers.getContractAt("MerkleTreeDistributor", MERKLE_DISTRIBUTOR_ADDRESS);
		
		console.log("\n🔍 Verifying deployed contract state:");
		const deployedTokenAddress = await merkleDistributor.token();
		const deployedMerkleRoot = await merkleDistributor.merkleRoot();
		const contractOwner = await merkleDistributor.owner();
		
		console.log("- Deployed token address:", deployedTokenAddress);
		console.log("- Deployed merkle root:", deployedMerkleRoot);
		console.log("- Contract owner:", contractOwner);
		
		// Validate deployed values match constructor args
		if (deployedTokenAddress.toLowerCase() !== constructorArgs[0].toLowerCase()) {
			console.error("❌ Token address mismatch between deployed contract and constructor args!");
			process.exit(1);
		}
		
		if (deployedMerkleRoot !== constructorArgs[1]) {
			console.error("❌ Merkle root mismatch between deployed contract and constructor args!");
			process.exit(1);
		}
		
		console.log("✅ Contract state verification passed!");
		
	} catch (error) {
		console.error("❌ Failed to verify contract state:", error);
		process.exit(1);
	}

	// Retry verification up to 4 times
	const maxAttempts = 4;
	const delayBetweenAttempts = 3000; // 3 seconds

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const success = await attemptVerification(constructorArgs, attempt);

		if (success) {
			// Show explorer link on success
			console.log(`\n🔗 View on explorer:`);

			if (network.chainId === 8453n) { // Base Mainnet
				console.log(`https://basescan.org/address/${MERKLE_DISTRIBUTOR_ADDRESS}`);
			} else if (network.chainId === 84532n) { // Base Sepolia
				console.log(`https://sepolia.basescan.org/address/${MERKLE_DISTRIBUTOR_ADDRESS}`);
			} else if (network.chainId === 1n) { // Ethereum Mainnet
				console.log(`https://etherscan.io/address/${MERKLE_DISTRIBUTOR_ADDRESS}`);
			} else if (network.chainId === 11155111n) { // Sepolia
				console.log(`https://sepolia.etherscan.io/address/${MERKLE_DISTRIBUTOR_ADDRESS}`);
			} else {
				console.log(`Contract address: ${MERKLE_DISTRIBUTOR_ADDRESS}`);
			}
			
			console.log("\n✅ Verification completed successfully!");
			console.log("\n💡 Next steps:");
			console.log("1. Transfer tokens to the distributor contract");
			console.log("2. Users can claim tokens using valid merkle proofs");
			console.log("3. Monitor claims and withdraw remaining tokens when appropriate");
			
			return; // Exit successfully
		}

		// If not the last attempt, wait before retrying
		if (attempt < maxAttempts) {
			console.log(`⏳ Waiting ${delayBetweenAttempts / 1000} seconds before next attempt...`);
			await delay(delayBetweenAttempts);
		}
	}

	// If we get here, all attempts failed
	console.error(`\n❌ All ${maxAttempts} verification attempts failed`);
	console.log("\n🔧 Manual verification options:");
	console.log(`1. Try again later when API is more stable`);
	console.log(`2. Use manual verification on the block explorer:`);
	
	if (network.chainId === 84532n) {
		console.log(`   https://sepolia.basescan.org/address/${MERKLE_DISTRIBUTOR_ADDRESS}#code`);
	} else if (network.chainId === 8453n) {
		console.log(`   https://basescan.org/address/${MERKLE_DISTRIBUTOR_ADDRESS}#code`);
	} else if (network.chainId === 1n) {
		console.log(`   https://etherscan.io/address/${MERKLE_DISTRIBUTOR_ADDRESS}#code`);
	} else if (network.chainId === 11155111n) {
		console.log(`   https://sepolia.etherscan.io/address/${MERKLE_DISTRIBUTOR_ADDRESS}#code`);
	}
	
	console.log(`3. Check your ETHERSCAN_API_KEY is valid for the block explorer`);
	console.log("\n🔧 Manual verification constructor arguments:");
	console.log(`Token Address: ${constructorArgs[0]}`);
	console.log(`Merkle Root: ${constructorArgs[1]}`);

	process.exit(1);
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});