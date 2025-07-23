import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTreeDistributor, TestToken } from "../typechain-types";

interface Claim {
	address: string;
	amount: bigint;
}

describe("MerkleTreeDistributor", function () {
	let merkleTreeDistributor: MerkleTreeDistributor;
	let testToken: TestToken;
	let owner: SignerWithAddress;
	let user1: SignerWithAddress;
	let user2: SignerWithAddress;
	let user3: SignerWithAddress;
	let merkleRoot: string;
	let claims: Claim[];
	let merkleTree: MerkleTree;

	// Helper function to create merkle tree
	function createMerkleTree(claims: Claim[]): MerkleTree {
		const leaves = claims.map(claim =>
			ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount]))
		);

		const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
		return tree;
	}

	beforeEach(async function () {
		[owner, user1, user2, user3] = await ethers.getSigners();

		// Deploy test token
		const TestToken = await ethers.getContractFactory("TestToken");
		testToken = await TestToken.deploy();
		await testToken.waitForDeployment();

		// Create sample claims
		claims = [
			{ address: user1.address, amount: ethers.parseEther("100") },
			{ address: user2.address, amount: ethers.parseEther("200") },
			{ address: user3.address, amount: ethers.parseEther("300") }
		];

		// Create merkle tree
		merkleTree = createMerkleTree(claims);
		merkleRoot = merkleTree.getHexRoot();

		// Deploy MerkleTreeDistributor
		const MerkleTreeDistributor = await ethers.getContractFactory("MerkleTreeDistributor");
		merkleTreeDistributor = await MerkleTreeDistributor.deploy(
			await testToken.getAddress(),
			merkleRoot
		);
		await merkleTreeDistributor.waitForDeployment();

		// Transfer tokens to distributor
		const totalAmount = ethers.parseEther("1000");
		await testToken.transfer(await merkleTreeDistributor.getAddress(), totalAmount);
	});

	describe("Deployment", function () {
		it("Should set the correct token address", async function () {
			expect(await merkleTreeDistributor.token()).to.equal(await testToken.getAddress());
		});

		it("Should set the correct merkle root", async function () {
			expect(await merkleTreeDistributor.merkleRoot()).to.equal(merkleRoot);
		});

		it("Should set the correct owner", async function () {
			expect(await merkleTreeDistributor.owner()).to.equal(owner.address);
		});
	});

	describe("Claiming", function () {
		it("Should allow valid claims", async function () {
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			const initialBalance = await testToken.balanceOf(user1.address);

			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, proof)
			)
				.to.emit(merkleTreeDistributor, "Claimed")
				.withArgs(claim.address, claim.amount);

			const finalBalance = await testToken.balanceOf(user1.address);
			expect(finalBalance - initialBalance).to.equal(claim.amount);
		});

		it("Should allow anyone to claim for any address", async function () {
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			const initialBalance = await testToken.balanceOf(user1.address);

			// user2 claims for user1
			await merkleTreeDistributor.connect(user2).claim(claim.address, claim.amount, proof);

			const finalBalance = await testToken.balanceOf(user1.address);
			expect(finalBalance - initialBalance).to.equal(claim.amount);
		});

		it("Should reject invalid proofs", async function () {
			const claim = claims[0];
			const invalidProof = ["0x1234567890123456789012345678901234567890123456789012345678901234"];

			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, invalidProof)
			).to.be.revertedWith("Invalid proof");
		});

		it("Should reject claims with wrong amount", async function () {
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, ethers.parseEther("50"), proof)
			).to.be.revertedWith("Invalid proof");
		});

		it("Should reject claims with wrong address", async function () {
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			await expect(
				merkleTreeDistributor.connect(user1).claim(user2.address, claim.amount, proof)
			).to.be.revertedWith("Invalid proof");
		});

		it("Should prevent double claims", async function () {
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			// First claim should succeed
			await merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, proof);

			// Second claim should fail
			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, proof)
			).to.be.revertedWith("Already claimed");
		});

		it("Should track claim status correctly", async function () {
			const claim = claims[0];

			expect(await merkleTreeDistributor.isClaimed(claim.address)).to.be.false;

			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			await merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, proof);

			expect(await merkleTreeDistributor.isClaimed(claim.address)).to.be.true;
		});

		it("Should allow multiple different users to claim", async function () {
			const users = [user1, user2, user3];

			for (let i = 0; i < claims.length; i++) {
				const claim = claims[i];
				const leaf = ethers.keccak256(
					ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
				);
				const proof = merkleTree.getHexProof(leaf);

				const user = users[i];
				const initialBalance = await testToken.balanceOf(user.address);

				await merkleTreeDistributor.connect(user).claim(claim.address, claim.amount, proof);

				const finalBalance = await testToken.balanceOf(user.address);
				expect(finalBalance - initialBalance).to.equal(claim.amount);
			}
		});
	});

	describe("Owner Functions", function () {
		it("Should allow owner to withdraw remaining tokens", async function () {
			const initialOwnerBalance = await testToken.balanceOf(owner.address);
			const contractBalance = await testToken.balanceOf(await merkleTreeDistributor.getAddress());

			await merkleTreeDistributor.connect(owner).withdrawRemainingTokens();

			const finalOwnerBalance = await testToken.balanceOf(owner.address);
			const finalContractBalance = await testToken.balanceOf(await merkleTreeDistributor.getAddress());

			expect(finalOwnerBalance - initialOwnerBalance).to.equal(contractBalance);
			expect(finalContractBalance).to.equal(0);
		});

		it("Should not allow non-owner to withdraw tokens", async function () {
			await expect(
				merkleTreeDistributor.connect(user1).withdrawRemainingTokens()
			).to.be.revertedWithCustomError(merkleTreeDistributor, "OwnableUnauthorizedAccount");
		});

		it("Should allow withdrawal even after some claims", async function () {
			// Make one claim
			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);
			await merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, proof);

			// Check remaining balance
			const remainingBalance = await testToken.balanceOf(await merkleTreeDistributor.getAddress());
			expect(remainingBalance).to.equal(ethers.parseEther("900"));

			// Withdraw remaining tokens
			const initialOwnerBalance = await testToken.balanceOf(owner.address);
			await merkleTreeDistributor.connect(owner).withdrawRemainingTokens();

			const finalOwnerBalance = await testToken.balanceOf(owner.address);
			expect(finalOwnerBalance - initialOwnerBalance).to.equal(remainingBalance);
		});
	});

	describe("Real Data Test", function () {
		it("Should handle claim with provided real data", async function () {
			const realRoot = "0x5d6d375c54e4160d4308bc067d516df6d0ac466b7265196f321363653c3e41bc";
			const realClaim = {
				address: "0x3Dc419253352b9e0DBFC047786D7fF3197624cC4",
				amount: ethers.parseUnits("153831.263768699312", 18),
				leafIndex: 0,
				proof: [
					"0xc3c24f071a2ed02292ceee2a09e6cea80401a1869ca98fef101009cd45912c8b",
					"0x039f725d3d622af7c60ea303f56b89cc4f273626b309b3e39f51de1197ed651c",
					"0x664911c62b20a48110db47fa7bff58966c3ec8904874acf0994ec73df8c09968",
					"0x4229b24279e5346d63d712770429dbcbf1cee1f356f1b8b8b60d0b494dadbae8",
					"0x18a3c5a7c9cdfe1de30a283fc09dd426d3eec4d6301b12c98ec771b578d14993",
					"0xf90bc955ffa81d15e802a6888fbe6487715bca731ef997abadd5861ed6782b9f",
					"0x5824a8a04ee6b9d66c0ec51ee4e3e4dee66307b0b655ffe8d121b2866f644354",
					"0xc5cf97c623fb2bbec865ca40be9e729d97e8bb06ee58e841aeb72ea21016cad9",
					"0xd255bdb2d59e63d88d2fef089efee667752413fa3d4afd7da65a93b4004eeb6b"
				]
			};

			// Deploy distributor with real root
			const MerkleTreeDistributor = await ethers.getContractFactory("MerkleTreeDistributor");
			const realDistributor = await MerkleTreeDistributor.deploy(
				await testToken.getAddress(),
				realRoot
			);
			await realDistributor.waitForDeployment();

			// Transfer tokens to distributor
			const totalAmount = ethers.parseUnits("200000", 18);
			await testToken.transfer(await realDistributor.getAddress(), totalAmount);

			// Test the claim
			const initialBalance = await testToken.balanceOf(realClaim.address);

			await expect(
				realDistributor.claim(realClaim.address, realClaim.amount, realClaim.proof)
			)
				.to.emit(realDistributor, "Claimed")
				.withArgs(realClaim.address, realClaim.amount);

			const finalBalance = await testToken.balanceOf(realClaim.address);
			expect(finalBalance - initialBalance).to.equal(realClaim.amount);

			// Verify claim status
			expect(await realDistributor.isClaimed(realClaim.address)).to.be.true;
		});
	});

	describe("Edge Cases", function () {
		it("Should handle empty proof array", async function () {
			const claim = claims[0];
			const emptyProof: string[] = [];

			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, emptyProof)
			).to.be.revertedWith("Invalid proof");
		});

		it("Should handle zero amount claim", async function () {
			// Create a special claim with zero amount
			const zeroAmountClaim: Claim = { address: user1.address, amount: 0n };
			const specialClaims = [zeroAmountClaim];
			const specialTree = createMerkleTree(specialClaims);
			const specialRoot = specialTree.getHexRoot();

			// Deploy new distributor with special root
			const MerkleTreeDistributor = await ethers.getContractFactory("MerkleTreeDistributor");
			const specialDistributor = await MerkleTreeDistributor.deploy(
				await testToken.getAddress(),
				specialRoot
			);

			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [zeroAmountClaim.address, zeroAmountClaim.amount])
			);
			const proof = specialTree.getHexProof(leaf);

			// Should not revert, but transfers 0 tokens
			await expect(
				specialDistributor.connect(user1).claim(zeroAmountClaim.address, zeroAmountClaim.amount, proof)
			).to.emit(specialDistributor, "Claimed")
				.withArgs(zeroAmountClaim.address, zeroAmountClaim.amount);
		});

		it("Should fail when contract has insufficient tokens", async function () {
			// Deploy new distributor with no tokens
			const MerkleTreeDistributor = await ethers.getContractFactory("MerkleTreeDistributor");
			const emptyDistributor = await MerkleTreeDistributor.deploy(
				await testToken.getAddress(),
				merkleRoot
			);

			const claim = claims[0];
			const leaf = ethers.keccak256(
				ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
			);
			const proof = merkleTree.getHexProof(leaf);

			await expect(
				emptyDistributor.connect(user1).claim(claim.address, claim.amount, proof)
			).to.be.revertedWithCustomError(testToken, "ERC20InsufficientBalance");
		});
	});
});
