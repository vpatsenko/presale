const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
	console.log("BackroomPresale Interaction Example");
	console.log("===================================");

	// Get signers
	const [owner, user1, user2, user3] = await ethers.getSigners();

	console.log("Accounts:");
	console.log("- Owner:", owner.address);
	console.log("- User1:", user1.address);
	console.log("- User2:", user2.address);
	console.log("- User3:", user3.address);

	// Deploy contract
	console.log("\n1. Deploying BackroomPresale contract...");
	const BackroomPresale = await ethers.getContractFactory("BackroomPresale");
	const presale = await BackroomPresale.deploy(
		ethers.parseEther("5"),    // 5 ETH soft cap
		ethers.parseEther("20"),   // 20 ETH hard cap
		ethers.parseEther("0.1"),  // 0.1 ETH min contribution
		ethers.parseEther("3")     // 3 ETH max contribution
	);
	await presale.waitForDeployment();

	const contractAddress = await presale.getAddress();
	console.log("Contract deployed at:", contractAddress);

	// Check initial state
	console.log("\n2. Initial contract state:");
	let info = await presale.getSaleInfo();
	console.log("- Sale active:", info._saleActive);
	console.log("- Sale finalized:", info._saleFinalized);
	console.log("- Total raised:", ethers.formatEther(info._totalRaised), "ETH");

	// Start sale
	console.log("\n3. Starting sale...");
	await presale.connect(owner).startSale();
	console.log("Sale started!");

	// Check sale info after start
	info = await presale.getSaleInfo();
	console.log("- Sale active:", info._saleActive);
	console.log("- Start time:", new Date(Number(info._startTime) * 1000).toLocaleString());
	console.log("- End time:", new Date(Number(info._endTime) * 1000).toLocaleString());
	console.log("- Time remaining:", Number(await presale.getTimeRemaining()), "seconds");

	// Make contributions
	console.log("\n4. Making contributions...");

	// User1 contributes 1 ETH
	console.log("User1 contributing 1 ETH...");
	await presale.connect(user1).contribute({ value: ethers.parseEther("1") });

	// User2 contributes 2 ETH
	console.log("User2 contributing 2 ETH...");
	await presale.connect(user2).contribute({ value: ethers.parseEther("2") });

	// User3 contributes 3 ETH
	console.log("User3 contributing 3 ETH...");
	await presale.connect(user3).contribute({ value: ethers.parseEther("3") });

	// Check contributions
	console.log("\n5. Checking contributions:");
	info = await presale.getSaleInfo();
	console.log("- Total raised:", ethers.formatEther(info._totalRaised), "ETH");
	console.log("- Number of contributors:", Number(info._contributors));

	for (const [name, user] of [["User1", user1], ["User2", user2], ["User3", user3]]) {
		const contributionInfo = await presale.getContributionInfo(user.address);
		console.log(`- ${name}: ${ethers.formatEther(contributionInfo._contribution)} ETH`);
	}

	// Fast forward time to end sale
	console.log("\n6. Fast forwarding time to end sale...");
	await ethers.provider.send("evm_increaseTime", [24 * 3600]); // 24 hours
	await ethers.provider.send("evm_mine", []);

	// Finalize sale
	console.log("Finalizing sale...");
	await presale.finalizeSale();

	// Check final state
	console.log("\n7. Final sale state:");
	info = await presale.getSaleInfo();
	console.log("- Sale active:", info._saleActive);
	console.log("- Sale finalized:", info._saleFinalized);
	console.log("- Sale successful:", info._saleSuccessful);
	console.log("- Total raised:", ethers.formatEther(info._totalRaised), "ETH");

	// Calculate token allocations
	console.log("\n8. Token allocation calculations:");
	const totalTokensForPresale = ethers.parseEther("1000000"); // 1M tokens
	console.log("Total tokens allocated to presale:", ethers.formatEther(totalTokensForPresale));

	for (const [name, user] of [["User1", user1], ["User2", user2], ["User3", user3]]) {
		const allocation = await presale.calculateTokenAllocation(user.address, totalTokensForPresale);
		const percentage = (Number(ethers.formatEther(allocation)) / Number(ethers.formatEther(totalTokensForPresale))) * 100;
		console.log(`- ${name}: ${ethers.formatEther(allocation)} tokens (${percentage.toFixed(1)}%)`);
	}

	// Withdraw funds (owner only)
	console.log("\n9. Withdrawing funds...");
	const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
	await presale.connect(owner).withdrawFunds();
	const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
	const withdrawn = finalOwnerBalance - initialOwnerBalance;
	console.log("Funds withdrawn:", ethers.formatEther(withdrawn), "ETH (minus gas)");

	console.log("\n✅ Example completed successfully!");
	console.log("\nNext steps for production:");
	console.log("1. Deploy the actual Backroom token contract");
	console.log("2. Create a claim contract with Merkle tree verification");
	console.log("3. Generate Merkle tree from contributor allocations");
	console.log("4. Allow users to claim their tokens using Merkle proofs");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
