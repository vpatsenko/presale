import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const { deployments, getNamedAccounts } = hre;
	const { deploy } = deployments;

	const { deployer } = await getNamedAccounts();

	console.log("Deploying MerkleTreeDistributor contract...");
	console.log("Deploying contracts with the account:", deployer);

	// Get deployer balance
	const deployerSigner = await ethers.getSigner(deployer);
	const balance = await deployerSigner.provider.getBalance(deployer);
	console.log("Account balance:", ethers.formatEther(balance), "ETH");

	// Check required environment variables
	if (!process.env.ERC20_ADDRESS) {
		throw new Error("ERC20_ADDRESS environment variable is required");
	}
	if (!process.env.MERKLE_ROOT) {
		throw new Error("MERKLE_ROOT environment variable is required");
	}

	// Get parameters from environment variables
	const tokenAddress = process.env.ERC20_ADDRESS;
	const merkleRoot = process.env.MERKLE_ROOT;

	// Validate inputs
	if (!ethers.isAddress(tokenAddress)) {
		throw new Error("Invalid ERC20_ADDRESS: must be a valid Ethereum address");
	}

	if (!merkleRoot.startsWith("0x") || merkleRoot.length !== 66) {
		throw new Error("Invalid MERKLE_ROOT: must be a 32-byte hex string with 0x prefix");
	}

	console.log("Deployment parameters:");
	console.log("- Token Address:", tokenAddress);
	console.log("- Merkle Root:", merkleRoot);

	// Deploy the contract using hardhat-deploy
	const deployment = await deploy("MerkleTreeDistributor", {
		from: deployer,
		args: [
			tokenAddress,
			merkleRoot
		],
		log: true,
		waitConfirmations: 1,
	});

	console.log("MerkleTreeDistributor deployed to:", deployment.address);
	console.log("Deployment transaction hash:", deployment.transactionHash);

	// Verify deployment by checking contract state
	const merkleDistributor = await ethers.getContractAt("MerkleTreeDistributor", deployment.address);
	const deployedTokenAddress = await merkleDistributor.token();
	const deployedMerkleRoot = await merkleDistributor.merkleRoot();
	const contractOwner = await merkleDistributor.owner();

	console.log("\n✅ Deployment verification:");
	console.log("- Contract owner:", contractOwner);
	console.log("- Token address:", deployedTokenAddress);
	console.log("- Merkle root:", deployedMerkleRoot);

	// Validate deployed values
	if (deployedTokenAddress.toLowerCase() !== tokenAddress.toLowerCase()) {
		throw new Error("Deployment verification failed: Token address mismatch");
	}
	if (deployedMerkleRoot !== merkleRoot) {
		throw new Error("Deployment verification failed: Merkle root mismatch");
	}

	console.log("✅ All deployment parameters verified successfully!");

	console.log("\n💡 Next steps:");
	console.log("1. Transfer tokens to the distributor contract:", deployment.address);
	console.log("2. Users can claim tokens using the claim() function with valid merkle proofs");
	console.log("3. After distribution period, call withdrawRemainingTokens() to recover unclaimed tokens");
};

export default func;
func.tags = ["MerkleTreeDistributor"];
