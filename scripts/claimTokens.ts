import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTreeDistributor, ERC20 } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

async function main(): Promise<void> {
	const [signer]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("- Claimer:", signer.address);

	const tokenAddress = "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7";
	const tokenContract = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;

	console.log("\nContract info:");
	console.log("- Token address:", tokenAddress);

	// Get initial balances
	const initialBalance = await tokenContract.balanceOf(signer.address);
	console.log("- Initial balance:", ethers.formatEther(initialBalance));

	try {
		console.log("\nSubmitting claim...");
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
