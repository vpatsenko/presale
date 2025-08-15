import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

interface PresaleAllocation {
    address: string;
    amount: string;
}

interface Config {
    roomTokenAddress: string;
    batchSize: number;
}

const CONFIG: Config = {
    roomTokenAddress: "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7",
    batchSize: 100
};

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const MULTICALL_ABI = [
    "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[] returnData)"
];

class CSVParser {
    static parsePresaleAllocations(csvContent: string): PresaleAllocation[] {
        const lines = csvContent.trim().split('\n');
        const allocations: PresaleAllocation[] = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const [address, amount] = line.split(',');
            if (address && amount) {
                allocations.push({
                    address: address.trim(),
                    amount: amount.trim()
                });
            }
        }

        return allocations;
    }
}

async function distributeTokensBatch(allocations: PresaleAllocation[]): Promise<void> {
    const [signer] = await ethers.getSigners();
    const tokenContract = new ethers.Contract(CONFIG.roomTokenAddress, ERC20_ABI, signer);
    const multicallContract = new ethers.Contract("0xcA11bde05977b3631167028862bE2a173976CA11", MULTICALL_ABI, signer);

    for (let i = 0; i < allocations.length; i += 100) {
        const batch = allocations.slice(i, i + 100);

        const calls = batch.map(allocation => ({
            target: tokenContract.target,
            callData: tokenContract.interface.encodeFunctionData("transfer", [
                allocation.address,
                ethers.parseUnits(allocation.amount, 18)
            ])
        }));

        const tx = await multicallContract.tryAggregate(false, calls);
        await tx.wait();
    }
}


async function main(): Promise<void> {
    console.log("Starting Token Distribution process...\n");

    try {
        console.log("📄 Loading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'distribution.csv');
        const csvContent = fs.readFileSync(presaleAllocPath, 'utf-8');
        const allocations = CSVParser.parsePresaleAllocations(csvContent);

        await distributeTokensBatch(allocations);

        console.log("\nProcess completed successfully!");
    } catch (error: any) {
        console.error("Process failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
