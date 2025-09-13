import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BackroomPresale } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const BACKROOM_PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

async function main(): Promise<void> {
	const [owner]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("- Owner:", owner.address);

	const BackroomPresaleFactory = await ethers.getContractFactory("Presale");
	const presale = await BackroomPresaleFactory.attach(BACKROOM_PRESALE_ADDRESS) as BackroomPresale;

	console.log("\n1. Checking contract state:");
	let info = await presale.getSaleInfo();
	console.log("- Sale finalized:", info._saleFinalized);
	console.log("- Sale successful:", info._saleSuccessful);
	console.log("- Total raised:", ethers.formatEther(info._totalRaised), "ETH");
	console.log("- Contract balance:", ethers.formatEther(await ethers.provider.getBalance(BACKROOM_PRESALE_ADDRESS)), "ETH");

	if (!info._saleFinalized) {
		console.log("\n2. Finalizing sale...");
		const txFinalize = await presale.connect(owner).finalizeSale();
		await txFinalize.wait();
		console.log("Sale finalized successfully!");

		console.log("Waiting 5 seconds...");
		await new Promise(resolve => setTimeout(resolve, 5000));

	} else {
		console.log("Sale already finalized");
	}

	console.log("\n3. Withdrawing funds...");
	const txWithdraw = await presale.connect(owner).withdrawFunds();
	await txWithdraw.wait();
	console.log("Funds withdrawn successfully!");

	console.log("\n4. Final contract state:");
	console.log("- Contract balance:", ethers.formatEther(await ethers.provider.getBalance(BACKROOM_PRESALE_ADDRESS)), "ETH");
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
