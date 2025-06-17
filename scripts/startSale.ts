import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BackroomPresale } from "../typechain-types";

import dotenv from "dotenv";

dotenv.config();

const BACKROOM_PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

async function main(): Promise<void> {
	const [owner]: HardhatEthersSigner[] = await ethers.getSigners();

	console.log("- Owner:", owner.address);


	const BackroomPresaleFactory = await ethers.getContractFactory("BackroomPresale");
	const presale = await BackroomPresaleFactory.attach(BACKROOM_PRESALE_ADDRESS) as BackroomPresale;

	console.log("\n2. Initial contract state:");
	let info = await presale.getSaleInfo();
	console.log("- Sale finalized:", info._saleFinalized);
	console.log("- Sale successful:", info._saleSuccessful);
	console.log("- Total raised:", ethers.formatEther(info._totalRaised), "ETH");

	console.log("\n3. Starting sale...");
	await presale.connect(owner).startSale();
	console.log("Sale started!");

	console.log("Waiting 5 seconds...");
	await new Promise(resolve => setTimeout(resolve, 5000));

	info = await presale.getSaleInfo();
	console.log("- Sale finalized:", info._saleFinalized);
	console.log("- Start time:", new Date(Number(info._startTime) * 1000).toLocaleString());
	console.log("- End time:", new Date(Number(info._endTime) * 1000).toLocaleString());
	console.log("- Time remaining:", Number(await presale.getTimeRemaining()), "seconds");
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error(error);
		process.exit(1);
	});
