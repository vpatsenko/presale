import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import * as fs from "fs";
import * as path from "path";

interface Claim {
	address: string;
	amount: bigint;
}

// Function to parse CSV file
function parseCSV(csvContent: string): Claim[] {
	const lines = csvContent.trim().split('\n');
	const recipients: Claim[] = [];
	
	// Skip header line
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line) {
			const [userAddress, , presaleAllocInRooms] = line.split(',');
			if (userAddress && presaleAllocInRooms) {
				recipients.push({
					address: userAddress,
					amount: ethers.parseEther(presaleAllocInRooms)
				});
			}
		}
	}
	
	return recipients;
}

// Helper function to create merkle tree (matches test implementation)
function createMerkleTree(claims: Claim[]): MerkleTree {
	const leaves = claims.map(claim =>
		ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount]))
	);

	const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
	return tree;
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

	// Generate the merkle tree using merkletreejs library (matches test implementation)
	const tree = createMerkleTree(recipients);

	console.log("\n🌳 Merkle tree generated!");
	console.log("═".repeat(80));
	console.log("🎯 MERKLE ROOT:", tree.getHexRoot());
	console.log("═".repeat(80));

	// Generate proofs for first few recipients as examples
	console.log("\n🔑 Merkle proofs (showing first 3 recipients):");
	for (let i = 0; i < Math.min(3, recipients.length); i++) {
		const claim = recipients[i];
		const leaf = ethers.keccak256(
			ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
		);
		const proof = tree.getHexProof(leaf);
		const humanReadableAmount = ethers.formatEther(claim.amount);
		
		console.log(`\n${i + 1}. ${claim.address} (${humanReadableAmount} ROOMS):`);
		console.log(`   Leaf Index: ${i}`);
		console.log(`   Proof: [${proof.map(p => `"${p}"`).join(", ")}]`);
	}
	
	if (recipients.length > 3) {
		console.log(`\n... and ${recipients.length - 3} more recipients with their proofs`);
	}

	console.log("\n📝 Deployment configuration:");
	console.log("═".repeat(50));
	console.log(`MERKLE_ROOT=${tree.getHexRoot()}`);
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
		const claim = recipients[i];
		const leaf = ethers.keccak256(
			ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
		);
		const proof = tree.getHexProof(leaf);
		
		console.log(`\n// Claim for ${claim.address}`);
		console.log(`await merkleDistributor.claim(`);
		console.log(`  "${claim.address}",`);
		console.log(`  "${claim.amount}",`);
		console.log(`  [${proof.map(p => `"${p}"`).join(", ")}]`);
		console.log(`);`);
	}
	
	console.log("\n💡 To get proof for any specific recipient, you can run this script and find their proof in the output.");
	
	// Save all proofs to a JSON file for reference
	const allProofs: Array<{
		address: string;
		amount: string;
		leafIndex: number;
		proof: string[];
	}> = [];
	
	for (let i = 0; i < recipients.length; i++) {
		const claim = recipients[i];
		const leaf = ethers.keccak256(
			ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
		);
		const proof = tree.getHexProof(leaf);
		
		allProofs.push({
			address: claim.address,
			amount: ethers.formatEther(claim.amount), // Human readable ROOMS amount
			leafIndex: i,
			proof
		});
	}
	
	const proofsPath = path.join(__dirname, '..', 'merkle_proofs.json');
	fs.writeFileSync(proofsPath, JSON.stringify(allProofs, null, 2));
	console.log(`\n💾 All proofs saved to: ${proofsPath}`);
	
	// Save the tree structure for future reference
	const treeData = {
		root: tree.getHexRoot(),
		leaves: recipients.map((claim, index) => ({
			address: claim.address,
			amount: claim.amount.toString(),
			leafIndex: index,
			leaf: ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount]))
		}))
	};
	
	const treePath = path.join(__dirname, '..', 'merkle_tree.json');
	fs.writeFileSync(treePath, JSON.stringify(treeData, null, 2));
	console.log(`🌳 Tree structure saved to: ${treePath}`);
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});