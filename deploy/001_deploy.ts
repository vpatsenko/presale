import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

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

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("BackroomPresale", {
		from: deployer,
		args: [
			softCap,
			hardCap,
			minContribution,
			maxContribution
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("BackroomPresale deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);


};

export default func;
func.tags = ["BackroomPresale"];
