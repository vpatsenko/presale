import { ethers } from "hardhat";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE);

const BACKROOM_CREATOR="0x8631eE60D9B70598d0DC484BFC3BA1BA71760E03"
const BACKROOM_CONTRACT_ADDRESS = "0xbBc7b45150715C06E86964De98562c1171bA408b";
const STAKING_CONTRACT_ADDRESS = "0x36F6158ec445475B50387ECa09de977a8d194358";

const BACKROOM_CONTRACT_ABI = [
	"function sharesBalance(address, address) view returns (uint256)",
]
const STAKING_CONTRACT_ABI = [
	"event Withdraw(address indexed user, uint pid, uint amount)",
	"event Stake(address indexed user, uint id, uint amount, uint8 numWeeks)",
	"event AutoRenew(address indexed user, uint256 id, bool autoRenew)",
]


// const CREATION_BLOCK = 34745248;
const CREATION_BLOCK = 31733060;
const BLOCK_SIZE = 10000;
const HARDCAP = 11_600n;


interface Stake{
	amount: bigint;
	autoRenew: boolean;
}

const stakers = new Map<string, Map<bigint, Stake>>();
const stakersCleared = new Map<string, bigint>();
const creatorRoomHolders = new Map<string, bigint>();

let totalRoomStakedByRoomHolder = BigInt(0);

async function getStakers() {
	const stakingContract = new ethers.Contract(STAKING_CONTRACT_ADDRESS, STAKING_CONTRACT_ABI, provider);
	const backroomContract = new ethers.Contract(BACKROOM_CONTRACT_ADDRESS, BACKROOM_CONTRACT_ABI, provider);

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

	// stakersCleared.set("0x9ECAd9d9D3ED0938Cc3b84732D3FFa8ECe3a87c8", BigInt(10) * BigInt(10**18));
	// stakersCleared.set("0x70aCC72c048678F6F006aF8b194A6102c490Bc40", BigInt(10) * BigInt(10**18));

	for (const [address, amount] of stakersCleared.entries()) {
		const balance = await backroomContract.sharesBalance(BACKROOM_CREATOR, address);
		console.log(`${address} balance: ${balance}`);

		if (balance > BigInt(0)) {
			totalRoomStakedByRoomHolder += amount;

			const roomBalance = stakersCleared.get(address);
			creatorRoomHolders.set(address, roomBalance || BigInt(0));
		}
	}

	// backroomContract.sharesBalance(BACKROOM_CREATOR, "0x9ECAd9d9D3ED0938Cc3b84732D3FFa8ECe3a87c8").then((balance: bigint) => {
	// 	console.log("Balance:", balance);
	// });

	console.log("Total room staked by holders:", ethers.formatUnits(totalRoomStakedByRoomHolder, 18));
}

async function saveStakers() {
	let csvContent = "address,staked_amount,allocation\n";

	Array.from(creatorRoomHolders.entries()).forEach(([address, amount]) => {
		const allocation = HARDCAP * BigInt(10) * (amount / totalRoomStakedByRoomHolder)

		csvContent += `${address},${ethers.formatUnits(amount, 18)},${ethers.formatUnits(allocation, 18)} \n`;
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
