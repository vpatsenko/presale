import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	console.log("Deploying TestToken contract...");
	console.log("Deploying contracts with the account:", deployer);

	const deployerSigner = await ethers.getSigner(deployer);
	const balance = await deployerSigner.provider.getBalance(deployer);
	console.log("Account balance:", ethers.formatEther(balance), "ETH");

	const deployment = await deploy("TestToken", {
		from: deployer,
		log: true,
		waitConfirmations: 1,
	});

	console.log("TestToken deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);
};

export default func;

func.tags = ["TestToken"];
// 0xDc2aCCA7c2d40EADbc0845847Ae23F6BFAf28FC0
