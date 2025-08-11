import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { bigint } from "hardhat/internal/core/params/argumentTypes";
import { token } from "../typechain-types/@openzeppelin/contracts";

dotenv.config();

interface WalletData {
    address: string;
    mnemonic: string;
    privateKey: string;
}

interface MerkleProof {
    address: string;
    amount: string;
    leafIndex: number;
    proof: string[];
}

interface PresaleAllocation {
    address: string;
    amount: string;
}

const UNISWAP_V2_PAIR_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";
const ROOM_TOKEN_ADDRESS = "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7";
const VIRTUAL_TOKEN_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const UNISWAP_V2_ROUTER_ADDRESS = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

function parseWalletsCSV(csvContent: string): WalletData[] {
    const lines = csvContent.trim().split('\n');
    const wallets: WalletData[] = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [address, mnemonic, privateKey] = line.split(',');
            if (address && mnemonic && privateKey) {
                wallets.push({
                    address: address.trim(),
                    mnemonic: mnemonic.trim().replace(/"/g, ''), // Remove quotes from mnemonic
                    privateKey: privateKey.trim()
                });
            }
        }
    }

    return wallets;
}

function parsePresaleAllocCSV(csvContent: string): PresaleAllocation[] {
    const lines = csvContent.trim().split('\n');
    const allocations: PresaleAllocation[] = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [address, amount] = line.split(',');
            if (address && amount) {
                allocations.push({
                    address: address.trim(),
                    amount: amount.trim()
                });
            }
        }
    }

    return allocations;
}

async function distributeTokens(allocations: PresaleAllocation[]): Promise<void> {
    console.log(`\nDistributing ROOM tokens from admin wallet and selling immediately for ${allocations.length} addresses...`);
    console.log("═".repeat(80));

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;
    const adminWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);
    console.log(`Admin address: ${adminWallet.address}`);

    const ethWalletMap = new Map<string, WalletData>();
    // ethWallets.forEach(wallet => {
    //     ethWalletMap.set(wallet.address.toLowerCase(), wallet);
    // });

    const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)"
    ];

    const roomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, adminWallet);

    const adminBalance = await roomToken.balanceOf(adminWallet.address);
    console.log(`Admin ROOM balance: ${ethers.formatEther(adminBalance)} tokens`);

    const totalNeeded = allocations.reduce((sum, alloc) => sum + BigInt(alloc.amount), 0n);
    console.log(`Total tokens needed: ${ethers.formatEther(totalNeeded)} tokens`);

    if (adminBalance < totalNeeded) {
        throw new Error(`Insufficient admin balance. Have: ${ethers.formatEther(adminBalance)}, Need: ${ethers.formatEther(totalNeeded)}`);
    }

    let distributionFailureCount = 0;
    for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];
        const amount = BigInt(allocation.amount);

        try {
            console.log(`[${i + 1}/${allocations.length}] Sending ${ethers.formatEther(amount)} ROOM to ${allocation.address}...`);

            const tx = await roomToken.transfer(allocation.address, amount);
            console.log(`Transaction hash: ${tx.hash}`);


        } catch (error: any) {
            console.log(`Error sending tokens: ${error.message}`);
            distributionFailureCount++;
        }

        if (i < allocations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay for safety
        }
    }

    if (distributionFailureCount > 0) {
        throw new Error(`Failed to distribute to ${distributionFailureCount} addresses. Cannot proceed.`);
    }

    console.log("\nDistribution and selling process completed!");
}


async function main(): Promise<void> {
    console.log("Starting Token Distribution and Sell process...\n");

    try {
        console.log("\nLoading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'presale_alloc_2.csv');
        if (!fs.existsSync(presaleAllocPath)) {
            throw new Error(`Presale allocation CSV file not found at: ${presaleAllocPath}`);
        }

        const presaleAllocContent = fs.readFileSync(presaleAllocPath, 'utf8');
        const allocations = parsePresaleAllocCSV(presaleAllocContent);
        console.log(`Loaded ${allocations.length} presale allocations`);

        // console.log("\nLoading wallets with ETH...");
        // const ethWalletsPath = path.join(__dirname, '..', 'wallets.csv');
        // if (!fs.existsSync(ethWalletsPath)) {
        //     throw new Error(`ETH wallets CSV file not found at: ${ethWalletsPath}`);
        // }

        // const ethWalletsContent = fs.readFileSync(ethWalletsPath, 'utf8');
        // const ethWallets = parseWalletsCSV(ethWalletsContent);
        // console.log(`Loaded ${ethWallets.length} ETH wallets`);

        await distributeTokens(allocations);

        console.log("\n Process completed successfully!");
    } catch (error: any) {
        console.error("💥 Process failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error("💥 Script failed:", error);
        process.exit(1);
    });
