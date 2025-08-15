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
    delayBetweenTransactions: number;
}

const CONFIG: Config = {
    roomTokenAddress: "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7",
    delayBetweenTransactions: 3000
};

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
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


async function main(): Promise<void> {
    console.log("Starting Token Distribution process...\n");

    try {
        console.log("📄 Loading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'presale_alloc_2.csv');
        const allocations = CSVParser.parsePresaleAllocations(presaleAllocPath);




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
