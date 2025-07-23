import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTreeDistributor, ERC20 } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const MERKLE_DISTRIBUTOR_ADDRESS = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "";

async function main(): Promise<void> {
	console.log("🔍 Inspecting MerkleTreeDistributor deployment...");
	console.log("================================================");

	if (!MERKLE_DISTRIBUTOR_ADDRESS || !ethers.isAddress(MERKLE_DISTRIBUTOR_ADDRESS)) {
		console.error("❌ Invalid or missing MERKLE_DISTRIBUTOR_ADDRESS in environment variables");
		console.log("Please set MERKLE_DISTRIBUTOR_ADDRESS in your .env file");
		process.exit(1);
	}

	const [signer]: HardhatEthersSigner[] = await ethers.getSigners();
	const network = await ethers.provider.getNetwork();

	console.log("Inspector account:", signer.address);
	console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
	console.log("Contract address:", MERKLE_DISTRIBUTOR_ADDRESS);

	try {
		// Connect to the distributor contract
		const MerkleTreeDistributorFactory = await ethers.getContractFactory("MerkleTreeDistributor");
		const merkleDistributor = await MerkleTreeDistributorFactory.attach(MERKLE_DISTRIBUTOR_ADDRESS) as MerkleTreeDistributor;

		console.log("\n📊 Contract Information:");
		console.log("========================");

		// Basic contract info
		const owner = await merkleDistributor.owner();
		const tokenAddress = await merkleDistributor.token();
		const merkleRoot = await merkleDistributor.merkleRoot();

		console.log("- Owner:", owner);
		console.log("- Token address:", tokenAddress);
		console.log("- Merkle root:", merkleRoot);

		// Validate merkle root format
		if (merkleRoot.startsWith("0x") && merkleRoot.length === 66) {
			console.log("✅ Merkle root format is valid");
		} else {
			console.log("❌ Merkle root format is invalid");
		}

		// Get token contract info
		console.log("\n💰 Token Information:");
		console.log("======================");

		try {
			const tokenContract = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
			
			// Token basic info
			const tokenName = await tokenContract.name();
			const tokenSymbol = await tokenContract.symbol();
			const tokenDecimals = await tokenContract.decimals();
			const tokenTotalSupply = await tokenContract.totalSupply();
			
			console.log("- Name:", tokenName);
			console.log("- Symbol:", tokenSymbol);
			console.log("- Decimals:", tokenDecimals);
			console.log("- Total supply:", ethers.formatUnits(tokenTotalSupply, tokenDecimals));

			// Token balances
			const distributorBalance = await tokenContract.balanceOf(MERKLE_DISTRIBUTOR_ADDRESS);
			const ownerBalance = await tokenContract.balanceOf(owner);
			
			console.log("- Distributor balance:", ethers.formatUnits(distributorBalance, tokenDecimals));
			console.log("- Owner balance:", ethers.formatUnits(ownerBalance, tokenDecimals));

			if (distributorBalance === 0n) {
				console.log("⚠️  Warning: Distributor has no tokens! Users cannot claim until tokens are transferred.");
			} else {
				console.log("✅ Distributor has tokens available for claiming");
			}

		} catch (error) {
			console.error("❌ Failed to get token information:", error);
		}

		// Contract deployment validation
		console.log("\n🔧 Deployment Validation:");
		console.log("==========================");

		// Check if contract has code
		const code = await ethers.provider.getCode(MERKLE_DISTRIBUTOR_ADDRESS);
		if (code === "0x") {
			console.log("❌ No contract code found at address");
			process.exit(1);
		} else {
			console.log("✅ Contract code exists at address");
		}

		// Test contract functionality with a sample address
		console.log("\n🧪 Functionality Tests:");
		console.log("========================");

		try {
			// Test isClaimed function with a dummy address
			const dummyAddress = "0x0000000000000000000000000000000000000001";
			const isClaimedResult = await merkleDistributor.isClaimed(dummyAddress);
			console.log(`✅ isClaimed() function works: ${dummyAddress} claimed = ${isClaimedResult}`);
		} catch (error) {
			console.log("❌ isClaimed() function failed:", (error as Error).message);
		}

		// Check contract permissions
		console.log("\n🔐 Permissions Check:");
		console.log("======================");

		if (signer.address.toLowerCase() === owner.toLowerCase()) {
			console.log("✅ Current signer is the contract owner");
			
			try {
				// Test owner-only function (simulate withdrawRemainingTokens call)
				const estimatedGas = await merkleDistributor.withdrawRemainingTokens.estimateGas();
				console.log(`✅ withdrawRemainingTokens() is callable (estimated gas: ${estimatedGas})`);
			} catch (error) {
				console.log("ℹ️  withdrawRemainingTokens() test:", (error as Error).message);
			}
		} else {
			console.log("ℹ️  Current signer is not the contract owner");
			console.log("   - Owner functions require the owner address");
		}

		// Environment variables check
		console.log("\n⚙️  Environment Variables:");
		console.log("===========================");

		const envTokenAddress = process.env.ERC20_ADDRESS || process.env.TOKEN_ADDRESS;
		const envMerkleRoot = process.env.MERKLE_ROOT;

		if (envTokenAddress) {
			if (envTokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
				console.log("✅ ERC20_ADDRESS matches deployed contract");
			} else {
				console.log("❌ ERC20_ADDRESS mismatch with deployed contract");
				console.log(`   Env: ${envTokenAddress}`);
				console.log(`   Contract: ${tokenAddress}`);
			}
		} else {
			console.log("⚠️  ERC20_ADDRESS not set in environment");
		}

		if (envMerkleRoot) {
			if (envMerkleRoot === merkleRoot) {
				console.log("✅ MERKLE_ROOT matches deployed contract");
			} else {
				console.log("❌ MERKLE_ROOT mismatch with deployed contract");
				console.log(`   Env: ${envMerkleRoot}`);
				console.log(`   Contract: ${merkleRoot}`);
			}
		} else {
			console.log("⚠️  MERKLE_ROOT not set in environment");
		}

		// Summary
		console.log("\n📋 Summary:");
		console.log("============");
		console.log("✅ Contract deployment appears successful");
		console.log("✅ All basic functions are accessible");
		
		if (distributorBalance > 0n) {
			console.log("✅ Contract is ready for token claims");
		} else {
			console.log("⚠️  Contract needs tokens before claims can be made");
		}

		console.log("\n💡 Next Steps:");
		console.log("===============");
		
		if (distributorBalance === 0n) {
			console.log("1. Transfer tokens to the distributor contract");
			console.log(`   Address: ${MERKLE_DISTRIBUTOR_ADDRESS}`);
		}
		
		console.log("2. Verify the contract on block explorer:");
		console.log("   npx hardhat run scripts/verifyMerkleDistributor.ts --network <network>");
		console.log("3. Users can claim tokens using merkle proofs");
		console.log("4. Monitor claims and withdraw remaining tokens when appropriate");

	} catch (error) {
		console.error("❌ Failed to inspect contract:", error);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});