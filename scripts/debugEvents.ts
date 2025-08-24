import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const POOL_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";

async function debugEvents(): Promise<void> {
    console.log("Debugging events...");
    
    const provider = ethers.provider;
    
    try {
        // Get current block and search recent blocks
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 10000; // Last 10k blocks
        
        console.log(`Searching blocks ${fromBlock} to ${currentBlock}`);
        
        // Search for ALL events from this contract
        const allLogs = await provider.getLogs({
            address: POOL_ADDRESS,
            fromBlock: fromBlock,
            toBlock: currentBlock
        });
        
        console.log(`Found ${allLogs.length} total events`);
        
        if (allLogs.length > 0) {
            // Show first few events
            for (let i = 0; i < Math.min(5, allLogs.length); i++) {
                const log = allLogs[i];
                console.log(`\nEvent ${i + 1}:`);
                console.log(`  Block: ${log.blockNumber}`);
                console.log(`  Topic 0 (event signature): ${log.topics[0]}`);
                console.log(`  Topics: ${log.topics.length} topics`);
                console.log(`  Data length: ${log.data.length} chars`);
                
                // Try to decode if it looks like a Swap event
                const swapSignature = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"; // Swap event hash
                if (log.topics[0] === swapSignature) {
                    console.log(`  ✅ This is a Swap event!`);
                    
                    try {
                        // Manual decode
                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
                            ["uint256", "uint256", "uint256", "uint256"],
                            log.data
                        );
                        console.log(`  Amount0In: ${decoded[0].toString()}`);
                        console.log(`  Amount1In: ${decoded[1].toString()}`);
                        console.log(`  Amount0Out: ${decoded[2].toString()}`);
                        console.log(`  Amount1Out: ${decoded[3].toString()}`);
                        console.log(`  Sender: ${log.topics[1]}`);
                        console.log(`  To: ${log.topics[2]}`);
                    } catch (e) {
                        console.log(`  Error decoding: ${e}`);
                    }
                }
            }
        }
        
        // Calculate the Swap event topic hash
        const swapEventHash = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)");
        console.log(`\nSwap event hash: ${swapEventHash}`);
        
        // Search specifically for Swap events using topic filter
        const swapLogs = await provider.getLogs({
            address: POOL_ADDRESS,
            fromBlock: fromBlock,
            toBlock: currentBlock,
            topics: [swapEventHash]
        });
        
        console.log(`Found ${swapLogs.length} Swap events specifically`);
        
    } catch (error) {
        console.error("Error:", error);
    }
}

async function main() {
    try {
        await debugEvents();
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}