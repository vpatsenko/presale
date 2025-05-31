const hre = require("hardhat");
const { ethers } = require("hardhat");
const { Wallet, utils } = require('ethers');
const { HDNodeWallet } = require('ethers');
const { Mnemonic } = require('ethers');

// Import dotenv to access environment variables
require('dotenv').config();

// Extract the deployer address from the mnemonic
const deployerMnemonic = process.env.ADMIN_MNEMONIC;
const deployerWallet = Wallet.fromPhrase(deployerMnemonic);
const deployerAddress = deployerWallet.address;

console.log("Deployer address from mnemonic:", deployerAddress);

async function main() {
	console.log("Deploying BackroomPresale contract...");

	// Get the ContractFactory and Signers
	const [deployer] = await ethers.getSigners();
	console.log("Deploying contracts with the account:", deployer.address);
	console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

	// Example parameters for the presale
	const softCap = ethers.parseEther("10");     // 10 ETH soft cap
	const hardCap = ethers.parseEther("100");    // 100 ETH hard cap
	const minContribution = ethers.parseEther("0.1"); // 0.1 ETH minimum
	const maxContribution = ethers.parseEther("5");   // 5 ETH maximum

	console.log("Deployment parameters:");
	console.log("- Soft Cap:", ethers.formatEther(softCap), "ETH");
	console.log("- Hard Cap:", ethers.formatEther(hardCap), "ETH");
	console.log("- Min Contribution:", ethers.formatEther(minContribution), "ETH");
	console.log("- Max Contribution:", ethers.formatEther(maxContribution), "ETH");

	// Deploy the contract
	const BackroomPresale = await ethers.getContractFactory("BackroomPresale");
	const presale = await BackroomPresale.deploy(
		softCap,
		hardCap,
		minContribution,
		maxContribution
	);

	await presale.waitForDeployment();
	const address = await presale.getAddress();

	console.log("BackroomPresale deployed to:", address);
	console.log("Deployment transaction hash:", presale.deploymentTransaction().hash);

	// Verify the deployment
	console.log("\nVerifying deployment...");
	const info = await presale.getSaleInfo();
	console.log("Sale active:", info._saleActive);
	console.log("Sale finalized:", info._saleFinalized);
	console.log("Total raised:", ethers.formatEther(info._totalRaised), "ETH");

	console.log("\nDeployment completed successfully!");
	console.log("Contract owner:", await presale.owner());
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
