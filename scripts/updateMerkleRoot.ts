import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
	console.log("🔄 Updating Merkle root on MerkleTreeDistributor...\n");

	// Get configuration from environment
	const distributorAddress = process.env.MERKLE_DISTRIBUTOR_ADDRESS;
	const newMerkleRoot = process.env.MERKLE_ROOT;

	if (!distributorAddress) {
		console.error("❌ MERKLE_DISTRIBUTOR_ADDRESS not found in .env file");
		process.exit(1);
	}

	if (!newMerkleRoot) {
		console.error("❌ MERKLE_ROOT not found in .env file");
		process.exit(1);
	}

	console.log(`📋 Contract Address: ${distributorAddress}`);
	console.log(`🌳 New Merkle Root: ${newMerkleRoot}`);

	// Get signer
	const [deployer] = await ethers.getSigners();
	console.log(`👤 Updating with account: ${deployer.address}`);

	// Get contract instance
	const MerkleTreeDistributor = await ethers.getContractFactory("MerkleTreeDistributor");
	const distributor = MerkleTreeDistributor.attach(distributorAddress);

	try {
		// Get current root for comparison
		const currentRoot = await distributor.merkleRoot();
		console.log(`🔍 Current Merkle Root: ${currentRoot}`);

		if (currentRoot === newMerkleRoot) {
			console.log("✅ Merkle root is already up to date!");
			return;
		}

		// Verify deployer is the owner
		const owner = await distributor.owner();
		if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
			console.error(`❌ Account ${deployer.address} is not the owner of the contract`);
			console.error(`   Contract owner: ${owner}`);
			process.exit(1);
		}

		console.log("\n📤 Sending transaction to update Merkle root...");

		// Update the root
		const tx = await distributor.changeRoot(newMerkleRoot);
		console.log(`⏳ Transaction sent: ${tx.hash}`);

		// Wait for confirmation
		const receipt = await tx.wait();
		console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);

		// Verify the update
		const updatedRoot = await distributor.merkleRoot();
		console.log(`🔍 Updated Merkle Root: ${updatedRoot}`);

		if (updatedRoot === newMerkleRoot) {
			console.log("\n🎉 Merkle root successfully updated!");
		} else {
			console.error("\n❌ Merkle root update failed - values don't match");
		}

		console.log("\n📊 Summary:");
		console.log(`   Old Root: ${currentRoot}`);
		console.log(`   New Root: ${updatedRoot}`);
		console.log(`   Gas Used: ${receipt?.gasUsed?.toString()}`);

	} catch (error: any) {
		console.error("\n❌ Error updating Merkle root:");
		console.error(error.message);

		if (error.reason) {
			console.error(`   Reason: ${error.reason}`);
		}

		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
