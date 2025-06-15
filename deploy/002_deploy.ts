import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	console.log("Deploying BackroomShares contract...");
	console.log("Deploying contracts with the account:", deployer);

	// Get deployer balance
	const deployerSigner = await ethers.getSigner(deployer);
	const balance = await deployerSigner.provider.getBalance(deployer);
	console.log("Account balance:", ethers.formatEther(balance), "ETH");

	// Check required environment variables
	if (!process.env.PROTOCOL_FEE_DESTINATION) {
		throw new Error("PROTOCOL_FEE_DESTINATION environment variable is required");
	}
	if (!process.env.PROTOCOL_FEE_PERCENT) {
		throw new Error("PROTOCOL_FEE_PERCENT environment variable is required");
	}
	if (!process.env.SUBJECT_FEE_PERCENT) {
		throw new Error("SUBJECT_FEE_PERCENT environment variable is required");
	}

	// Get parameters from environment variables
	const protocolFeeDestination = process.env.PROTOCOL_FEE_DESTINATION;
	const protocolFeePercent = process.env.PROTOCOL_FEE_PERCENT;
	const subjectFeePercent = process.env.SUBJECT_FEE_PERCENT;

	console.log("Deployment parameters:");
	console.log("- Protocol Fee Destination:", protocolFeeDestination);
	console.log("- Protocol Fee Percent:", protocolFeePercent);
	console.log("- Subject Fee Percent:", subjectFeePercent);

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("BackroomShares", {
		from: deployer,
		args: [
			protocolFeeDestination,
			protocolFeePercent,
			subjectFeePercent
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("BackroomShares deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);
};

export default func;
func.tags = ["BackroomShares"];
