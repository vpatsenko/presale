import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

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

async function distributeAndSellTokens(allocations: PresaleAllocation[], ethWallets: WalletData[]): Promise<void> {
    console.log(`\nDistributing ROOM tokens from admin wallet and selling immediately for ${allocations.length} addresses...`);
    console.log("═".repeat(80));

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;
    const adminWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);
    console.log(`Admin address: ${adminWallet.address}`);

    const ethWalletMap = new Map<string, WalletData>();
    ethWallets.forEach(wallet => {
        ethWalletMap.set(wallet.address.toLowerCase(), wallet);
    });

    const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)"
    ];

    const UNISWAP_V2_PAIR_ABI = [
        "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external"
    ];

    const roomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, adminWallet);

    const adminBalance = await roomToken.balanceOf(adminWallet.address);
    console.log(`Admin ROOM balance: ${ethers.formatEther(adminBalance)} tokens`);

    const totalNeeded = allocations.reduce((sum, alloc) => sum + BigInt(alloc.amount), 0n);
    console.log(`Total tokens needed: ${ethers.formatEther(totalNeeded)} tokens`);

    if (adminBalance < totalNeeded) {
        throw new Error(`Insufficient admin balance. Have: ${ethers.formatEther(adminBalance)}, Need: ${ethers.formatEther(totalNeeded)}`);
    }

    let distributionSuccessCount = 0;
    let distributionFailureCount = 0;
    let sellSuccessCount = 0;
    let sellFailureCount = 0;
    let sellSkippedCount = 0;
    let totalDistributed = 0n;
    let totalRoomsSold = 0n;
    let totalVirtualsReceived = 0n;

    for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];
        const amount = BigInt(allocation.amount);
        const walletData = ethWalletMap.get(allocation.address.toLowerCase());

        try {
            console.log(`[${i + 1}/${allocations.length}] Sending ${ethers.formatEther(amount)} ROOM to ${allocation.address}...`);

            const tx = await roomToken.transfer(allocation.address, amount);
            console.log(`  📤 Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                console.log(`  ✅ Successfully sent! Block: ${receipt.blockNumber}`);
                distributionSuccessCount++;
                totalDistributed = totalDistributed + amount;

                if (walletData) {
                    console.log(`  💰 Selling tokens immediately for ${allocation.address}...`);

                    try {
                        const walletSigner = new ethers.Wallet(walletData.privateKey).connect(provider);

                        const userRoomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, walletSigner);
                        const virtualToken = new ethers.Contract(VIRTUAL_TOKEN_ADDRESS, ERC20_ABI, walletSigner);
                        const uniswapPair = new ethers.Contract(UNISWAP_V2_PAIR_ADDRESS, UNISWAP_V2_PAIR_ABI, walletSigner);

                        const virtualBalanceBefore = await virtualToken.balanceOf(allocation.address);

                        const token0 = await uniswapPair.token0();
                        const isRoomToken0 = token0.toLowerCase() === ROOM_TOKEN_ADDRESS.toLowerCase();
                        // Check allowance and approve if needed
                        const currentAllowance = await userRoomToken.allowance(allocation.address, UNISWAP_V2_PAIR_ADDRESS);

                        if (currentAllowance < amount) {
                            const approveTx = await userRoomToken.approve(UNISWAP_V2_PAIR_ADDRESS, amount);
                            await approveTx.wait();
                        }

                        // Get current reserves
                        const currentReserves = await uniswapPair.getReserves();
                        const roomReserveBefore = isRoomToken0 ? currentReserves.reserve0 : currentReserves.reserve1;
                        const virtualReserveBefore = isRoomToken0 ? currentReserves.reserve1 : currentReserves.reserve0;

                        // Calculate expected output using constant product formula
                        const amountInWithFee = amount * 997n;
                        const numerator = amountInWithFee * virtualReserveBefore;
                        const denominator = roomReserveBefore * 1000n + amountInWithFee;
                        const expectedVirtual = numerator / denominator;

                        console.log(`    📈 Expected VIRTUAL output: ${ethers.formatEther(expectedVirtual)} tokens`);

                        if (expectedVirtual > 0n) {
                            // Transfer tokens to pair
                            console.log(`    🔄 Transferring ROOM tokens to pair...`);
                            const transferTx = await userRoomToken.transfer(UNISWAP_V2_PAIR_ADDRESS, amount);
                            await transferTx.wait();

                            // Add 1% slippage buffer
                            const outputWithSlippage = (expectedVirtual * 99n) / 100n;

                            // Execute swap
                            const amount0Out = isRoomToken0 ? 0n : outputWithSlippage;
                            const amount1Out = isRoomToken0 ? outputWithSlippage : 0n;

                            console.log(`    🔄 Executing swap...`);
                            const swapTx = await uniswapPair.swap(amount0Out, amount1Out, allocation.address, "0x");

                            const swapReceipt = await swapTx.wait();
                            if (swapReceipt?.status === 1) {
                                const virtualBalanceAfter = await virtualToken.balanceOf(allocation.address);
                                const virtualReceived = virtualBalanceAfter - virtualBalanceBefore;

                                console.log(`    ✅ Swap successful! Received ${ethers.formatEther(virtualReceived)} VIRTUAL tokens`);
                                sellSuccessCount++;
                                totalRoomsSold = totalRoomsSold + amount;
                                totalVirtualsReceived = totalVirtualsReceived + BigInt(virtualReceived);
                            } else {
                                console.log(`    ❌ Swap transaction failed`);
                                sellFailureCount++;
                            }
                        } else {
                            console.log(`    ❌ No output expected, skipping swap`);
                            sellFailureCount++;
                        }

                    } catch (sellError: any) {
                        console.log(`    ❌ Error selling tokens: ${sellError.message}`);
                        sellFailureCount++;
                    }
                } else {
                    console.log(`  ⚠️  Address not in ETH wallets list, skipping sale`);
                    sellSkippedCount++;
                }
            } else {
                console.log(`  ❌ Distribution transaction failed`);
                distributionFailureCount++;
            }

        } catch (error: any) {
            console.log(`  ❌ Error sending tokens: ${error.message}`);
            distributionFailureCount++;
        }

        if (i < allocations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay for safety
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("DISTRIBUTION & SELLING SUMMARY");
    console.log("═".repeat(80));
    console.log("DISTRIBUTION:");
    console.log(`  ✅ Successfully distributed: ${distributionSuccessCount} addresses`);
    console.log(`  ❌ Failed to distribute: ${distributionFailureCount} addresses`);
    console.log(`  💎 Total ROOM tokens distributed: ${ethers.formatEther(totalDistributed)} tokens`);
    console.log("\nSELLING:");
    console.log(`  ✅ Successfully sold: ${sellSuccessCount} addresses`);
    console.log(`  ❌ Failed to sell: ${sellFailureCount} addresses`);
    console.log(`  ⚠️  Skipped (not in ETH wallets): ${sellSkippedCount} addresses`);
    console.log(`  💎 Total ROOM tokens sold: ${ethers.formatEther(totalRoomsSold)} tokens`);
    console.log(`  💰 Total VIRTUAL tokens received: ${ethers.formatEther(totalVirtualsReceived)} tokens`);
    console.log(`\n📋 Total processed: ${allocations.length} addresses`);

    if (distributionFailureCount > 0) {
        throw new Error(`Failed to distribute to ${distributionFailureCount} addresses. Cannot proceed.`);
    }

    console.log("\n🎉 Distribution and selling process completed!");
}


async function main(): Promise<void> {
    console.log("Starting Token Distribution and Sell process...\n");

    try {
        console.log("\nLoading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'presale_alloc.csv');
        if (!fs.existsSync(presaleAllocPath)) {
            throw new Error(`Presale allocation CSV file not found at: ${presaleAllocPath}`);
        }

        const presaleAllocContent = fs.readFileSync(presaleAllocPath, 'utf8');
        const allocations = parsePresaleAllocCSV(presaleAllocContent);
        console.log(`Loaded ${allocations.length} presale allocations`);

        console.log("\nLoading wallets with ETH...");
        const ethWalletsPath = path.join(__dirname, '..', 'wallets_with_ETH.csv');
        if (!fs.existsSync(ethWalletsPath)) {
            throw new Error(`ETH wallets CSV file not found at: ${ethWalletsPath}`);
        }

        const ethWalletsContent = fs.readFileSync(ethWalletsPath, 'utf8');
        const ethWallets = parseWalletsCSV(ethWalletsContent);
        console.log(`Loaded ${ethWallets.length} ETH wallets`);

        await distributeAndSellTokens(allocations, ethWallets);

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
