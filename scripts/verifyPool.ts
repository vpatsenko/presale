import { ethers } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const UNISWAP_V2_POOL_ABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function totalSupply() external view returns (uint256)",
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
];

const POOL_ADDRESS = "0xB4c4e80abE1C807B8f30ac72c9420dD6acEcE8d5";

async function verifyPool(): Promise<void> {
    console.log("Verifying pool...");
    
    const provider = ethers.provider;
    const poolContract = new ethers.Contract(POOL_ADDRESS, UNISWAP_V2_POOL_ABI, provider);
    
    try {
        // Check if contract exists
        const code = await provider.getCode(POOL_ADDRESS);
        if (code === "0x") {
            console.log("❌ No contract found at this address");
            return;
        }
        console.log("✅ Contract exists at address");
        
        // Get basic pool info
        const token0 = await poolContract.token0();
        const token1 = await poolContract.token1();
        const reserves = await poolContract.getReserves();
        const totalSupply = await poolContract.totalSupply();
        
        console.log(`Token0: ${token0}`);
        console.log(`Token1: ${token1}`);
        console.log(`Reserves: ${reserves.reserve0.toString()}, ${reserves.reserve1.toString()}`);
        console.log(`Total Supply: ${totalSupply.toString()}`);
        
        // Check recent swap events (last 1000 blocks)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 1000;
        
        console.log(`\nChecking for recent swaps from block ${fromBlock} to ${currentBlock}...`);
        
        const filter = poolContract.filters.Swap();
        const recentEvents = await poolContract.queryFilter(filter, fromBlock, currentBlock);
        
        console.log(`Found ${recentEvents.length} recent swap events`);
        
        if (recentEvents.length > 0) {
            const latestEvent = recentEvents[recentEvents.length - 1];
            const block = await provider.getBlock(latestEvent.blockNumber);
            console.log(`Latest swap at block ${latestEvent.blockNumber}, timestamp: ${new Date(block!.timestamp * 1000).toISOString()}`);
        }
        
        // Try a broader search for historical events
        console.log(`\nChecking historical events around July 1, 2024...`);
        const july1Block = 16501326; // Approximate block for July 1, 2024
        const historicalEvents = await poolContract.queryFilter(filter, july1Block, july1Block + 50000);
        console.log(`Found ${historicalEvents.length} historical events around July 1`);
        
        if (historicalEvents.length > 0) {
            console.log(`First event at block: ${historicalEvents[0].blockNumber}`);
            console.log(`Last event at block: ${historicalEvents[historicalEvents.length - 1].blockNumber}`);
        }
        
    } catch (error) {
        console.error("Error verifying pool:", error);
    }
}

async function main() {
    try {
        await verifyPool();
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