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

async function main(): Promise<void> {
    console.log("💰 Starting wallet funding process...\n");
    
    // Check if admin private key is set
    if (!process.env.ADMIN_PRIVATE_KEY) {
        console.error("❌ ADMIN_PRIVATE_KEY not found in .env file");
        process.exit(1);
    }
    
    // Read wallets CSV file
    const csvPath = path.join(__dirname, '..', 'wallets.csv');
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ Wallets CSV file not found at: ${csvPath}`);
        process.exit(1);
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const wallets = parseWalletsCSV(csvContent);
    
    console.log(`📊 Found ${wallets.length} wallets to fund`);
    
    // Setup admin wallet
    const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY);
    const provider = ethers.provider;
    const adminSigner = adminWallet.connect(provider);
    
    console.log(`👤 Admin address: ${adminSigner.address}`);
    
    // Check admin balance
    const adminBalance = await provider.getBalance(adminSigner.address);
    const adminBalanceEth = ethers.formatEther(adminBalance);
    console.log(`💳 Admin balance: ${adminBalanceEth} ETH`);
    
    // Calculate total ETH needed
    const fundingAmount = ethers.parseEther("0.0001");
    const totalNeeded = fundingAmount * BigInt(wallets.length);
    const totalNeededEth = ethers.formatEther(totalNeeded);
    
    console.log(`🧮 Total ETH needed: ${totalNeededEth} ETH (${ethers.formatEther(fundingAmount)} ETH per wallet)`);
    
    if (adminBalance < totalNeeded) {
        console.error(`❌ Insufficient admin balance. Need ${totalNeededEth} ETH but have ${adminBalanceEth} ETH`);
        process.exit(1);
    }
    
    console.log("\n🚀 Starting funding process...");
    console.log("═".repeat(80));
    
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        
        try {
            console.log(`📤 [${i + 1}/${wallets.length}] Funding ${wallet.address}...`);
            
            // Check if wallet already has funds
            const currentBalance = await provider.getBalance(wallet.address);
            if (currentBalance > 0n) {
                console.log(`   ⚠️  Wallet already has ${ethers.formatEther(currentBalance)} ETH, skipping...`);
                continue;
            }
            
            const tx = await adminSigner.sendTransaction({
                to: wallet.address,
                value: fundingAmount,
            });
            
            console.log(`   📋 Transaction hash: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt?.status === 1) {
                console.log(`   ✅ Successfully funded! Block: ${receipt.blockNumber}`);
                successCount++;
            } else {
                console.log(`   ❌ Transaction failed`);
                failureCount++;
            }
            
        } catch (error: any) {
            console.log(`   ❌ Error funding wallet: ${error.message}`);
            failureCount++;
        }
        
        // Add a small delay to avoid overwhelming the network
        if (i < wallets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
    }
    
    console.log("\n" + "═".repeat(80));
    console.log("📊 FUNDING SUMMARY");
    console.log("═".repeat(80));
    console.log(`✅ Successfully funded: ${successCount} wallets`);
    console.log(`❌ Failed to fund: ${failureCount} wallets`);
    console.log(`💰 Total ETH sent: ${ethers.formatEther(fundingAmount * BigInt(successCount))} ETH`);
    
    // Final admin balance check
    const finalBalance = await provider.getBalance(adminSigner.address);
    console.log(`💳 Final admin balance: ${ethers.formatEther(finalBalance)} ETH`);
    
    if (failureCount > 0) {
        console.log("\n⚠️  Some wallets failed to fund. Check the logs above for details.");
    } else {
        console.log("\n🎉 All wallets funded successfully!");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error("💥 Script failed:", error);
        process.exit(1);
    });