import { ethers } from 'hardhat';

// ERC20 ABI for basic token functions
const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
];

async function main(): Promise<void> {
    const recipientAddress = '0xD41c9dBFe96dcbff5279d3B43A7A8E7d39F8e92e';
    const tokenAddress = '0x8B968c0564A7Ac79735A7A8bB4A94fe3602d3522';
    const [signer] = await ethers.getSigners();

    console.log('Signer:', signer);

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    try {
        const balanceBefore = await tokenContract.balanceOf(
            await signer.getAddress()
        );

        console.log('Balance before:', balanceBefore);

        const tx = await tokenContract.transfer(
            recipientAddress,
            balanceBefore
        );

        console.log('- Transaction hash:', tx.hash);
        await tx.wait();
    } catch (error: any) {
        console.error('Transaction failed:', error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
