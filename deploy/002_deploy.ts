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
	if (!process.env.ERC20_ADDRESS) {
		throw new Error("ERC20_ADDRESS environment variable is required");
	}
	if (!process.env.DIVISOR1) {
		throw new Error("DIVISOR1 environment variable is required");
	}
	if (!process.env.DIVISOR2) {
		throw new Error("DIVISOR2 environment variable is required");
	}
	if (!process.env.DIVISOR3) {
		throw new Error("DIVISOR3 environment variable is required");
	}

	// Get parameters from environment variables
	const protocolFeeDestination = process.env.PROTOCOL_FEE_DESTINATION;
	const protocolFeePercent = process.env.PROTOCOL_FEE_PERCENT;
	const subjectFeePercent = process.env.SUBJECT_FEE_PERCENT;
	const tokenAddress = process.env.ERC20_ADDRESS;
	const divisor1 = process.env.DIVISOR1;
	const divisor2 = process.env.DIVISOR2;
	const divisor3 = process.env.DIVISOR3;

	console.log("Deployment parameters:");
	console.log("- Protocol Fee Destination:", protocolFeeDestination);
	console.log("- Protocol Fee Percent:", protocolFeePercent);
	console.log("- Subject Fee Percent:", subjectFeePercent);
	console.log("- Token Address:", tokenAddress);
	console.log("- Divisor 1:", divisor1);
	console.log("- Divisor 2:", divisor2);
	console.log("- Divisor 3:", divisor3);

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("BackroomShares", {
		from: deployer,
		args: [
			protocolFeeDestination,
			protocolFeePercent,
			subjectFeePercent,
			tokenAddress,
			divisor1,
			divisor2,
			divisor3
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("BackroomShares deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);
};

export default func;
func.tags = ["BackroomShares"];
