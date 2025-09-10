import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import dotenv from "dotenv";

dotenv.config();

const PRESALE_ADDRESS = process.env.BACKROOM_PRESALE_ADDRESS || "";

async function getUSDCTokenInfo(contract: any) {
	try {
		const usdcAddress = await contract.usdcToken();
		const usdcContract = await ethers.getContractAt("IERC20", usdcAddress);
		const symbol = await usdcContract.symbol();
		const decimals = await usdcContract.decimals();
		return { address: usdcAddress, symbol, decimals };
	} catch (error) {
		return { address: "Unknown", symbol: "USDC", decimals: 6 };
	}
}

async function main(): Promise<void> {
	console.log("💰 Presale Funds Withdrawal");
	console.log("===========================");

	if (!PRESALE_ADDRESS) {
		console.error("PRESALE_ADDRESS not found in environment variables");
		console.log("Please set PRESALE_ADDRESS in your .env file");
		process.exit(1);
	}

	const [owner]: HardhatEthersSigner[] = await ethers.getSigners();
	console.log(`Owner: ${owner.address}`);
	console.log(`Contract: ${PRESALE_ADDRESS}`);

	const Presale = await ethers.getContractFactory("Presale");
	const presaleContract = Presale.attach(PRESALE_ADDRESS) as Presale;

	const usdcInfo = await getUSDCTokenInfo(presaleContract);
	console.log(`USDC Token: ${usdcInfo.address} (${usdcInfo.symbol})`);

	let tx = await presaleContract.finalizeSale();
	await tx.wait();
	console.log("Sale finalized successfully!");

	console.log("Withdrawing funds...");
	tx = await presaleContract.withdrawFunds();
	await tx.wait();

	console.log("Funds withdrawn successfully!");
}

main()
	.then(() => process.exit(0))
	.catch((error: Error) => {
		console.error("💥 Unexpected error:", error);
		process.exit(1);
	});
