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

function loadMerkleProofs(filePath: string): MerkleProof[] {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Merkle proofs file not found at: ${filePath}`);
    }

    const proofData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return proofData as MerkleProof[];
}

async function transferETHToMnemonicWallet(): Promise<void> {
    console.log("💰 Transferring 10 ETH to mnemonic wallet...");

    if (!process.env.ADMIN_PRIVATE_KEY || !process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_PRIVATE_KEY or ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;

    // Setup admin wallet (from private key)
    const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY).connect(provider);

    // Setup mnemonic wallet (destination)
    const mnemonicWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);

    console.log(`👤 Admin (sender): ${adminWallet.address}`);
    console.log(`👤 Mnemonic (receiver): ${mnemonicWallet.address}`);

    // Check admin balance
    const adminBalance = await provider.getBalance(adminWallet.address);
    const transferAmount = ethers.parseEther("10");

    console.log(`💳 Admin balance: ${ethers.formatEther(adminBalance)} ETH`);
    console.log(`💸 Transfer amount: ${ethers.formatEther(transferAmount)} ETH`);

    if (adminBalance < transferAmount) {
        throw new Error(`Insufficient admin balance. Need ${ethers.formatEther(transferAmount)} ETH but have ${ethers.formatEther(adminBalance)} ETH`);
    }

    // Check current mnemonic wallet balance
    const currentMnemonicBalance = await provider.getBalance(mnemonicWallet.address);
    console.log(`💳 Current mnemonic balance: ${ethers.formatEther(currentMnemonicBalance)} ETH`);

    // Transfer ETH
    const tx = await adminWallet.sendTransaction({
        to: mnemonicWallet.address,
        value: transferAmount,
    });

    console.log(`📤 Transfer transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt?.status === 1) {
        const newBalance = await provider.getBalance(mnemonicWallet.address);
        console.log(`✅ Transfer successful! New mnemonic balance: ${ethers.formatEther(newBalance)} ETH`);
        console.log(`   Block: ${receipt.blockNumber}`);
    } else {
        throw new Error("ETH transfer failed");
    }
}

