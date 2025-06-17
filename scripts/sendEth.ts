import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const recipientAddress = "0x3594d081447dFf7583FeB9861Ec6b9FEfF553b3b";
const amountEth = "1.2";

async function main(): Promise<void> {
	if (!ethers.isAddress(recipientAddress)) {
		console.error("Invalid recipient address");
		process.exit(1);
	}

	const amount = parseFloat(amountEth);
	if (isNaN(amount) || amount <= 0) {
		console.error("Invalid amount. Please provide a positive number");
		process.exit(1);
	}

	const [sender]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("\n1. Transaction details:");
	console.log("- From:", sender.address);
	console.log("- To:", recipientAddress);
	console.log("- Amount:", amount, "ETH");

	// Get sender's balance before transaction
	const balanceBefore = await ethers.provider.getBalance(sender.address);
	console.log("- Sender balance before:", ethers.formatEther(balanceBefore), "ETH");

	console.log("\n2. Sending ETH...");
	const tx = await sender.sendTransaction({
		to: recipientAddress,
		value: ethers.parseEther(amountEth)
	});

	console.log("- Transaction hash:", tx.hash);
	await tx.wait();
	console.log("Transaction confirmed!");

	// Get sender's balance after transaction
	const balanceAfter = await ethers.provider.getBalance(sender.address);
	console.log("\n3. Final state:");
	console.log("- Sender balance after:", ethers.formatEther(balanceAfter), "ETH");
	console.log("- Amount spent:", ethers.formatEther(balanceBefore - balanceAfter), "ETH");
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
