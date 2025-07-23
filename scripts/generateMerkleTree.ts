import { ethers } from "hardhat";
import { keccak256 } from "ethers";

// Helper function to generate merkle tree
function generateMerkleTree(recipients: Array<{ address: string; amount: string }>) {
	// Create leaves by hashing address + amount
	const leaves = recipients.map(recipient => {
		const amountBigInt = ethers.parseEther(recipient.amount);
		return keccak256(ethers.solidityPacked(["address", "uint256"], [recipient.address, amountBigInt]));
	});

	// Build the tree
	let currentLevel = leaves;
	const tree: string[][] = [leaves];

	while (currentLevel.length > 1) {
		const nextLevel: string[] = [];
		
		for (let i = 0; i < currentLevel.length; i += 2) {
			const left = currentLevel[i];
			const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : currentLevel[i];
			
			// Sort the pair to ensure deterministic ordering
			const sortedPair = left <= right ? [left, right] : [right, left];
			const combined = keccak256(ethers.concat(sortedPair));
			nextLevel.push(combined);
		}
		
		currentLevel = nextLevel;
		tree.push(nextLevel);
	}

	const root = currentLevel[0];
	
	return { tree, root, leaves };
}

// Generate merkle proof for a specific leaf
function generateMerkleProof(tree: string[][], leafIndex: number): string[] {
	const proof: string[] = [];
	let currentIndex = leafIndex;

	for (let level = 0; level < tree.length - 1; level++) {
		const currentLevel = tree[level];
		const isRightNode = currentIndex % 2 === 1;
		const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

		if (siblingIndex < currentLevel.length) {
			proof.push(currentLevel[siblingIndex]);
		}

		currentIndex = Math.floor(currentIndex / 2);
	}

	return proof;
}

async function main(): Promise<void> {
	console.log("🌳 Generating 10 wallets with Merkle tree for token distribution...\n");

	// Generate 10 wallets with 10 tokens each
	const recipients = [];
	const walletInfo = [];

	console.log("🔑 Generated wallets:");
	for (let i = 0; i < 10; i++) {
		// Generate a random wallet
		const wallet = ethers.Wallet.createRandom();
		
		const walletData = {
			address: wallet.address,
			mnemonic: wallet.mnemonic?.phrase || "N/A",
			privateKey: wallet.privateKey
		};
		
		walletInfo.push(walletData);
		recipients.push({
			address: wallet.address,
			amount: "10" // 10 tokens each
		});

		console.log(`  ${i + 1}. Address: ${wallet.address}`);
		console.log(`     Mnemonic: ${wallet.mnemonic?.phrase}`);
		console.log(`     Private Key: ${wallet.privateKey}`);
		console.log(`     Amount: 10 tokens\n`);
	}

	console.log("📋 Recipients summary:");
	recipients.forEach((recipient, index) => {
		console.log(`  ${index + 1}. ${recipient.address} - ${recipient.amount} tokens`);
	});

	// Generate the merkle tree
	const { tree, root, leaves } = generateMerkleTree(recipients);

	console.log("\n🌳 Merkle tree generated!");
	console.log("═".repeat(80));
	console.log("🎯 MERKLE ROOT:", root);
	console.log("═".repeat(80));

	// Generate proofs for each recipient
	console.log("\n🔑 Merkle proofs for each recipient:");
	recipients.forEach((recipient, index) => {
		const proof = generateMerkleProof(tree, index);
		console.log(`\n${index + 1}. ${recipient.address} (${recipient.amount} tokens):`);
		console.log(`   Leaf: ${leaves[index]}`);
		console.log(`   Proof: [${proof.map(p => `"${p}"`).join(", ")}]`);
	});

	console.log("\n📝 Deployment configuration:");
	console.log("═".repeat(50));
	console.log(`MERKLE_ROOT=${root}`);
	console.log("═".repeat(50));
	console.log("💡 Copy the MERKLE_ROOT above to your .env file");

	console.log("\n💡 Usage:");
	console.log("1. Set MERKLE_ROOT in your .env file");
	console.log("2. Deploy MerkleTreeDistributor with: npx hardhat run scripts/deployMerkleDistributor.ts");
	console.log("3. Transfer tokens to the distributor contract");
	console.log("4. Recipients can claim using the proofs above");

	// Example claim function call
	console.log("\n🔗 Example claim calls:");
	recipients.forEach((recipient, index) => {
		const proof = generateMerkleProof(tree, index);
		const amountWei = ethers.parseEther(recipient.amount);
		console.log(`\n// Claim for ${recipient.address}`);
		console.log(`await merkleDistributor.claim(`);
		console.log(`  "${recipient.address}",`);
		console.log(`  "${amountWei}",`);
		console.log(`  [${proof.map(p => `"${p}"`).join(", ")}]`);
		console.log(`);`);
	});
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});