import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTreeDistributor, ERC20 } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

async function main(): Promise<void> {
	const [signer]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("🎁 Claiming tokens from MerkleTreeDistributor...");
	console.log("- Claimer:", signer.address);
	console.log("- Distributor address:", MERKLE_DISTRIBUTOR_ADDRESS);

	if (!MERKLE_DISTRIBUTOR_ADDRESS || !ethers.isAddress(MERKLE_DISTRIBUTOR_ADDRESS)) {
		throw new Error("Invalid or missing MERKLE_DISTRIBUTOR_ADDRESS");
	}

	// Connect to the distributor contract
	const MerkleTreeDistributorFactory = await ethers.getContractFactory("MerkleTreeDistributor");
	const merkleDistributor = await MerkleTreeDistributorFactory.attach(MERKLE_DISTRIBUTOR_ADDRESS) as MerkleTreeDistributor;

	// Get token contract
	const tokenAddress = await merkleDistributor.token();
	const tokenContract = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;

	console.log("\n📊 Contract info:");
	console.log("- Token address:", tokenAddress);
	console.log("- Merkle root:", await merkleDistributor.merkleRoot());
	console.log("- Contract token balance:", ethers.formatEther(await tokenContract.balanceOf(MERKLE_DISTRIBUTOR_ADDRESS)));

	// Check if already claimed
	const alreadyClaimed = await merkleDistributor.isClaimed(signer.address);
	console.log("- Already claimed:", alreadyClaimed);

	if (alreadyClaimed) {
		console.log("❌ Tokens already claimed for this address!");
		return;
	}

	// Example claim data - replace with actual proof for the signer's address
	const claimData = {
		account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Replace with actual address
		amount: ethers.parseEther("100"), // Replace with actual amount
		proof: [
			// Replace with actual merkle proof
			"0x...",
			"0x..."
		]
	};

	// Check if the signer is the intended recipient
	if (signer.address.toLowerCase() !== claimData.account.toLowerCase()) {
		console.log("❌ Signer address doesn't match the claim data!");
		console.log("Please update the claimData with the correct proof for your address.");
		return;
	}

	console.log("\n💰 Claim details:");
	console.log("- Account:", claimData.account);
	console.log("- Amount:", ethers.formatEther(claimData.amount), "tokens");
	console.log("- Proof length:", claimData.proof.length);

	// Get initial balances
	const initialBalance = await tokenContract.balanceOf(signer.address);
	console.log("- Initial balance:", ethers.formatEther(initialBalance));

	try {
		console.log("\n🚀 Submitting claim...");
		const tx = await merkleDistributor.claim(
			claimData.account,
			claimData.amount,
			claimData.proof
		);

		console.log("- Transaction hash:", tx.hash);
		console.log("- Waiting for confirmation...");

		const receipt = await tx.wait();
		console.log("- Confirmed in block:", receipt?.blockNumber);

		// Check final balance
		const finalBalance = await tokenContract.balanceOf(signer.address);
		const claimedAmount = finalBalance - initialBalance;

		console.log("\n✅ Claim successful!");
		console.log("- Final balance:", ethers.formatEther(finalBalance));
		console.log("- Claimed amount:", ethers.formatEther(claimedAmount));

		// Verify claim status
		const isNowClaimed = await merkleDistributor.isClaimed(signer.address);
		console.log("- Claim status:", isNowClaimed ? "Claimed" : "Not claimed");

	} catch (error: any) {
		console.error("❌ Claim failed:", error.message);
		
		if (error.message.includes("Already claimed")) {
			console.log("💡 This address has already claimed their tokens.");
		} else if (error.message.includes("Invalid proof")) {
			console.log("💡 The merkle proof is invalid. Please check the proof data.");
		} else {
			console.log("💡 Please check the claim parameters and try again.");
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});