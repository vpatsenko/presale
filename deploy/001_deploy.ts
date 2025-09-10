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
	if (!process.env.SOFT_CAP) {
		throw new Error("SOFT_CAP environment variable is required");
	}
	if (!process.env.HARD_CAP) {
		throw new Error("HARD_CAP environment variable is required");
	}
	if (!process.env.MIN_CONTRIBUTION) {
		throw new Error("MIN_CONTRIBUTION environment variable is required");
	}
	if (!process.env.MAX_CONTRIBUTION) {
		throw new Error("MAX_CONTRIBUTION environment variable is required");
	}
	if (!process.env.USDC_ADDRESS) {
		throw new Error("USDC_ADDRESS environment variable is required");
	}

	// Get parameters from environment variables
	const softCap = ethers.formatUnits(process.env.SOFT_CAP, 6);
	const hardCap = ethers.formatUnits(process.env.HARD_CAP, 6);
	const minContribution = ethers.formatUnits(process.env.MIN_CONTRIBUTION, 6);
	const maxContribution = ethers.formatUnits(process.env.MAX_CONTRIBUTION, 6);
	const usdcToken = process.env.USDC_ADDRESS;


	console.log("Deployment parameters:");

	console.log("- USDC Token:", usdcToken);
	console.log("- Soft Cap:", softCap, "USDC");
	console.log("- Hard Cap:", hardCap, "USDC");
	console.log("- Min Contribution:", minContribution, "USDC");
	console.log("- Max Contribution:", maxContribution, "USDC");

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("Presale", {
		from: deployer,
		args: [
			usdcToken,
			ethers.parseUnits(softCap, 6),
			ethers.parseUnits(hardCap, 6),
			ethers.parseUnits(minContribution, 6),
			ethers.parseUnits(maxContribution, 6)
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
