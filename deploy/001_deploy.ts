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

	// Get parameters from environment variables
	const softCap = ethers.formatEther(process.env.SOFT_CAP);
	const hardCap = ethers.formatEther(process.env.HARD_CAP);
	const minContribution = ethers.formatEther(process.env.MIN_CONTRIBUTION);
	const maxContribution = ethers.formatEther(process.env.MAX_CONTRIBUTION);


	console.log("Deployment parameters:");
	console.log("- Soft Cap:", softCap, "ETH");
	console.log("- Hard Cap:", hardCap, "ETH");
	console.log("- Min Contribution:", minContribution, "ETH");
	console.log("- Max Contribution:", maxContribution, "ETH");

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("BackroomPresale", {
		from: deployer,
		args: [
			ethers.parseEther(softCap),
			ethers.parseEther(hardCap),
			ethers.parseEther(minContribution),
			ethers.parseEther(maxContribution)
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("BackroomPresale deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);
};

export default func;
func.tags = ["BackroomPresale"];
