const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BackroomsShares", function () {
	let backroomShares;
	let owner;
	let protocolFeeDestination;
	let subject;
	let buyer;
	let protocolFeePercent;
	let subjectFeePercent;

	beforeEach(async function () {
		[owner, protocolFeeDestination, subject, buyer] = await ethers.getSigners();
		protocolFeePercent = ethers.parseEther("0.05"); // 5%
		subjectFeePercent = ethers.parseEther("0.05"); // 5%

		const BackroomsShares = await ethers.getContractFactory("BackroomsShares");
		backroomShares = await BackroomsShares.deploy(
			protocolFeeDestination.address,
			protocolFeePercent,
			subjectFeePercent
		);
		await backroomShares.waitForDeployment();
	});

	describe("Deployment", function () {
		it("Should set the right owner", async function () {
			expect(await backroomShares.owner()).to.equal(owner.address);
		});

		it("Should set the correct protocol fee destination", async function () {
			expect(await backroomShares.protocolFeeDestination()).to.equal(protocolFeeDestination.address);
		});

		it("Should set the correct fee percentages", async function () {
			expect(await backroomShares.protocolFeePercent()).to.equal(protocolFeePercent);
			expect(await backroomShares.subjectFeePercent()).to.equal(subjectFeePercent);
		});
	});

	describe("Fee Management", function () {
		it("Should allow owner to update fee destination", async function () {
			const newDestination = buyer.address;
			await backroomShares.setFeeDestination(newDestination);
			expect(await backroomShares.protocolFeeDestination()).to.equal(newDestination);
		});

		it("Should allow owner to update protocol fee percent", async function () {
			const newFeePercent = ethers.parseEther("0.1"); // 10%
			await backroomShares.setProtocolFeePercent(newFeePercent);
			expect(await backroomShares.protocolFeePercent()).to.equal(newFeePercent);
		});

		it("Should allow owner to update subject fee percent", async function () {
			const newFeePercent = ethers.parseEther("0.1"); // 10%
			await backroomShares.setSubjectFeePercent(newFeePercent);
			expect(await backroomShares.subjectFeePercent()).to.equal(newFeePercent);
		});

		it("Should not allow non-owner to update fees", async function () {
			await expect(
				backroomShares.connect(buyer).setFeeDestination(buyer.address)
			).to.be.revertedWithCustomError(backroomShares, "OwnableUnauthorizedAccount");
		});
	});

	describe("Share Trading", function () {
		it("Should allow subject to buy first share", async function () {
			const amount = 1;
			const price = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			await expect(
				backroomShares.connect(subject).buyShares(subject.address, amount, { value: price })
			).to.emit(backroomShares, "Trade")
				.withArgs(
					subject.address,
					subject.address,
					true,
					amount,
					price - (price * protocolFeePercent / ethers.parseEther("1")) - (price * subjectFeePercent / ethers.parseEther("1")),
					price * protocolFeePercent / ethers.parseEther("1"),
					price * subjectFeePercent / ethers.parseEther("1"),
					amount
				);

			expect(await backroomShares.sharesBalance(subject.address, subject.address)).to.equal(amount);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(amount);
		});

		it("Should not allow non-subject to buy first share", async function () {
			const amount = 1;
			const price = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			await expect(
				backroomShares.connect(buyer).buyShares(subject.address, amount, { value: price })
			).to.be.revertedWith("Only the shares' subject can buy the first share");
		});

		it("Should allow buying shares after first share exists", async function () {
			// First, let subject buy the first share
			const firstAmount = 1;
			const firstPrice = await backroomShares.getBuyPriceAfterFee(subject.address, firstAmount);
			await backroomShares.connect(subject).buyShares(subject.address, firstAmount, { value: firstPrice });

			// Then, let buyer purchase shares
			const amount = 2;
			const price = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			await expect(
				backroomShares.connect(buyer).buyShares(subject.address, amount, { value: price })
			).to.emit(backroomShares, "Trade");

			expect(await backroomShares.sharesBalance(subject.address, buyer.address)).to.equal(amount);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(firstAmount + amount);
		});

		it("Should allow selling shares", async function () {
			// First, let subject buy shares
			const buyAmount = 3;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, { value: buyPrice });

			// Then sell some shares
			const sellAmount = 1;
			const sellPrice = await backroomShares.getSellPriceAfterFee(subject.address, sellAmount);

			await expect(
				backroomShares.connect(subject).sellShares(subject.address, sellAmount)
			).to.emit(backroomShares, "Trade");

			expect(await backroomShares.sharesBalance(subject.address, subject.address)).to.equal(buyAmount - sellAmount);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(buyAmount - sellAmount);
		});

		it("Should not allow selling more shares than owned", async function () {
			const buyAmount = 2;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, { value: buyPrice });

			await expect(
				backroomShares.connect(subject).sellShares(subject.address, buyAmount + 1)
			).to.be.revertedWith("Insufficient shares");
		});

		it("Should not allow selling the last share", async function () {
			const buyAmount = 1;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, { value: buyPrice });

			await expect(
				backroomShares.connect(subject).sellShares(subject.address, buyAmount)
			).to.be.revertedWith("Cannot sell the last share");
		});
	});

	describe("Price Calculations", function () {
		it("Should calculate correct buy price", async function () {
			const amount = 1;
			const price = await backroomShares.getBuyPrice(subject.address, amount);
			expect(price).to.be.gt(0);
		});

		it("Should calculate correct sell price", async function () {
			// First buy some shares
			const buyAmount = 2;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, { value: buyPrice });

			const sellAmount = 1;
			const sellPrice = await backroomShares.getSellPrice(subject.address, sellAmount);
			expect(sellPrice).to.be.gt(0);
		});

		it("Should include fees in buy price after fee", async function () {
			const amount = 1;
			const basePrice = await backroomShares.getBuyPrice(subject.address, amount);
			const priceAfterFee = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			const expectedProtocolFee = (basePrice * protocolFeePercent) / ethers.parseEther("1");
			const expectedSubjectFee = (basePrice * subjectFeePercent) / ethers.parseEther("1");

			expect(priceAfterFee).to.equal(basePrice + expectedProtocolFee + expectedSubjectFee);
		});

		it("Should include fees in sell price after fee", async function () {
			// First buy some shares
			const buyAmount = 2;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, { value: buyPrice });

			const sellAmount = 1;
			const basePrice = await backroomShares.getSellPrice(subject.address, sellAmount);
			const priceAfterFee = await backroomShares.getSellPriceAfterFee(subject.address, sellAmount);

			const expectedProtocolFee = (basePrice * protocolFeePercent) / ethers.parseEther("1");
			const expectedSubjectFee = (basePrice * subjectFeePercent) / ethers.parseEther("1");

			expect(priceAfterFee).to.equal(basePrice - expectedProtocolFee - expectedSubjectFee);
		});
	});
});
