import { ethers } from "hardhat";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE);

const STAKING_CONTRACT_ADDRESS = "0x36F6158ec445475B50387ECa09de977a8d194358";
const STAKING_CONTRACT_ABI = [
	"event Withdraw(address indexed user, uint pid, uint amount)",
	"event Stake(address indexed user, uint id, uint amount, uint8 numWeeks)",
]

// const CREATION_BLOCK = 34745248;
const CREATION_BLOCK = 31733060;
const BLOCK_SIZE = 10000;

const stakers = new Map<string, bigint>();

async function getStakers() {
	const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_CONTRACT_ABI, provider);

	const withdrawFilter = stakingContract.filters.Withdraw();
	const stakeFilter = stakingContract.filters.Stake();





	const latestBlock = await provider.getBlockNumber();
	const blocksToProcess = latestBlock - CREATION_BLOCK;
	const totalChunks = Math.ceil(blocksToProcess / BLOCK_SIZE);
	let currentChunk = 0;

	console.log(`Processing ${blocksToProcess} blocks in ${totalChunks} chunks`);

	for (let i = CREATION_BLOCK; i < latestBlock; i += BLOCK_SIZE) {
		const endBlock = Math.min(i + BLOCK_SIZE, latestBlock);

		let withdrawLogs = await stakingContract.queryFilter(withdrawFilter, i, endBlock);
		let stakeLogs = await stakingContract.queryFilter(stakeFilter, i, endBlock);

		stakeLogs.forEach((log: any) => {
			const user = log.args.user;
			const amount = BigInt(log.args.amount);

			stakers.set(user, (stakers.get(user) || BigInt(0)) + amount);
		});

		withdrawLogs.forEach((log: any) => {
			const user = log.args.user;
			const amount = BigInt(log.args.amount);

			stakers.set(user, (stakers.get(user) || BigInt(0)) - amount);
		});

		currentChunk++;
		console.log(`Processed chunk ${currentChunk} of ${totalChunks}`);
	}
}

async function saveStakers() {
	let csvContent = "address,staked_amount\n";

	Array.from(stakers.entries()).forEach(([address, amount]) => {
		csvContent += `${address},${ethers.formatUnits(amount, 18)}\n`;
	});

	fs.writeFileSync("stakers.csv", csvContent);
}

async function main() {
	try {
		await getStakers()
		await saveStakers()
	} catch (error) {
		console.error(error);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
