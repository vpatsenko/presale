import { run, ethers } from 'hardhat';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BACKROOM_ADDRESS = process.env.BACKROOM_ADDRESS || '';

// Helper function to wait/delay
const delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

async function attemptVerification(
    constructorArgs: string[],
    attempt: number
): Promise<boolean> {
    try {
        console.log(`\n🔄 Verification attempt ${attempt}/4...`);

        await run('verify:verify', {
            address: BACKROOM_ADDRESS,
            constructorArguments: constructorArgs,
        });

        console.log('✅ Contract verified successfully!');
        return true;
    } catch (error: any) {
        if (error.message.toLowerCase().includes('already verified')) {
            console.log('✅ Contract is already verified!');
            return true;
        } else {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            return false;
        }
    }
}

async function main(): Promise<void> {
    console.log('Verifying Backroom contract...');
    console.log('=====================================');

    if (!BACKROOM_ADDRESS) {
        console.error('❌ BACKROOM_ADDRESS not found in environment variables');
        console.log('Please set BACKROOM_ADDRESS in your .env file');
        process.exit(1);
    }

    // Read deployment JSON file
    const network = await ethers.provider.getNetwork();
    const deploymentPath = path.join(
        __dirname,
        '..',
        'deployments',
        network.chainId === 84532n ? 'baseSepolia' : 'base',
        'Backroom.json'
    );

    let deploymentData;
    try {
        deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    } catch (error) {
        console.error('❌ Failed to read deployment file:', error);
        process.exit(1);
    }

    if (!deploymentData.args || !Array.isArray(deploymentData.args)) {
        console.error('❌ No constructor arguments found in deployment file');
        process.exit(1);
    }

    const constructorArgs = deploymentData.args;

    console.log('Contract address:', BACKROOM_ADDRESS);

    console.log('\nConstructor arguments:');
    console.log('- Protocol Fee Destination:', constructorArgs[0]);
    console.log('- Protocol Fee Percent:', constructorArgs[1]);
    console.log('- Subject Fee Percent:', constructorArgs[2]);
    console.log('- Token Address:', constructorArgs[3]);
    console.log('- Divisor 1:', constructorArgs[4]);
    console.log('- Divisor 2:', constructorArgs[5]);
    console.log('- Divisor 3:', constructorArgs[6]);

    // Retry verification up to 4 times
    const maxAttempts = 4;
    const delayBetweenAttempts = 3000; // 3 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const success = await attemptVerification(constructorArgs, attempt);

        if (success) {
            // Show explorer link on success
            console.log(`\n🔗 View on explorer:`);

            if (network.chainId === 8453n) {
                // Base Mainnet
                console.log(`https://basescan.org/address/${BACKROOM_ADDRESS}`);
            } else if (network.chainId === 84532n) {
                // Base Sepolia
                console.log(
                    `https://sepolia.basescan.org/address/${BACKROOM_ADDRESS}`
                );
            } else {
                console.log(`Contract address: ${BACKROOM_ADDRESS}`);
            }
            return; // Exit successfully
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
            console.log(
                `⏳ Waiting ${delayBetweenAttempts / 1000} seconds before next attempt...`
            );
            await delay(delayBetweenAttempts);
        }
    }

    // If we get here, all attempts failed
    console.error(`\n❌ All ${maxAttempts} verification attempts failed`);
    console.log('\n🔧 Manual verification options:');
    console.log(`1. Try again later when API is more stable`);
    console.log(`2. Use manual verification on Basescan:`);
    if (network.chainId === 84532n) {
        console.log(
            `   https://sepolia.basescan.org/address/${BACKROOM_ADDRESS}#code`
        );
    } else {
        console.log(`   https://basescan.org/address/${BACKROOM_ADDRESS}#code`);
    }
    console.log(`3. Check your ETHERSCAN_API_KEY is valid for Basescan`);

    process.exit(1);
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
