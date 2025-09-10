import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import dotenv from "dotenv";

dotenv.config();

const PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

// Helper function to format USDC amounts (6 decimals)
function formatUSDC(amount: bigint): string {
	return (Number(amount) / 1e6).toFixed(6);
}

// Helper function to get USDC token info
async function getUSDCTokenInfo(contract: any) {
	try {
		const usdcAddress = await contract.usdcToken();
		const usdcContract = await ethers.getContractAt("IERC20", usdcAddress);
		const symbol = await usdcContract.symbol();
		const decimals = await usdcContract.decimals();
		return { address: usdcAddress, symbol, decimals };
	} catch (error) {
		return { address: "Unknown", symbol: "USDC", decimals: 6 };
	}
}

async function main(): Promise<void> {
	console.log("💸 Presale Refund Claim");
	console.log("=======================");

	// Check if contract address is provided
	if (!PRESALE_ADDRESS) {
		console.error("❌ BACKROOM_PRESALE_ADDRESS not found in environment variables");
		console.log("Please set BACKROOM_PRESALE_ADDRESS in your .env file");
		process.exit(1);
	}

	const [signer]: HardhatEthersSigner[] = await ethers.getSigners();
	console.log(`👤 Claimant: ${signer.address}`);
	console.log(`📋 Contract: ${PRESALE_ADDRESS}`);

	// Get contract instance
	const Presale = await ethers.getContractFactory("Presale");
	const presaleContract = Presale.attach(PRESALE_ADDRESS);

	// Get USDC token info
	const usdcInfo = await getUSDCTokenInfo(presaleContract);
	console.log(`🪙 USDC Token: ${usdcInfo.address} (${usdcInfo.symbol})`);

	console.log("\n🔍 1. Checking refund eligibility...");

	try {
		// Get sale information
		const saleInfo = await presaleContract.getSaleInfo();
		const [saleFinalized, saleSuccessful, totalRaised, startTime, endTime] = saleInfo;

		console.log(`   📊 Sale Status:`);
		console.log(`      • Finalized: ${saleFinalized ? "✅ Yes" : "❌ No"}`);
		console.log(`      • Successful: ${saleSuccessful ? "✅ Yes" : "❌ No"}`);
		console.log(`      • Total Raised: ${formatUSDC(totalRaised)} ${usdcInfo.symbol}`);

		// Check if sale is finalized
		if (!saleFinalized) {
			console.error("❌ Sale is not finalized yet. Refunds are not available.");
			console.error("   Please wait for the sale to end and be finalized.");
			process.exit(1);
		}

		// Check if sale was successful
		if (saleSuccessful) {
			console.error("❌ Sale was successful! No refunds available.");
			console.error("   The sale met the soft cap, so funds were withdrawn by the owner.");
			process.exit(1);
		}

		// Get contributor's contribution info
		const contributionInfo = await presaleContract.getContributionInfo(signer.address);
		const [contribution, isWhitelisted] = contributionInfo;

		console.log(`   👤 Your Status:`);
		console.log(`      • Whitelisted: ${isWhitelisted ? "✅ Yes" : "❌ No"}`);
		console.log(`      • Contribution: ${formatUSDC(contribution)} ${usdcInfo.symbol}`);

		// Check if user has a contribution
		if (contribution === 0n) {
			console.error("❌ No contribution found for your address.");
			console.error("   You cannot claim a refund if you didn't contribute.");
			process.exit(1);
		}

		// Get user's USDC balance before refund
		const usdcContract = await ethers.getContractAt("IERC20", usdcInfo.address);
		const userBalanceBefore = await usdcContract.balanceOf(signer.address);
		console.log(`   📊 Your USDC balance before: ${formatUSDC(userBalanceBefore)} ${usdcInfo.symbol}`);

		console.log(`\n💸 2. Claiming refund of ${formatUSDC(contribution)} ${usdcInfo.symbol}...`);

		try {
			const refundTx = await presaleContract.connect(signer).claimRefund();
			console.log(`   ⏳ Refund transaction submitted: ${refundTx.hash}`);

			const refundReceipt = await refundTx.wait();
			console.log(`   ✅ Refund claimed successfully in block ${refundReceipt.blockNumber}`);
			console.log(`   📊 Gas used: ${refundReceipt.gasUsed.toString()}`);

			// Get user's USDC balance after refund
			const userBalanceAfter = await usdcContract.balanceOf(signer.address);
			const refundedAmount = userBalanceAfter - userBalanceBefore;

			console.log(`   📊 Your USDC balance after: ${formatUSDC(userBalanceAfter)} ${usdcInfo.symbol}`);
			console.log(`   💰 Amount refunded: ${formatUSDC(refundedAmount)} ${usdcInfo.symbol}`);

			// Verify contribution is now 0
			const updatedContributionInfo = await presaleContract.getContributionInfo(signer.address);
			const [updatedContribution] = updatedContributionInfo;

			if (updatedContribution === 0n) {
				console.log("\n🎉 Refund completed successfully!");
				console.log("   Your contribution has been fully refunded.");
			} else {
				console.log("\n⚠️  Warning: Contribution record still shows remaining amount");
			}

		} catch (error: any) {
			console.error("❌ Failed to claim refund:", error.message);

			// Provide helpful error messages
			if (error.message.includes("Sale was successful, no refunds")) {
				console.error("   💡 The sale was successful, so refunds are not available.");
			} else if (error.message.includes("No contribution found")) {
				console.error("   💡 You don't have any contributions to refund.");
			} else if (error.message.includes("Sale not finalized")) {
				console.error("   💡 The sale must be finalized before refunds can be claimed.");
			}

			process.exit(1);
		}

	} catch (error: any) {
		console.error("❌ Failed to check refund eligibility:", error.message);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error("💥 Unexpected error:", error);
		process.exit(1);
	});
