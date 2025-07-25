import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { BackroomShares, TestToken } from "../typechain-types";
import { bigint } from "hardhat/internal/core/params/argumentTypes";
import { Log } from "hardhat-deploy/types";
import { TypedEventLog } from "../typechain-types/common";

describe("BackroomShares", function () {
	let backroomShares: BackroomShares;
	let testToken: TestToken;
	let owner: SignerWithAddress;
	let protocolFeeDestination: SignerWithAddress;
	let subject: SignerWithAddress;
	let buyer: SignerWithAddress;
	let jhon: SignerWithAddress;
	let protocolFeePercent: bigint;
	let subjectFeePercent: bigint;

	beforeEach(async function () {
		[owner, protocolFeeDestination, subject, buyer, jhon] = await ethers.getSigners();
		protocolFeePercent = ethers.parseEther("0.05"); // 5%
		subjectFeePercent = ethers.parseEther("0.05"); // 5%

		const TestToken = await ethers.getContractFactory("TestToken");
		testToken = await TestToken.deploy();
		await testToken.waitForDeployment();

		const BackroomsShares = await ethers.getContractFactory("BackroomShares");
		backroomShares = await BackroomsShares.deploy(
			protocolFeeDestination.address,
			protocolFeePercent,
			subjectFeePercent,
			await testToken.getAddress(),
			16000n, // divisor1
			32000n, // divisor2
			8000n   // divisor3
		);
		await backroomShares.waitForDeployment();

		const tokenAmount = ethers.parseEther("1000");

		await testToken.transfer(buyer.address, tokenAmount);
		await testToken.transfer(jhon.address, tokenAmount);
		await testToken.transfer(subject.address, tokenAmount);
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

		it("Should set the correct token address", async function () {
			expect(await backroomShares.token()).to.equal(await testToken.getAddress());
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

	describe("Share Trading with ERC20", function () {
		it("Should allow subject to buy first share with ERC20", async function () {
			const amount = 1n;
			const price = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			const initialSubjectBalance = await testToken.balanceOf(subject.address);
			const initialContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const initialProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);

			await testToken.connect(subject).approve(await backroomShares.getAddress(), price);

			const tx = await backroomShares.connect(subject).buyShares(subject.address, amount, 1);
			const receipt = await tx.wait();
			const tradeEvent = receipt!.logs.find((log: any) => log.fragment?.name === "Trade") as any;

			const actualBasePrice = tradeEvent.args[4];  // ethAmount
			const actualProtocolFee = tradeEvent.args[5]; // protocolEthAmount
			const actualSubjectFee = tradeEvent.args[6];  // subjectEthAmount

			expect(price).to.equal(actualBasePrice + actualProtocolFee + actualSubjectFee);

			const finalSubjectBalance = await testToken.balanceOf(subject.address);
			const finalContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const finalProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);

			expect(finalSubjectBalance).to.equal(initialSubjectBalance - price);
			expect(finalContractBalance).to.equal(initialContractBalance + actualBasePrice);
			expect(finalProtocolBalance).to.equal(initialProtocolBalance + actualProtocolFee);

			expect(await backroomShares.sharesBalance(subject.address, subject.address)).to.equal(amount);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(amount);
		});

		it("Should allow buying shares after first share exists with ERC20", async function () {
			const firstAmount = 1n;
			const firstPrice = await backroomShares.getBuyPriceAfterFee(subject.address, firstAmount);
			await testToken.connect(subject).approve(await backroomShares.getAddress(), firstPrice);
			await backroomShares.connect(subject).buyShares(subject.address, firstAmount, 1);

			const amount = 2n;
			const price = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			const initialBuyerBalance = await testToken.balanceOf(buyer.address);
			const initialContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const initialProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);
			const initialSubjectBalance = await testToken.balanceOf(subject.address);

			await testToken.connect(buyer).approve(await backroomShares.getAddress(), price);

			const tx = await backroomShares.connect(buyer).buyShares(subject.address, amount, 1);
			const receipt = await tx.wait();
			const tradeEvent = receipt!.logs.find((log: any) => log.fragment?.name === "Trade") as any;

			const actualBasePrice = tradeEvent.args[4];  // ethAmount
			const actualProtocolFee = tradeEvent.args[5]; // protocolEthAmount
			const actualSubjectFee = tradeEvent.args[6];  // subjectEthAmount

			expect(price).to.equal(actualBasePrice + actualProtocolFee + actualSubjectFee);

			const finalBuyerBalance = await testToken.balanceOf(buyer.address);
			const finalContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const finalProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);
			const finalSubjectBalance = await testToken.balanceOf(subject.address);

			expect(finalBuyerBalance).to.equal(initialBuyerBalance - price);
			expect(finalContractBalance).to.equal(initialContractBalance + actualBasePrice);
			expect(finalProtocolBalance).to.equal(initialProtocolBalance + actualProtocolFee);
			expect(finalSubjectBalance).to.equal(initialSubjectBalance + actualSubjectFee);

			expect(await backroomShares.sharesBalance(subject.address, buyer.address)).to.equal(amount);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(firstAmount + amount);
		});

		it("Should allow selling shares with ERC20", async function () {
			const buyAmountBySubject = 1n;
			const buyPriceBySubject = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmountBySubject);
			await testToken.connect(subject).approve(await backroomShares.getAddress(), buyPriceBySubject);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmountBySubject, 1);


			const buyAmountByBuyer = 200n;
			const buyPriceByBuyer = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmountByBuyer);

			await testToken.connect(buyer).approve(await backroomShares.getAddress(), buyPriceByBuyer);
			await backroomShares.connect(buyer).buyShares(subject.address, buyAmountByBuyer, 1);

			const sellAmountByBuyer = 200n;
			const sellPriceByBuyer = await backroomShares.getSellPriceAfterFee(subject.address, sellAmountByBuyer);

			const initialBuyerBalance = await testToken.balanceOf(buyer.address);
			const initialContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const initialProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);
			const initialSubjectBalance = await testToken.balanceOf(subject.address);


			const tx = await backroomShares.connect(buyer).sellShares(subject.address, sellAmountByBuyer);
			const receipt = await tx.wait();
			const tradeEvent = receipt!.logs.find((log: any) => log.fragment?.name === "Trade") as any;

			const actualBasePrice = tradeEvent.args[4];  // ethAmount
			const actualProtocolFee = tradeEvent.args[5]; // protocolEthAmount
			const actualSubjectFee = tradeEvent.args[6];  // subjectEthAmount

			expect(sellPriceByBuyer).to.equal(actualBasePrice - actualProtocolFee - actualSubjectFee);

			const finalBuyerBalance = await testToken.balanceOf(buyer.address);
			const finalContractBalance = await testToken.balanceOf(await backroomShares.getAddress());
			const finalProtocolBalance = await testToken.balanceOf(protocolFeeDestination.address);
			const finalSubjectBalance = await testToken.balanceOf(subject.address);

			expect(finalBuyerBalance).to.equal(initialBuyerBalance + sellPriceByBuyer);
			expect(finalContractBalance).to.equal(initialContractBalance - actualBasePrice);
			expect(finalProtocolBalance).to.equal(initialProtocolBalance + actualProtocolFee);
			expect(finalSubjectBalance).to.equal(initialSubjectBalance + actualSubjectFee);

			const expectedSupply = buyAmountBySubject + buyAmountByBuyer - sellAmountByBuyer;
			expect(await backroomShares.sharesBalance(subject.address, subject.address)).to.equal(buyAmountBySubject);
			expect(await backroomShares.sharesBalance(subject.address, buyer.address)).to.equal(buyAmountByBuyer - sellAmountByBuyer);
			expect(await backroomShares.sharesSupply(subject.address)).to.equal(expectedSupply);
		});

		it("Should not allow selling more shares than owned", async function () {
			const buyAmountBySubject = 1n;
			const buyPriceBySubject = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmountBySubject);
			await testToken.connect(subject).approve(await backroomShares.getAddress(), buyPriceBySubject);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmountBySubject, 1);

			const buyAmountByBuyer = 200n;
			const buyPriceByBuyer = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmountByBuyer);
			await testToken.connect(buyer).approve(await backroomShares.getAddress(), buyPriceByBuyer);
			await backroomShares.connect(buyer).buyShares(subject.address, buyAmountByBuyer, 1);

			const buyAmountByJhon = 10n;
			const buyPriceByJhon = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmountByJhon);
			await testToken.connect(jhon).approve(await backroomShares.getAddress(), buyPriceByJhon);
			await backroomShares.connect(jhon).buyShares(subject.address, buyAmountByJhon, 1);

			const sellAmountByBuyer = 201n; // Trying to sell more than owned (buyer only has 200)
			// Don't calculate price as it will overflow, just approve a large amount
			await testToken.connect(buyer).approve(await backroomShares.getAddress(), ethers.parseEther("1000"));

			await expect(
				backroomShares.connect(buyer).sellShares(subject.address, sellAmountByBuyer)
			).to.be.revertedWith("Insufficient shares");
		});

		it("Should not allow selling the last share", async function () {
			const buyAmount = 1n;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);
			await testToken.connect(subject).approve(await backroomShares.getAddress(), buyPrice);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, 1);

			await expect(
				backroomShares.connect(subject).sellShares(subject.address, buyAmount)
			).to.be.revertedWith("Cannot sell the last share");
		});
	});

	describe("Price Calculations", function () {
		it("Should calculate correct buy price for the first share", async function () {
			const amount = 1n;
			const price = await backroomShares.getBuyPrice(subject.address, amount);
			expect(price).equal(0);
		});

		it("Should include fees in buy price after fee", async function () {
			const amount = 1n;
			const basePrice = await backroomShares.getBuyPrice(subject.address, amount);
			const priceAfterFee = await backroomShares.getBuyPriceAfterFee(subject.address, amount);

			const expectedProtocolFee = (basePrice * protocolFeePercent) / ethers.parseEther("1");
			const expectedSubjectFee = (basePrice * subjectFeePercent) / ethers.parseEther("1");

			expect(priceAfterFee).to.equal(basePrice + expectedProtocolFee + expectedSubjectFee);
		});

		it("Should include fees in sell price after fee", async function () {
			// First buy some shares
			const buyAmount = 1n;
			const buyPrice = await backroomShares.getBuyPriceAfterFee(subject.address, buyAmount);

			// Approve tokens before buying
			await testToken.connect(subject).approve(await backroomShares.getAddress(), buyPrice);
			await backroomShares.connect(subject).buyShares(subject.address, buyAmount, 1);

			const sellAmount = 1n;
			const basePrice = await backroomShares.getSellPrice(subject.address, sellAmount);
			const priceAfterFee = await backroomShares.getSellPriceAfterFee(subject.address, sellAmount);

			const expectedProtocolFee = (basePrice * protocolFeePercent) / ethers.parseEther("1");
			const expectedSubjectFee = (basePrice * subjectFeePercent) / ethers.parseEther("1");

			expect(priceAfterFee).to.equal(basePrice - expectedProtocolFee - expectedSubjectFee);
		});
	});
});
