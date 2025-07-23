import { run, ethers } from "hardhat";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

// Helper function to wait/delay
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function testClaim(merkleDistributor: any): Promise<void> {
	// Test account data from merkle_proofs.json
	const testAccount = {
		address: "0x3Dc419253352b9e0DBFC047786D7fF3197624cC4",
		amount: "153831.263768699312",
		leafIndex: 0,
		proof: [
			"0x343e07cd1850a9e3c1e2f49b42c896d97bdf74604d26be2935d1c5425aeb79d0",
			"0x4b019eb1c8ee313896b662d895cd6c3111167939368270b39eb79d5c41e5b5a8",
			"0xafebd10481ad0ad9604d210a7749501a56922fa5795955b2d012ccf8372d5c14",
			"0x54a00d00ce7880cbaa5d043d47b026afa35bf5c341424a1338898fddec5823b2",
			"0x4e69914ae6c6de10298ae5a21c575bd57a610227776f86d3e0ed2d5f770a3dfb",
			"0x699a86cc0fa3dae3b67d40122b175bab8851c25ed8e81c102736090ff25ce6f8",
			"0x7f13bd7a4f89d8bceaf7b655c209f461f0c813f414cd3c09e8e6b726d943269f",
			"0x52c3278869dc869412b1b3520424661f5853bb0c40a63aa54c7d499c119dc616",
			"0x7687bcd8af1506d707b6e0aa973162a10eda0e02d7697547e4fcaa17b6f51e9d"
		]
	};

	try {
		// Convert amount to wei (from the CSV data format)
		const amountInWei = ethers.parseEther(testAccount.amount);
		
		console.log(`- Test account: ${testAccount.address}`);
		console.log(`- Amount: ${testAccount.amount} ROOMS (${amountInWei} wei)`);
		console.log(`- Leaf index: ${testAccount.leafIndex}`);
		console.log(`- Proof length: ${testAccount.proof.length}`);

		// Check if account has already claimed
		const alreadyClaimed = await merkleDistributor.isClaimed(testAccount.address);
		console.log(`- Already claimed: ${alreadyClaimed}`);

		// Test merkle proof verification by simulating the claim call
		try {
			// This will revert if the proof is invalid, but we're just testing the proof
			const claimCalldata = merkleDistributor.interface.encodeFunctionData("claim", [
				testAccount.address,
				amountInWei,
				testAccount.proof
			]);
			
			console.log("✅ Merkle proof validation: Valid proof structure");
			console.log(`- Calldata length: ${claimCalldata.length} bytes`);
		} catch (error) {
			console.error("❌ Invalid proof structure:", error);
			return;
		}

		// Check contract token balance
		const tokenAddress = await merkleDistributor.token();
		const token = await ethers.getContractAt("ERC20", tokenAddress);
		const contractBalance = await token.balanceOf(await merkleDistributor.getAddress());
		const tokenSymbol = await token.symbol();
		
		console.log(`- Contract token balance: ${ethers.formatEther(contractBalance)} ${tokenSymbol}`);
		
		// Check if contract has enough tokens for this claim
		if (contractBalance >= amountInWei) {
			console.log("✅ Contract has sufficient tokens for this claim");
		} else {
			console.log("⚠️  Contract has insufficient tokens for this claim");
		}

		// Test the claim function with staticCall (doesn't execute, just validates)
		try {
			await merkleDistributor.claim.staticCall(
				testAccount.address,
				amountInWei,
				testAccount.proof
			);
			console.log("✅ Static call test: Claim would succeed");
		} catch (error: any) {
			if (error.message.includes("Already claimed")) {
				console.log("ℹ️  Static call test: Account has already claimed");
			} else if (error.message.includes("Invalid proof")) {
				console.log("❌ Static call test: Invalid merkle proof");
			} else if (error.message.includes("ERC20: transfer amount exceeds balance")) {
				console.log("⚠️  Static call test: Contract has insufficient token balance");
			} else {
				console.log("❌ Static call test failed:", error.message);
			}
		}

		console.log("✅ Claim functionality test completed");

	} catch (error) {
		console.error("❌ Failed to test claim functionality:", error);
	}
}

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
		
		// Test claim functionality with a test account
		console.log("\n🧪 Testing claim functionality...");
		await testClaim(merkleDistributor);
		
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