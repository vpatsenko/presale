const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BackroomPresale", function () {
	let presale;
	let owner;
	let contributor1;
	let contributor2;
	let contributor3;

	const softCap = ethers.parseEther("10");
	const hardCap = ethers.parseEther("100");
	const minContribution = ethers.parseEther("0.1");
	const maxContribution = ethers.parseEther("5");

	beforeEach(async function () {
		[owner, contributor1, contributor2, contributor3] = await ethers.getSigners();

		const BackroomPresale = await ethers.getContractFactory("BackroomPresale");
		presale = await BackroomPresale.deploy(
			softCap,
			hardCap,
			minContribution,
			maxContribution
		);
		await presale.waitForDeployment();
	});

	describe("Deployment", function () {
		it("Should set the right parameters", async function () {
			expect(await presale.softCap()).to.equal(softCap);
			expect(await presale.hardCap()).to.equal(hardCap);
			expect(await presale.minContribution()).to.equal(minContribution);
			expect(await presale.maxContribution()).to.equal(maxContribution);
			expect(await presale.owner()).to.equal(owner.address);
		});

		it("Should initialize with correct state", async function () {
			const info = await presale.getSaleInfo();
			expect(info._saleFinalized).to.be.false;
			expect(info._saleSuccessful).to.be.false;
			expect(info._totalRaised).to.equal(0);
			expect(info._contributors).to.equal(0);
			expect(info._startTime).to.equal(0);
			expect(info._endTime).to.equal(0);
		});
	});

	describe("Sale Management", function () {
		it("Should allow owner to start sale", async function () {
			await expect(presale.startSale())
				.to.emit(presale, "SaleStarted");

			const info = await presale.getSaleInfo();
			expect(info._startTime).to.be.greaterThan(0);
			expect(info._endTime).to.equal(info._startTime + 24n * 3600n);
		});

		it("Should not allow non-owner to start sale", async function () {
			await expect(presale.connect(contributor1).startSale())
				.to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
		});

		it("Should not allow starting sale twice", async function () {
			await presale.startSale();
			await expect(presale.startSale())
				.to.be.revertedWith("Sale already active or finalized");
		});
	});

	describe("Contributions", function () {
		beforeEach(async function () {
			await presale.startSale();
		});

		it("Should accept valid contributions", async function () {
			const contribution = ethers.parseEther("1");

			await expect(presale.connect(contributor1).contribute({ value: contribution }))
				.to.emit(presale, "ContributionMade")
				.withArgs(contributor1.address, contribution);

			expect(await presale.contributions(contributor1.address)).to.equal(contribution);
			expect(await presale.hasContributed(contributor1.address)).to.be.true;
			expect(await presale.totalRaised()).to.equal(contribution);
		});

		it("Should reject contributions below minimum", async function () {
			const contribution = ethers.parseEther("0.05"); // Below 0.1 ETH minimum

			await expect(presale.connect(contributor1).contribute({ value: contribution }))
				.to.be.revertedWith("Below minimum contribution");
		});

		it("Should reject contributions above maximum", async function () {
			const contribution = ethers.parseEther("6"); // Above 5 ETH maximum

			await expect(presale.connect(contributor1).contribute({ value: contribution }))
				.to.be.revertedWith("Exceeds maximum contribution");
		});

		it("Should reject multiple contributions from same address", async function () {
			const contribution = ethers.parseEther("1");

			await presale.connect(contributor1).contribute({ value: contribution });

			await expect(presale.connect(contributor1).contribute({ value: contribution }))
				.to.be.revertedWith("Already contributed");
		});

		it("Should reject contributions when sale not active", async function () {
			// Deploy new contract without starting sale
			const BackroomPresale = await ethers.getContractFactory("BackroomPresale");
			const newPresale = await BackroomPresale.deploy(softCap, hardCap, minContribution, maxContribution);

			const contribution = ethers.parseEther("1");

			await expect(newPresale.connect(contributor1).contribute({ value: contribution }))
				.to.be.revertedWith("Sale not started");
		});
	});

	describe("Sale Finalization", function () {
		beforeEach(async function () {
			await presale.startSale();
		});

		it("Should finalize sale when soft cap is reached after 24 hours", async function () {
			// Make contributions to reach soft cap
			await presale.connect(contributor1).contribute({ value: ethers.parseEther("5") });
			await presale.connect(contributor2).contribute({ value: ethers.parseEther("5") });

			// Fast forward 24 hours
			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);

			await expect(presale.finalizeSale())
				.to.emit(presale, "SaleFinalized")
				.withArgs(true, ethers.parseEther("10"));

			const info = await presale.getSaleInfo();
			expect(info._saleFinalized).to.be.true;
			expect(info._saleSuccessful).to.be.true;
		});

		it("Should finalize sale as failed when soft cap not reached", async function () {
			// Make contribution below soft cap
			await presale.connect(contributor1).contribute({ value: ethers.parseEther("1") });

			// Fast forward 24 hours
			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);

			await expect(presale.finalizeSale())
				.to.emit(presale, "SaleFinalized")
				.withArgs(false, ethers.parseEther("1"));

			const info = await presale.getSaleInfo();
			expect(info._saleFinalized).to.be.true;
			expect(info._saleSuccessful).to.be.false;
		});

		it("Should auto-finalize when hard cap is reached", async function () {
			// Make contributions to reach hard cap
			for (let i = 0; i < 20; i++) {
				const signer = await ethers.getImpersonatedSigner(`0x${(i + 1).toString(16).padStart(40, '0')}`);
				await ethers.provider.send("hardhat_setBalance", [
					signer.address,
					ethers.toBeHex(ethers.parseEther("10"))
				]);
				await presale.connect(signer).contribute({ value: ethers.parseEther("5") });
			}

			const info = await presale.getSaleInfo();
			expect(info._saleFinalized).to.be.true;
			expect(info._saleSuccessful).to.be.true;
			expect(info._totalRaised).to.equal(hardCap);
		});
	});

	describe("Refunds", function () {
		beforeEach(async function () {
			await presale.startSale();
			// Make contribution below soft cap
			await presale.connect(contributor1).contribute({ value: ethers.parseEther("1") });

			// Fast forward and finalize as failed
			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);
			await presale.finalizeSale();
		});

		it("Should allow refunds for failed sale", async function () {
			const initialBalance = await ethers.provider.getBalance(contributor1.address);

			await expect(presale.connect(contributor1).claimRefund())
				.to.emit(presale, "RefundClaimed")
				.withArgs(contributor1.address, ethers.parseEther("1"));

			expect(await presale.hasRefunded(contributor1.address)).to.be.true;
		});

		it("Should not allow refunds for successful sale", async function () {
			// Deploy new presale and make it successful
			const BackroomPresale = await ethers.getContractFactory("BackroomPresale");
			const successfulPresale = await BackroomPresale.deploy(softCap, hardCap, minContribution, maxContribution);
			await successfulPresale.startSale();

			// Reach soft cap
			await successfulPresale.connect(contributor1).contribute({ value: ethers.parseEther("5") });
			await successfulPresale.connect(contributor2).contribute({ value: ethers.parseEther("5") });

			// Finalize
			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);
			await successfulPresale.finalizeSale();

			await expect(successfulPresale.connect(contributor1).claimRefund())
				.to.be.revertedWith("Sale was successful, no refunds");
		});
	});

	describe("Fund Withdrawal", function () {
		beforeEach(async function () {
			await presale.startSale();
			// Make successful sale
			await presale.connect(contributor1).contribute({ value: ethers.parseEther("5") });
			await presale.connect(contributor2).contribute({ value: ethers.parseEther("5") });

			// Fast forward and finalize
			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);
			await presale.finalizeSale();
		});

		it("Should allow owner to withdraw funds from successful sale", async function () {
			await expect(presale.withdrawFunds())
				.to.emit(presale, "FundsWithdrawn")
				.withArgs(ethers.parseEther("10"));
		});

		it("Should not allow non-owner to withdraw funds", async function () {
			await expect(presale.connect(contributor1).withdrawFunds())
				.to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
		});
	});

	describe("Token Allocation Calculation", function () {
		beforeEach(async function () {
			await presale.startSale();
			await presale.connect(contributor1).contribute({ value: ethers.parseEther("4") });
			await presale.connect(contributor2).contribute({ value: ethers.parseEther("5") });
			await presale.connect(contributor3).contribute({ value: ethers.parseEther("1") });

			await ethers.provider.send("evm_increaseTime", [24 * 3600]);
			await ethers.provider.send("evm_mine", []);
			await presale.finalizeSale();
		});

		it("Should calculate correct token allocations", async function () {
			const totalTokens = ethers.parseEther("1000000"); // 1M tokens for presale

			const allocation1 = await presale.calculateTokenAllocation(contributor1.address, totalTokens);
			const allocation2 = await presale.calculateTokenAllocation(contributor2.address, totalTokens);
			const allocation3 = await presale.calculateTokenAllocation(contributor3.address, totalTokens);

			// contributor1: 4 ETH out of 10 ETH = 40%
			expect(allocation1).to.equal(ethers.parseEther("400000"));

			// contributor2: 5 ETH out of 10 ETH = 50%
			expect(allocation2).to.equal(ethers.parseEther("500000"));

			// contributor3: 1 ETH out of 10 ETH = 10%
			expect(allocation3).to.equal(ethers.parseEther("100000"));

			// Total should equal the allocated tokens
			expect(allocation1 + allocation2 + allocation3).to.equal(totalTokens);
		});
	});

	describe("View Functions", function () {
		it("Should return correct sale info", async function () {
			const info = await presale.getSaleInfo();
			expect(info._saleFinalized).to.be.false;
			expect(info._totalRaised).to.equal(0);
			expect(info._contributors).to.equal(0);
			expect(info._startTime).to.equal(0);
			expect(info._endTime).to.equal(0);
		});

		it("Should return contribution info", async function () {
			const info = await presale.getContributionInfo(contributor1.address);
			expect(info._contribution).to.equal(0);
			expect(info._hasContributed).to.be.false;
			expect(info._hasRefunded).to.be.false;
		});

		it("Should return time remaining", async function () {
			await presale.startSale();
			const remaining = await presale.getTimeRemaining();
			expect(remaining).to.be.greaterThan(0);
			expect(remaining).to.be.lessThanOrEqual(24 * 3600);
		});
	});
});
