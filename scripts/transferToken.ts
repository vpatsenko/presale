import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ERC20 ABI for basic token functions
const ERC20_ABI = [
	"function balanceOf(address owner) view returns (uint256)",
	"function transfer(address to, uint256 amount) returns (bool)",
	"function decimals() view returns (uint8)",
	"function symbol() view returns (string)",
	"function name() view returns (string)"
];

async function main(): Promise<void> {
	const recipientAddress =
		"0x3594d081447dFf7583FeB9861Ec6b9FEfF553b3b";
	const amountStr = "1000";

	// Validate recipient address
	if (!ethers.isAddress(recipientAddress)) {
		console.error("Invalid recipient address");
		process.exit(1);
	}

	// Validate amount
	const amount = parseFloat(amountStr);
	if (isNaN(amount) || amount <= 0) {
		console.error("Invalid amount. Please provide a positive number");
		process.exit(1);
	}

	// Get token address from environment
	const tokenAddress = process.env.USDC_ADDRESS;
	if (!tokenAddress) {
		console.error("USDC_ADDRESS environment variable is not set");
		process.exit(1);
	}

	if (!ethers.isAddress(tokenAddress)) {
		console.error("Invalid USDC_ADDRESS in environment variable");
		process.exit(1);
	}

	const [sender]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("\n1. Transaction details:");
	console.log("- From:", sender.address);
	console.log("- To:", recipientAddress);
	console.log("- Token address:", tokenAddress);
	console.log("- Amount:", amount);

	// Create token contract instance
	const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, sender);

	try {
		// Get token info
		const [name, symbol, decimals] = await Promise.all([
			tokenContract.name(),
			tokenContract.symbol(),
			tokenContract.decimals()
		]);

		console.log("- Token:", `${name} (${symbol})`);
		console.log("- Decimals:", decimals);

		// Convert amount to token units
		const amountInWei = ethers.parseUnits(amountStr, decimals);

		// Get sender's balance before transaction
		const balanceBefore = await tokenContract.balanceOf(sender.address);
		console.log("- Sender balance before:", ethers.formatUnits(balanceBefore, decimals), symbol);

		// Check if sender has enough balance
		if (balanceBefore < amountInWei) {
			console.error(`Insufficient balance. Required: ${ethers.formatUnits(amountInWei, decimals)} ${symbol}, Available: ${ethers.formatUnits(balanceBefore, decimals)} ${symbol}`);
			process.exit(1);
		}

		console.log("\n2. Sending tokens...");
		const tx = await tokenContract.transfer(recipientAddress, amountInWei);

		console.log("- Transaction hash:", tx.hash);
		await tx.wait();
		console.log("Transaction confirmed!");

		// Get sender's balance after transaction
		const balanceAfter = await tokenContract.balanceOf(sender.address);
		console.log("\n3. Final state:");
		console.log("- Sender balance after:", ethers.formatUnits(balanceAfter, decimals), symbol);
		console.log("- Amount transferred:", ethers.formatUnits(amountInWei, decimals), symbol);

	} catch (error: any) {
		console.error("Transaction failed:", error.message);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
