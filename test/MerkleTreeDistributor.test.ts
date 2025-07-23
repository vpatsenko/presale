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

		console.log("=======")
		console.log("=======")
		console.log(user1.address)
		console.log(user2.address)
		console.log(user3.address)


		// Create merkle tree
		merkleTree = createMerkleTree(claims);
		merkleRoot = merkleTree.getHexRoot();

		console.log("merkleRoot:", merkleRoot)
		console.log("=======")
		console.log("=======")

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
			const realRoot = "0x770ae7f938ac015ad0133374302b213553ff5f41c9044acc372e7866ae895ebc";
			const realClaim = {
				address: "0x3Dc419253352b9e0DBFC047786D7fF3197624cC4",
				amount: "153831263768699312000000",
				leafIndex: 0,
				proof: [
					"0xba7359b199a7fd36f4947aecf46869afad1bb02e3d1ea655a9a75e2f20951a82",
					"0xdf1ff201822be2416789a0ee6543c52a9befac18fdf8772c23a820f14ac11de9",
					"0x7b9574bf7c3b9c66ab37b76abaefd88c8ecf7fe9e4d70ea247c14a84cae971b5",
					"0x7b05345fb080074fda715d2a10f19471e6d2cb7e21e5cf5a840c461e917b2c5d",
					"0x2a2a11fadcd77770a30ca5aa9c45f384cd60ba7dc2cfd848ec04e9962d278e74",
					"0xbc736f119396bdf416149592f9b1cbba5493dc19707268130891a622cc94539f",
					"0xc9f21db481ca36a9b4c1521b852df8b6b53e6805de9c9f7f51ed98e2c2fde33e",
					"0xd5ae8123c47bde427eb7ef010f4d16c66e7deed1b0cce47404e964cb4102891d",
					"0x2c27eae31c94ac7cc461d57fc583a9fde9c1affd580568b19c4427743d887940"
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
