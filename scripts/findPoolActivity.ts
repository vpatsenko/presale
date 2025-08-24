import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const UNISWAP_V2_POOL_ABI = [
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
    "event Transfer(address indexed from, address indexed to, uint value)"
];

const POOL_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";

async function findPoolActivity(): Promise<void> {
    console.log("Finding pool creation and first activity...");
    
    const provider = ethers.provider;
    const poolContract = new ethers.Contract(POOL_ADDRESS, UNISWAP_V2_POOL_ABI, provider);
    
    try {
        // Try to find pool creation by looking for first Transfer event (minting LP tokens)
        console.log("Looking for pool creation...");
        
        // Search in chunks starting from a much later date
        let startBlock = 17000000; // Start from a later block
        let endBlock = 18000000;
        let firstSwap: any = null;
        
        while (startBlock < await provider.getBlockNumber() && !firstSwap) {
            console.log(`Searching blocks ${startBlock} to ${endBlock}...`);
            
            try {
                const filter = poolContract.filters.Swap();
                const events = await poolContract.queryFilter(filter, startBlock, endBlock);
                
                if (events.length > 0) {
                    firstSwap = events[0];
                    const block = await provider.getBlock(firstSwap.blockNumber);
                    console.log(`\n🎉 Found first swap!`);
                    console.log(`Block: ${firstSwap.blockNumber}`);
                    console.log(`Date: ${new Date(block!.timestamp * 1000).toISOString()}`);
                    console.log(`Transaction: ${firstSwap.transactionHash}`);
                    
                    // Find a few more events to establish the trading period
                    const moreEvents = await poolContract.queryFilter(filter, firstSwap.blockNumber, firstSwap.blockNumber + 100000);
                    console.log(`Found ${moreEvents.length} swap events in first 100k blocks after creation`);
                    
                    if (moreEvents.length > 1) {
                        const lastEvent = moreEvents[moreEvents.length - 1];
                        const lastBlock = await provider.getBlock(lastEvent.blockNumber);
                        console.log(`Last event in range - Block: ${lastEvent.blockNumber}, Date: ${new Date(lastBlock!.timestamp * 1000).toISOString()}`);
                    }
                    
                    break;
                }
                
            } catch (error) {
                console.log(`Error searching blocks ${startBlock}-${endBlock}: ${error}`);
            }
            
            startBlock = endBlock + 1;
            endBlock = Math.min(startBlock + 1000000, await provider.getBlockNumber());
        }
        
        if (!firstSwap) {
            console.log("No swap events found in the searched range");
        }
        
    } catch (error) {
        console.error("Error finding pool activity:", error);
    }
}

async function main() {
    try {
        await findPoolActivity();
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