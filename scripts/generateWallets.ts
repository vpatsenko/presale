import { ethers } from "ethers";
import * as fs from "fs";

interface WalletData {
    address: string;
    mnemonic: string;
    privateKey: string;
}

function generateWallets(count: number): WalletData[] {
    const wallets: WalletData[] = [];

    for (let i = 0; i < count; i++) {
        const wallet = ethers.Wallet.createRandom();

        wallets.push({
            address: wallet.address,
            mnemonic: wallet.mnemonic?.phrase || "",
            privateKey: wallet.privateKey
        });
    }

    return wallets;
}

function saveWalletsToCSV(wallets: WalletData[], filename: string = "wallets.csv"): void {
    const header = "address,mnemonic,private key\n";
    const rows = wallets.map(wallet =>
        `${wallet.address},${wallet.mnemonic},${wallet.privateKey}`
    ).join("\n");

    const csvContent = header + rows;
    fs.writeFileSync(filename, csvContent);
}

async function main(): Promise<void> {
    const walletCount = 20

    console.log(`🔑 Generating ${walletCount} wallets...`);

    const wallets = generateWallets(walletCount);

    saveWalletsToCSV(wallets);

    console.log(`✅ Successfully generated ${walletCount} wallets and saved to wallets.csv`);
    console.log("\nFirst 3 wallets:");
    console.log("═".repeat(80));

    for (let i = 0; i < Math.min(3, wallets.length); i++) {
        const wallet = wallets[i];
        console.log(`${i + 1}. Address: ${wallet.address}`);
        console.log(`   Mnemonic: ${wallet.mnemonic}`);
        console.log(`   Private Key: ${wallet.privateKey}`);
        console.log("");
    }

    if (wallets.length > 3) {
        console.log(`... and ${wallets.length - 3} more wallets saved to wallets.csv`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
