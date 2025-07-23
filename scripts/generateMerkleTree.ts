import { ethers } from "hardhat";
import { keccak256 } from "ethers";
import * as fs from "fs";
import * as path from "path";

function generateMerkleTree(recipients: Array<{ address: string; amount: string }>) {
	const leaves = recipients.map(recipient => {
		return keccak256(ethers.solidityPacked(["address", "uint256"], [recipient.address, recipient.amount]));
	});

	let currentLevel = leaves;
	const tree: string[][] = [leaves];

	while (currentLevel.length > 1) {
		const nextLevel: string[] = [];

		for (let i = 0; i < currentLevel.length; i += 2) {
			const left = currentLevel[i];
			const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : currentLevel[i];

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

function parseCSV(csvContent: string): Array<{ address: string; amount: string }> {
	const lines = csvContent.trim().split('\n');
	const recipients = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line) {
			const [userAddress, , presaleAllocInRooms] = line.split(',');
			if (userAddress && presaleAllocInRooms) {
				recipients.push({
					address: userAddress,
					amount: presaleAllocInRooms // Use presale_alloc_in_rooms directly
				});
			}
		}
	}

	return recipients;
}

async function main(): Promise<void> {
	console.log("🌳 Generating Merkle tree for presale allocation...\n");

	// Read and parse CSV file
	const csvPath = path.join(__dirname, '..', 'presale_alloc.csv');

	if (!fs.existsSync(csvPath)) {
		console.error(`❌ CSV file not found at: ${csvPath}`);
		process.exit(1);
	}

	const csvContent = fs.readFileSync(csvPath, 'utf8');
	const recipients = parseCSV(csvContent);

	console.log(`📊 Loaded ${recipients.length} recipients from CSV file`);
	console.log("First 5 recipients:");
	for (let i = 0; i < Math.min(5, recipients.length); i++) {
		const humanReadableAmount = ethers.formatEther(recipients[i].amount);
		console.log(`  ${i + 1}. ${recipients[i].address} - ${humanReadableAmount} ROOMS`);
	}
	console.log(`  ... and ${recipients.length - 5} more recipients\n`);

	// Generate the merkle tree
	const { tree, root, leaves } = generateMerkleTree(recipients);

	console.log("\n🌳 Merkle tree generated!");
	console.log("═".repeat(80));
	console.log("🎯 MERKLE ROOT:", root);
	console.log("═".repeat(80));

	// Generate proofs for first few recipients as examples
	console.log("\n🔑 Merkle proofs (showing first 3 recipients):");
	for (let i = 0; i < Math.min(3, recipients.length); i++) {
		const proof = generateMerkleProof(tree, i);
		const humanReadableAmount = ethers.formatEther(recipients[i].amount);
		console.log(`\n${i + 1}. ${recipients[i].address} (${humanReadableAmount} ROOMS):`);
		console.log(`   Leaf: ${leaves[i]}`);
		console.log(`   Proof: [${proof.map(p => `"${p}"`).join(", ")}]`);
	}

	if (recipients.length > 3) {
		console.log(`\n... and ${recipients.length - 3} more recipients with their proofs`);
	}

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

	// Example claim function calls for first few recipients
	console.log("\n🔗 Example claim calls (showing first 3):");
	for (let i = 0; i < Math.min(3, recipients.length); i++) {
		const proof = generateMerkleProof(tree, i);
		console.log(`\n// Claim for ${recipients[i].address}`);
		console.log(`await merkleDistributor.claim(`);
		console.log(`  "${recipients[i].address}",`);
		console.log(`  "${recipients[i].amount}",`);
		console.log(`  [${proof.map(p => `"${p}"`).join(", ")}]`);
		console.log(`);`);
	}

	console.log("\n💡 To get proof for any specific recipient, you can run this script and find their proof in the output.");

	// Save all proofs to a JSON file for reference
	const allProofs = recipients.map((recipient, index) => ({
		address: recipient.address,
		amount: ethers.formatEther(recipient.amount), // Human readable ROOMS amount
		leaf: leaves[index],
		proof: generateMerkleProof(tree, index)
	}));

	const proofsPath = path.join(__dirname, '..', 'merkle_proofs.json');
	fs.writeFileSync(proofsPath, JSON.stringify(allProofs, null, 2));
	console.log(`\n💾 All proofs saved to: ${proofsPath}`);
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
