import * as fs from "fs";
import * as path from "path";

interface PresaleAllocation {
    address: string;
    amount: string;
}

interface DistributedAddress {
    address: string;
    amount: string;
    txHash: string;
    blockNumber: number;
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

function parseDistributedCSV(csvContent: string): DistributedAddress[] {
    const lines = csvContent.trim().split('\n');
    const distributed: DistributedAddress[] = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [address, amount, txHash, blockNumber] = line.split(',');
            if (address && amount && txHash && blockNumber) {
                distributed.push({
                    address: address.trim(),
                    amount: amount.trim(),
                    txHash: txHash.trim(),
                    blockNumber: parseInt(blockNumber.trim())
                });
            }
        }
    }

    return distributed;
}

async function findUndistributedAddresses(): Promise<void> {
    console.log("Finding undistributed addresses...\n");
    console.log("═".repeat(80));

    try {
        // Load presale allocations
        console.log("Loading presale allocations...");
        const presaleAllocPath = path.join(__dirname, '..', 'presale_alloc.csv');
        if (!fs.existsSync(presaleAllocPath)) {
            throw new Error(`Presale allocation CSV file not found at: ${presaleAllocPath}`);
        }

        const presaleAllocContent = fs.readFileSync(presaleAllocPath, 'utf8');
        const allocations = parsePresaleAllocCSV(presaleAllocContent);
        console.log(`✅ Loaded ${allocations.length} presale allocations`);

        // Load distributed addresses
        console.log("\nLoading distributed addresses...");
        const distributedPath = path.join(__dirname, '..', 'distributed_addresses.csv');
        if (!fs.existsSync(distributedPath)) {
            throw new Error(`Distributed addresses CSV file not found at: ${distributedPath}`);
        }

        const distributedContent = fs.readFileSync(distributedPath, 'utf8');
        const distributed = parseDistributedCSV(distributedContent);
        console.log(`✅ Loaded ${distributed.length} distributed addresses`);

        // Create a set of distributed addresses for faster lookup
        const distributedAddressSet = new Set(
            distributed.map(d => d.address.toLowerCase())
        );

        // Find undistributed addresses
        const undistributed: PresaleAllocation[] = [];
        
        for (const allocation of allocations) {
            if (!distributedAddressSet.has(allocation.address.toLowerCase())) {
                undistributed.push(allocation);
            }
        }

        console.log(`\n📊 Analysis Results:`);
        console.log(`   Total presale allocations: ${allocations.length}`);
        console.log(`   Successfully distributed: ${distributed.length}`);
        console.log(`   Undistributed addresses: ${undistributed.length}`);

        if (undistributed.length > 0) {
            // Generate CSV content for undistributed addresses
            const csvHeader = "address,alloc_in_rooms\n";
            const csvRows = undistributed.map(item => 
                `${item.address},${item.amount}`
            ).join('\n');
            
            const csvContent = csvHeader + csvRows;

            // Write to file
            const outputPath = path.join(__dirname, '..', 'undistributed_addresses.csv');
            fs.writeFileSync(outputPath, csvContent, 'utf8');

            console.log(`\n📁 Undistributed addresses saved to: ${outputPath}`);
            
            // Calculate total undistributed amount
            const totalUndistributed = undistributed.reduce((sum, item) => {
                return sum + parseFloat(item.amount) / 1e18; // Convert from wei to tokens
            }, 0);
            
            console.log(`💎 Total undistributed ROOM tokens: ${totalUndistributed.toFixed(6)} tokens`);

            console.log(`\n⚠️  Found ${undistributed.length} addresses that were not distributed to:`);
            undistributed.slice(0, 10).forEach((item, index) => {
                const amount = (parseFloat(item.amount) / 1e18).toFixed(6);
                console.log(`   ${index + 1}. ${item.address} - ${amount} ROOM`);
            });
            
            if (undistributed.length > 10) {
                console.log(`   ... and ${undistributed.length - 10} more addresses`);
            }
        } else {
            console.log(`\n✅ All presale allocations have been successfully distributed!`);
        }

        console.log("\n🎉 Analysis completed!");

    } catch (error: any) {
        console.error("💥 Process failed:", error.message);
        process.exit(1);
    }
}

async function main(): Promise<void> {
    console.log("Starting Undistributed Addresses Analysis...\n");

    try {
        await findUndistributedAddresses();
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