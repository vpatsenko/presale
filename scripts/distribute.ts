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
    roomTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    batchSize: 100
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

async function distributeTokens(allocations: PresaleAllocation[]): Promise<void> {
    const [signer] = await ethers.getSigners();
    const tokenContract = new ethers.Contract(CONFIG.roomTokenAddress, ERC20_ABI, signer);

    console.log(`Starting distribution of ${allocations.length} allocations...`);

    for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];

        try {
            console.log(`[${i + 1}/${allocations.length}] Transferring ${allocation.amount} tokens to ${allocation.address}...`);

            const amountInUSDc = ethers.parseUnits(allocation.amount, 6);

            const tx = await tokenContract.transfer(
                allocation.address,
                amountInUSDc
            );

            await tx.wait();
            console.log(`   ✅ Transfer completed! TX: ${tx.hash}`);

        } catch (error: any) {
            console.error(`   ❌ Transfer failed: ${error.message}`);
        }
    }
}


async function main(): Promise<void> {
    console.log("Starting Token Distribution process...\n");

    try {
        console.log("📄 Loading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'Sunny refunds.csv');
        const csvContent = fs.readFileSync(presaleAllocPath, 'utf-8');
        const allocations = CSVParser.parsePresaleAllocations(csvContent);

        await distributeTokens(allocations);

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

// 0x61a1d40346bdedf611cd3c89916894c6f8b8d63e,327.63
// 0xa9597e0dcd1be1c49ed844e1ba288893ccca1327,1979.26
// 0xe673f5e474dbf76a1230fea52e8e58f4baca151c,3035.47