async function distributeETHToWallets(wallets: WalletData[]): Promise<void> {
    console.log(`\n💸 Distributing 0.001 ETH to ${wallets.length} wallets...`);
    console.log("═".repeat(80));

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    const provider = ethers.provider;
    const mnemonicWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);

    const distributionAmount = ethers.parseEther("0.001");
    const totalNeeded = distributionAmount * BigInt(wallets.length);

    console.log(`💳 Mnemonic wallet: ${mnemonicWallet.address}`);
    console.log(`💰 Amount per wallet: ${ethers.formatEther(distributionAmount)} ETH`);
    console.log(`🧮 Total ETH needed: ${ethers.formatEther(totalNeeded)} ETH`);

    // Check balance
    const mnemonicBalance = await provider.getBalance(mnemonicWallet.address);
    console.log(`💳 Available balance: ${ethers.formatEther(mnemonicBalance)} ETH`);

    if (mnemonicBalance < totalNeeded) {
        throw new Error(`Insufficient mnemonic balance. Need ${ethers.formatEther(totalNeeded)} ETH but have ${ethers.formatEther(mnemonicBalance)} ETH`);
    }

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];

        try {
            console.log(`💸 [${i + 1}/${wallets.length}] Sending ETH to ${wallet.address}...`);

            // Check if wallet already has sufficient funds
            const currentBalance = await provider.getBalance(wallet.address);
            if (currentBalance >= distributionAmount) {
                console.log(`   ⚠️  Wallet already has ${ethers.formatEther(currentBalance)} ETH, skipping...`);
                successCount++; // Count as success since wallet has funds
                continue;
            }

            const tx = await mnemonicWallet.sendTransaction({
                to: wallet.address,
                value: distributionAmount,
            });

            console.log(`   📤 Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                console.log(`   ✅ Successfully sent ${ethers.formatEther(distributionAmount)} ETH! Block: ${receipt.blockNumber}`);
                successCount++;
            } else {
                console.log(`   ❌ Transaction failed`);
                failureCount++;
            }

        } catch (error: any) {
            console.log(`   ❌ Error sending ETH: ${error.message}`);
            failureCount++;
        }

        // Add delay to avoid overwhelming the network
        if (i < wallets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("📊 ETH DISTRIBUTION SUMMARY");
    console.log("═".repeat(80));
    console.log(`✅ Successfully funded: ${successCount} wallets`);
    console.log(`❌ Failed to fund: ${failureCount} wallets`);
    console.log(`💰 Total ETH distributed: ${ethers.formatEther(distributionAmount * BigInt(successCount))} ETH`);

    if (failureCount > 0) {
        throw new Error(`Failed to fund ${failureCount} wallets. Cannot proceed with claims.`);
    }

    console.log("\n🎉 All wallets funded successfully!");
}

async function updateMerkleRoot(): Promise<void> {
    console.log("🔄 Updating merkle root...");

    if (!process.env.ADMIN_MNEMONIC) {
        throw new Error("ADMIN_MNEMONIC not found in .env file");
    }

    // Setup admin wallet (use mnemonic wallet as it's the contract owner)
    const provider = ethers.provider;
    const adminWallet = ethers.Wallet.fromPhrase(process.env.ADMIN_MNEMONIC).connect(provider);

    console.log(`👤 Admin address (owner): ${adminWallet.address}`);

    // Connect to the merkle distributor contract
    const MerkleTreeDistributorFactory = await ethers.getContractFactory("MerkleTreeDistributor");
    const merkleDistributor = MerkleTreeDistributorFactory.attach(MERKLE_DISTRIBUTOR_ADDRESS).connect(adminWallet) as any;

    // Check current merkle root
    const currentRoot = await merkleDistributor.merkleRoot();
    console.log(`📋 Current merkle root: ${currentRoot}`);
    console.log(`📋 New merkle root: ${NEW_MERKLE_ROOT}`);

    if (currentRoot.toLowerCase() === NEW_MERKLE_ROOT.toLowerCase()) {
        console.log("✅ Merkle root is already set to the target value");
        return;
    }

    // Update the merkle root
    console.log("🔄 Updating merkle root...");
    const tx = await merkleDistributor.changeRoot(NEW_MERKLE_ROOT);
    console.log(`📤 Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt?.status === 1) {
        console.log(`✅ Merkle root updated successfully! Block: ${receipt.blockNumber}`);
    } else {
        throw new Error("Failed to update merkle root");
    }
}

