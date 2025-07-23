import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTreeDistributor, ERC20 } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

async function main(): Promise<void> {
	const [owner]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("💰 Withdrawing remaining tokens from MerkleTreeDistributor...");
	console.log("- Owner:", owner.address);
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
	console.log("- Contract owner:", await merkleDistributor.owner());
	console.log("- Merkle root:", await merkleDistributor.merkleRoot());

	// Check if the signer is the owner
	const contractOwner = await merkleDistributor.owner();
	if (owner.address.toLowerCase() !== contractOwner.toLowerCase()) {
		throw new Error(`Only the contract owner (${contractOwner}) can withdraw remaining tokens. Current signer: ${owner.address}`);
	}

	// Get balances
	const contractBalance = await tokenContract.balanceOf(MERKLE_DISTRIBUTOR_ADDRESS);
	const ownerInitialBalance = await tokenContract.balanceOf(owner.address);

	console.log("\n💰 Current balances:");
	console.log("- Contract balance:", ethers.formatEther(contractBalance), "tokens");
	console.log("- Owner balance:", ethers.formatEther(ownerInitialBalance), "tokens");

	if (contractBalance === 0n) {
		console.log("❌ No tokens to withdraw! Contract balance is zero.");
		return;
	}

	try {
		console.log("\n🚀 Withdrawing remaining tokens...");
		const tx = await merkleDistributor.withdrawRemainingTokens();

		console.log("- Transaction hash:", tx.hash);
		console.log("- Waiting for confirmation...");

		const receipt = await tx.wait();
		console.log("- Confirmed in block:", receipt?.blockNumber);

		// Check final balances
		const finalContractBalance = await tokenContract.balanceOf(MERKLE_DISTRIBUTOR_ADDRESS);
		const ownerFinalBalance = await tokenContract.balanceOf(owner.address);
		const withdrawnAmount = ownerFinalBalance - ownerInitialBalance;

		console.log("\n✅ Withdrawal successful!");
		console.log("- Contract balance:", ethers.formatEther(finalContractBalance), "tokens");
		console.log("- Owner balance:", ethers.formatEther(ownerFinalBalance), "tokens");
		console.log("- Withdrawn amount:", ethers.formatEther(withdrawnAmount), "tokens");

		if (finalContractBalance !== 0n) {
			console.log("⚠️  Warning: Contract still has remaining balance!");
		}

	} catch (error: any) {
		console.error("❌ Withdrawal failed:", error.message);
		
		if (error.message.includes("OwnableUnauthorizedAccount")) {
			console.log("💡 Only the contract owner can withdraw remaining tokens.");
		} else {
			console.log("💡 Please check the contract state and try again.");
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});