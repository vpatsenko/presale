import * as fs from "fs";
import * as path from "path";

interface Wallet {
    address: string;
    mnemonic: string;
    privateKey: string;
}

interface InsiderAllocation {
    address: string;
    rewards: string;
}

const TOTAL_TOKENS = 4452181; // 4,452,181 tokens (will add 18 decimals later)
const TARGET_ADDRESSES = 180;

function parseWallets(csvContent: string): Wallet[] {
    const lines = csvContent.trim().split('\n');
    const wallets: Wallet[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [address, mnemonic, privateKey] = line.split(',');
        if (address && mnemonic && privateKey) {
            wallets.push({
                address: address.trim(),
                mnemonic: mnemonic.trim(),
                privateKey: privateKey.trim()
            });
        }
    }

    return wallets;
}

function generateRandomDistribution(addresses: string[]): InsiderAllocation[] {
    if (addresses.length !== TARGET_ADDRESSES) {
        throw new Error(`Expected ${TARGET_ADDRESSES} addresses, got ${addresses.length}`);
    }

    const allocations: InsiderAllocation[] = [];
    let remainingTokens = TOTAL_TOKENS;

    for (let i = 0; i < addresses.length - 1; i++) {
        const maxAllocation = Math.floor(remainingTokens / (addresses.length - i));
        const minAllocation = Math.floor(remainingTokens / (addresses.length - i) * 0.1);

        const allocation = Math.floor(Math.random() * (maxAllocation - minAllocation + 1)) + minAllocation;

        // Convert to 18 decimals by adding 18 zeros
        const allocationWith18Decimals = allocation.toString() + "000000000000000000";

        allocations.push({
            address: addresses[i],
            rewards: allocationWith18Decimals
        });

        remainingTokens -= allocation;
    }

    // Convert remaining tokens to 18 decimals
    const remainingWith18Decimals = remainingTokens.toString() + "000000000000000000";

    allocations.push({
        address: addresses[addresses.length - 1],
        rewards: remainingWith18Decimals
    });

    return allocations;
}

function writeInsiderCSV(allocations: InsiderAllocation[], outputPath: string): void {
    const csvContent = ['base_address,rewards'];

    for (const allocation of allocations) {
        csvContent.push(`${allocation.address},${allocation.rewards}`);
    }

    fs.writeFileSync(outputPath, csvContent.join('\n'));
}

async function main(): Promise<void> {
    try {
        console.log("🎲 Generating random insider token distribution...\n");

        const walletsPath = path.join(__dirname, '..', 'wallets.csv');
        console.log("📄 Reading wallets.csv...");

        const csvContent = fs.readFileSync(walletsPath, 'utf-8');
        const wallets = parseWallets(csvContent);

        console.log(`📊 Found ${wallets.length} wallets`);

        if (wallets.length < TARGET_ADDRESSES) {
            throw new Error(`Need at least ${TARGET_ADDRESSES} wallets, found only ${wallets.length}`);
        }

        const selectedAddresses = wallets.slice(0, TARGET_ADDRESSES).map(w => w.address);

        console.log(`🎯 Distributing ${TOTAL_TOKENS} tokens among ${TARGET_ADDRESSES} addresses...`);
        const allocations = generateRandomDistribution(selectedAddresses);

        const totalDistributed = allocations.reduce((sum, alloc) => sum + BigInt(alloc.rewards), BigInt(0));
        const expectedTotal = BigInt(TOTAL_TOKENS.toString() + "000000000000000000");
        console.log(`✅ Total distributed: ${totalDistributed.toString()} wei`);

        if (totalDistributed !== expectedTotal) {
            throw new Error(`Distribution mismatch: ${totalDistributed.toString()} !== ${expectedTotal.toString()}`);
        }

        const outputPath = path.join(__dirname, '..', 'insider.csv');
        writeInsiderCSV(allocations, outputPath);

        console.log(`📝 Saved distribution to insider.csv`);
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