async function claimTokensForWallets(wallets: WalletData[], merkleProofs: MerkleProof[]): Promise<void> {
    console.log(`\n🎯 Starting token claims for ${wallets.length} wallets...`);
    console.log("═".repeat(80));

    // Create a map of address to proof for quick lookup
    const proofMap = new Map<string, MerkleProof>();
    merkleProofs.forEach(proof => {
        proofMap.set(proof.address.toLowerCase(), proof);
    });

    const provider = ethers.provider;
    const MerkleTreeDistributorFactory = await ethers.getContractFactory("MerkleTreeDistributor");

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const proof = proofMap.get(wallet.address.toLowerCase());

        if (!proof) {
            console.log(`⚠️  [${i + 1}/${wallets.length}] No proof found for ${wallet.address}, skipping...`);
            skippedCount++;
            continue;
        }

        try {
            console.log(`🎯 [${i + 1}/${wallets.length}] Claiming for ${wallet.address}...`);

            // Create wallet signer from private key
            const walletSigner = new ethers.Wallet(wallet.privateKey).connect(provider);
            const merkleDistributor = MerkleTreeDistributorFactory.attach(MERKLE_DISTRIBUTOR_ADDRESS).connect(walletSigner) as any;

            // Check if already claimed
            const alreadyClaimed = await merkleDistributor.isClaimed(wallet.address);
            if (alreadyClaimed) {
                console.log(`   📋 Already claimed, skipping...`);
                skippedCount++;
                continue;
            }

            // Perform the claim
            const tx = await merkleDistributor.claim(
                wallet.address,
                proof.amount,
                proof.proof
            );

            console.log(`   📤 Transaction hash: ${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                const tokenAmount = ethers.formatEther(proof.amount);
                console.log(`   ✅ Successfully claimed ${tokenAmount} tokens! Block: ${receipt.blockNumber}`);
                successCount++;
            } else {
                console.log(`   ❌ Transaction failed`);
                failureCount++;
            }

        } catch (error: any) {
            console.log(`   ❌ Error claiming tokens: ${error.message}`);
            failureCount++;
        }

        // Add a small delay to avoid overwhelming the network
        if (i < wallets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("📊 CLAIMING SUMMARY");
    console.log("═".repeat(80));
    console.log(`✅ Successfully claimed: ${successCount} wallets`);
    console.log(`⚠️  Skipped (already claimed/no proof): ${skippedCount} wallets`);
    console.log(`❌ Failed to claim: ${failureCount} wallets`);
    console.log(`🎯 Total processed: ${wallets.length} wallets`);

    if (failureCount > 0) {
        console.log("\n⚠️  Some claims failed. Check the logs above for details.");
    } else if (successCount > 0) {
        console.log("\n🎉 All eligible wallets claimed successfully!");
    } else {
        console.log("\n📋 No new claims were made.");
    }
}

async function sellRoomTokensForVirtuals(wallets: WalletData[]): Promise<void> {
    console.log(`\n💰 Selling ROOM tokens for VIRTUAL tokens on ${wallets.length} wallets...`);
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

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];

        try {
            console.log(`💰 [${i + 1}/${wallets.length}] Selling ROOM tokens for ${wallet.address}...`);

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
                    totalRoomsSold += roomBalance;
                    totalVirtualsReceived += virtualReceived;

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
        if (i < wallets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
    }

    console.log("\n" + "═".repeat(80));
    console.log("📊 SELLING SUMMARY");
    console.log("═".repeat(80));
    console.log(`✅ Successfully sold: ${successCount} wallets`);
    console.log(`⚠️  Skipped (no tokens): ${skippedCount} wallets`);
    console.log(`❌ Failed to sell: ${failureCount} wallets`);
    console.log(`💎 Total ROOM tokens sold: ${ethers.formatEther(totalRoomsSold)} tokens`);
    console.log(`💰 Total VIRTUAL tokens received: ${ethers.formatEther(totalVirtualsReceived)} tokens`);
    console.log(`🎯 Total processed: ${wallets.length} wallets`);

    if (failureCount > 0) {
        console.log("\n⚠️  Some sales failed. Check the logs above for details.");
    } else if (successCount > 0) {
        console.log("\n🎉 All tokens sold successfully!");
    } else {
        console.log("\n📋 No tokens were sold.");
    }
}

async function main(): Promise<void> {
    console.log("🚀 Starting Claim and Sell process...\n");

    try {
        // Step 1: Transfer ETH to mnemonic wallet
        await transferETHToMnemonicWallet();

        // Step 2: Load wallets and proofs
        console.log("\n📂 Loading wallets and merkle proofs...");

        const csvPath = path.join(__dirname, '..', 'wallets.csv');
        if (!fs.existsSync(csvPath)) {
            throw new Error(`Wallets CSV file not found at: ${csvPath}`);
        }

        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const wallets = parseWalletsCSV(csvContent);
        console.log(`📊 Loaded ${wallets.length} wallets from CSV`);

        const proofsPath = path.join(__dirname, '..', 'merkle_proofs.json');
        const merkleProofs = loadMerkleProofs(proofsPath);
        console.log(`🔑 Loaded ${merkleProofs.length} merkle proofs`);

        // Step 3: Distribute ETH to all wallets
        await distributeETHToWallets(wallets);

        // Step 4: Update merkle root
        await updateMerkleRoot();

        // Step 5: Claim tokens for all wallets
        await claimTokensForWallets(wallets, merkleProofs);

        // Step 6: Sell ROOM tokens for VIRTUAL tokens
        await sellRoomTokensForVirtuals(wallets);

        console.log("\n🎊 Process completed successfully!");

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
