const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");

describe("MerkleTreeDistributor", function () {
	let merkleTreeDistributor;
	let testToken;
	let owner;
	let user1;
	let user2;
	let user3;
	let merkleRoot;
	let claims;
	let merkleTree;

	// Helper function to create merkle tree
	function createMerkleTree(claims) {

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
			for (let i = 0; i < claims.length; i++) {
				const claim = claims[i];
				const leaf = ethers.keccak256(
					ethers.solidityPacked(["address", "uint256"], [claim.address, claim.amount])
				);
				const proof = merkleTree.getHexProof(leaf);

				const user = [user1, user2, user3][i];
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

	describe("Edge Cases", function () {
		it("Should handle empty proof array", async function () {
			const claim = claims[0];
			const emptyProof = [];

			await expect(
				merkleTreeDistributor.connect(user1).claim(claim.address, claim.amount, emptyProof)
			).to.be.revertedWith("Invalid proof");
		});

		it("Should handle zero amount claim", async function () {
			// Create a special claim with zero amount
			const zeroAmountClaim = { address: user1.address, amount: 0 };
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
