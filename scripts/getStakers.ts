import { ethers } from "hardhat";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE);

const STAKING_CONTRACT_ADDRESS = "0x36F6158ec445475B50387ECa09de977a8d194358";
const STAKING_CONTRACT_ABI = [
	"event Withdraw(address indexed user, uint pid, uint amount)",
	"event Stake(address indexed user, uint id, uint amount, uint8 numWeeks)",
	"event AutoRenew(address indexed user, uint256 id, bool autoRenew)",
]

// const CREATION_BLOCK = 34745248;
const CREATION_BLOCK = 31733060;
const BLOCK_SIZE = 10000;


interface Stake{
	amount: bigint;
	autoRenew: boolean;
}

const stakers = new Map<string, Map<bigint, Stake>>();
const stakersCleared = new Map<string, bigint>();

async function getStakers() {
	const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_CONTRACT_ABI, provider);

	const stakeFilter = stakingContract.filters.Stake();
	const autoRenewFilter = stakingContract.filters.AutoRenew();

	let latestBlock = await provider.getBlockNumber();
	const blocksToProcess = latestBlock - CREATION_BLOCK;
	const totalChunks = Math.ceil(blocksToProcess / BLOCK_SIZE);
	let currentChunk = 0;


	// latestBlock = CREATION_BLOCK +1_000;


	for (let i = CREATION_BLOCK; i < latestBlock; i += BLOCK_SIZE) {
		const endBlock = Math.min(i + BLOCK_SIZE, latestBlock);

		let stakeLogs = await stakingContract.queryFilter(stakeFilter, i, endBlock);
		let autoRenewLogs = await stakingContract.queryFilter(autoRenewFilter, i, endBlock);

		stakeLogs.forEach((log: any) => {
			const user = log.args.user;
			const id = BigInt(log.args.id);
			const amount = BigInt(log.args.amount);

			const stake: Stake = {
				amount,
				autoRenew: true,
			};

			stakers.set(user, (stakers.get(user) || new Map<bigint, Stake>()).set(id, stake));
		});

		autoRenewLogs.forEach((log: any) => {
			const user = log.args.user;
			const id = BigInt(log.args.id);
			const autoRenew = log.args.autoRenew;

			const stake = stakers.get(user)?.get(id);
			if (stake) {
				stake.autoRenew = autoRenew;
			}
		});

		currentChunk++;
		console.log(`Processed chunk ${currentChunk} of ${totalChunks}`);
	}


	stakers.forEach((stakes, address) => {
		stakes.forEach((stake, id) => {
			if (address=="0x36F6158ec445475B50387ECa09de977a8d194358"){
				console.log(`stake: ${address} ${id} ${stake.amount} ${stake.autoRenew}`);
			}
			if (stake.autoRenew) {
				const currentAmount = stakersCleared.get(address) || BigInt(0);

				stakersCleared.set(address, currentAmount + stake.amount);
			}
		});

	});
}

async function saveStakers() {
	let csvContent = "address,staked_amount\n";

	Array.from(stakersCleared.entries()).forEach(([address, amount]) => {
		csvContent += `${address},${ethers.formatUnits(amount, 18)} \n`;
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
