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

const MERKLE_DISTRIBUTOR_ADDRESS = "0xc08392d15c6efafa126364b0ddd4c18b82a1369e";
const NEW_MERKLE_ROOT = "0xe410724baa4bcc0e8868d198337db02ef31f3c026568ac4c617970725926d866";

// Uniswap V2 trading constants
const UNISWAP_V2_PAIR_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";
const ROOM_TOKEN_ADDRESS = "0x6555255b8dEd3c538Cb398d9E36769f45D7d3ea7";
const VIRTUAL_TOKEN_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const UNISWAP_V2_ROUTER_ADDRESS = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24"; // Base network Uniswap V2 Router

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

async function distributeTokensFromAdmin(allocations: PresaleAllocation[]): Promise<void> {
    console.log(`\nDistributing ROOM tokens from admin wallet to ${allocations.length} addresses...`);
    console.log("═".repeat(80));

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;
    const adminWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);

    console.log(`Admin address: ${adminWallet.address}`);

    const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
    ];

    const roomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, adminWallet);

    const adminBalance = await roomToken.balanceOf(adminWallet.address);
    console.log(`💰 Admin ROOM balance: ${ethers.formatEther(adminBalance)} tokens`);

    // Calculate total tokens needed
    const totalNeeded = allocations.reduce((sum, alloc) => sum + BigInt(alloc.amount), 0n);
    console.log(`📊 Total tokens needed: ${ethers.formatEther(totalNeeded)} tokens`);

    if (adminBalance < totalNeeded) {
        throw new Error(`Insufficient admin balance. Have: ${ethers.formatEther(adminBalance)}, Need: ${ethers.formatEther(totalNeeded)}`);
    }

    let successCount = 0;
    let failureCount = 0;
    let totalDistributed = 0n;

    for (let i = 0; i < allocations.length; i++) {
        const allocation = allocations[i];
        const amount = BigInt(allocation.amount);

        try {
            console.log(`💸 [${i + 1}/${allocations.length}] Sending ${ethers.formatEther(amount)} ROOM to ${allocation.address}...`);

            const tx = await roomToken.transfer(allocation.address, amount);
            console.log(`   📤 Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                console.log(`   ✅ Successfully sent! Block: ${receipt.blockNumber}`);
                successCount++;
                totalDistributed = totalDistributed + amount;
            } else {
                console.log(`   ❌ Transaction failed`);
                failureCount++;
            }

        } catch (error: any) {
            console.log(`   ❌ Error sending tokens: ${error.message}`);
            failureCount++;
        }

        // Add delay to avoid overwhelming the network
        if (i < allocations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("DISTRIBUTION SUMMARY");
    console.log("═".repeat(80));
    console.log(`Successfully distributed: ${successCount} addresses`);
    console.log(`Failed to distribute: ${failureCount} addresses`);
    console.log(`Total ROOM tokens distributed: ${ethers.formatEther(totalDistributed)} tokens`);
    console.log(`Total processed: ${allocations.length} addresses`);

    if (failureCount > 0) {
        throw new Error(`Failed to distribute to ${failureCount} addresses. Cannot proceed.`);
    }

    console.log("\nAll tokens distributed successfully!");
}

async function sellRoomTokensForVirtuals(allocations: PresaleAllocation[], ethWallets: WalletData[]): Promise<void> {
    // Create a map of addresses from ethWallets for quick lookup
    const ethWalletMap = new Map<string, WalletData>();
    ethWallets.forEach(wallet => {
        ethWalletMap.set(wallet.address.toLowerCase(), wallet);
    });

    // Filter allocations to only those that exist in ethWallets
    const sellableAllocations = allocations.filter(alloc =>
        ethWalletMap.has(alloc.address.toLowerCase())
    );

    console.log(`\n💰 Selling ROOM tokens for VIRTUAL tokens on ${sellableAllocations.length} addresses...`);
    console.log("═".repeat(80));

    const provider = ethers.provider;

    // ERC20 ABI for token operations
    const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transfer(address to, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)"
    ];

    // Uniswap V2 Router ABI
    const UNISWAP_V2_ROUTER_ABI = [
        "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)"
    ];

    // Uniswap V2 Pair ABI
    const UNISWAP_V2_PAIR_ABI = [
        "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external"
    ];

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let totalRoomsSold = 0n;
    let totalVirtualsReceived = 0n;

    for (let i = 0; i < sellableAllocations.length; i++) {
        const allocation = sellableAllocations[i];
        const wallet = ethWalletMap.get(allocation.address.toLowerCase())!;

        try {
            console.log(`💰 [${i + 1}/${sellableAllocations.length}] Selling ROOM tokens for ${wallet.address}...`);

            // Create wallet signer from private key
            const walletSigner = new ethers.Wallet(wallet.privateKey).connect(provider);

            // Connect to contracts
            const roomToken = new ethers.Contract(ROOM_TOKEN_ADDRESS, ERC20_ABI, walletSigner);
            const virtualToken = new ethers.Contract(VIRTUAL_TOKEN_ADDRESS, ERC20_ABI, walletSigner);
            const uniswapPair = new ethers.Contract(UNISWAP_V2_PAIR_ADDRESS, UNISWAP_V2_PAIR_ABI, walletSigner);

            // Check ROOM token balance
            const roomBalance = await roomToken.balanceOf(wallet.address);
            if (roomBalance === 0n) {
                console.log(`   ⚠️  No ROOM tokens to sell, skipping...`);
                skippedCount++;
                continue;
            }

            const roomBalanceFormatted = ethers.formatEther(roomBalance);
            console.log(`   💎 ROOM balance: ${roomBalanceFormatted} tokens`);

            // Check Virtual balance before trade
            const virtualBalanceBefore = await virtualToken.balanceOf(wallet.address);

            // Get pair information (only need to do this once)
            const token0 = await uniswapPair.token0();
            const token1 = await uniswapPair.token1();
            const isRoomToken0 = token0.toLowerCase() === ROOM_TOKEN_ADDRESS.toLowerCase();

            console.log(`   🔍 Pair info - Token0: ${token0}, Token1: ${token1}`);
            console.log(`   💎 ROOM is token${isRoomToken0 ? '0' : '1'}, VIRTUAL is token${isRoomToken0 ? '1' : '0'}`);

            // Check allowance and approve if needed
            const currentAllowance = await roomToken.allowance(wallet.address, UNISWAP_V2_PAIR_ADDRESS);

            if (currentAllowance < roomBalance) {
                console.log(`   📝 Approving ROOM tokens for pair...`);
                const approveTx = await roomToken.approve(UNISWAP_V2_PAIR_ADDRESS, roomBalance);
                await approveTx.wait();
                console.log(`   ✅ Approval successful`);
            }

            try {
                // Get CURRENT reserves before transfer
                const currentReserves = await uniswapPair.getReserves();
                const roomReserveBefore = isRoomToken0 ? currentReserves.reserve0 : currentReserves.reserve1;
                const virtualReserveBefore = isRoomToken0 ? currentReserves.reserve1 : currentReserves.reserve0;

                console.log(`   📊 Current Reserves - ROOM: ${ethers.formatEther(roomReserveBefore)}, VIRTUAL: ${ethers.formatEther(virtualReserveBefore)}`);

                // Calculate expected output using constant product formula BEFORE transfer
                // amountOut = (amountIn * reserveOut * 997) / (reserveIn * 1000 + amountIn * 997)
                const amountInWithFee = roomBalance * 997n;
                const numerator = amountInWithFee * virtualReserveBefore;
                const denominator = roomReserveBefore * 1000n + amountInWithFee;
                const expectedVirtual = numerator / denominator;

                const expectedVirtualFormatted = ethers.formatEther(expectedVirtual);
                console.log(`   📈 Expected VIRTUAL output: ${expectedVirtualFormatted} tokens`);

                if (expectedVirtual === 0n) {
                    console.log(`   ❌ No output expected, skipping swap`);
                    failureCount++;
                    continue;
                }

                // Transfer tokens to pair
                console.log(`   🔄 Transferring ROOM tokens to pair...`);
                const transferTx = await roomToken.transfer(UNISWAP_V2_PAIR_ADDRESS, roomBalance);
                await transferTx.wait();
                console.log(`   ✅ Transfer successful`);

                // Add 1% slippage buffer to be safe
                const outputWithSlippage = (expectedVirtual * 99n) / 100n;

                // Execute swap - ROOM is token1, VIRTUAL is token0
                const amount0Out = isRoomToken0 ? 0n : outputWithSlippage; // VIRTUAL output
                const amount1Out = isRoomToken0 ? outputWithSlippage : 0n; // ROOM output (should be 0)

                console.log(`   🔄 Executing swap with slippage protection...`);
                console.log(`   📋 Swap params - amount0Out: ${ethers.formatEther(amount0Out)}, amount1Out: ${ethers.formatEther(amount1Out)}`);

                const swapTx = await uniswapPair.swap(amount0Out, amount1Out, wallet.address, "0x");

                console.log(`   📤 Swap transaction hash: ${swapTx.hash}`);

                const receipt = await swapTx.wait();
                if (receipt?.status === 1) {
                    // Check Virtual balance after trade
                    const virtualBalanceAfter = await virtualToken.balanceOf(wallet.address);
                    const virtualReceived = virtualBalanceAfter - virtualBalanceBefore;
                    const virtualReceivedFormatted = ethers.formatEther(virtualReceived);

                    console.log(`   ✅ Swap successful! Received ${virtualReceivedFormatted} VIRTUAL tokens`);
                    console.log(`   🎯 Block: ${receipt.blockNumber}`);

                    successCount++;
                    totalRoomsSold = totalRoomsSold + roomBalance;
                    totalVirtualsReceived = totalVirtualsReceived + virtualReceived;

                    // Wait a bit longer after successful swaps to let the network settle
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    console.log(`   ❌ Swap transaction failed`);
                    failureCount++;
                }

            } catch (swapError: any) {
                console.log(`   ❌ Error executing swap: ${swapError.message}`);
                failureCount++;
            }

        } catch (error: any) {
            console.log(`   ❌ Error selling tokens: ${error.message}`);
            failureCount++;
        }

        // Add delay to avoid overwhelming the network
        if (i < sellableAllocations.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("SELLING SUMMARY");
    console.log("═".repeat(80));
    console.log(` Successfully sold: ${successCount} wallets`);
    console.log(`️  Skipped (no tokens): ${skippedCount} wallets`);
    console.log(` Failed to sell: ${failureCount} wallets`);
    console.log(` Total ROOM tokens sold: ${ethers.formatEther(totalRoomsSold)} tokens`);
    console.log(` Total VIRTUAL tokens received: ${ethers.formatEther(totalVirtualsReceived)} tokens`);
    console.log(` Total processed: ${sellableAllocations.length} addresses`);

    if (failureCount > 0) {
        console.log("\n⚠️  Some sales failed. Check the logs above for details.");
    } else if (successCount > 0) {
        console.log("\n🎉 All tokens sold successfully!");
    } else {
        console.log("\n📋 No tokens were sold.");
    }
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

        await distributeTokensFromAdmin(allocations);
        await sellRoomTokensForVirtuals(allocations, ethWallets);

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
