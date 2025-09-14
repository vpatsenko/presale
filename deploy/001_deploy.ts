import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	console.log("Deploying BackroomPresale contract...");
	console.log("Deploying contracts with the account:", deployer);

	// Get deployer balance
	const deployerSigner = await ethers.getSigner(deployer);
	const balance = await deployerSigner.provider.getBalance(deployer);
	console.log("Account balance:", ethers.formatEther(balance), "ETH");

	// Check required environment variables
	if (!process.env.USDC_ADDRESS) {
		throw new Error("USDC_ADDRESS environment variable is required");
	}

	// Get parameters from environment variables
	const usdcToken = process.env.USDC_ADDRESS;


	console.log("Deployment parameters:");

	console.log("- USDC Token:", usdcToken);

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("Presale", {
		from: deployer,
		args: [
			usdcToken,
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("BackroomPresale deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);
};

export default func;

func.tags = ["Presale"];

// - soft cap = 1 usdc
// - hard cap tbd (предварительно 20к)
// - максиальная продолжительность 24ч
// - персональный мин\макс 100\1000 usdc
