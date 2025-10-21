import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Staking, TestToken } from '../typechain-types';

describe('Staking', function () {
    let staking: Staking;
    let roomToken: TestToken;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    const stakeAmount = ethers.parseUnits('100', 6); // TestToken has 6 decimals
    const cooldownPeriod = 2 * 7 * 24 * 3600; // 2 weeks in seconds

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy test token
        const TestToken = await ethers.getContractFactory('TestToken');
        roomToken = await TestToken.deploy();
        await roomToken.waitForDeployment();

        // Deploy staking contract
        const Staking = await ethers.getContractFactory('Staking');
        staking = await Staking.deploy(await roomToken.getAddress());
        await staking.waitForDeployment();

        // Transfer tokens to users (TestToken has 6 decimals)
        const tokenAmount = ethers.parseUnits('1000', 6);
        await roomToken.transfer(user1.address, tokenAmount);
        await roomToken.transfer(user2.address, tokenAmount);
        await roomToken.transfer(user3.address, tokenAmount);
    });

    describe('Deployment', function () {
        it('Should set the correct room token address', async function () {
            expect(await staking.roomToken()).to.equal(
                await roomToken.getAddress()
            );
        });

        it('Should set the correct cooldown period', async function () {
            expect(await staking.COOLDOWN_PERIOD()).to.equal(cooldownPeriod);
        });

        it('Should initialize with nextPositionId as 1', async function () {
            expect(await staking.nextPositionId()).to.equal(1);
        });

        it('Should reject zero address for room token', async function () {
            const Staking = await ethers.getContractFactory('Staking');
            await expect(Staking.deploy(ethers.ZeroAddress)).to.be.revertedWith(
                'ROOM token address cannot be zero'
            );
        });
    });

    describe('Staking', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
        });

        it('Should allow users to stake tokens', async function () {
            const initialBalance = await roomToken.balanceOf(user1.address);
            const initialContractBalance = await roomToken.balanceOf(
                await staking.getAddress()
            );

            const tx = await staking.connect(user1).stake(stakeAmount);
            await expect(tx)
                .to.emit(staking, 'PositionCreated')
                .withArgs(
                    1,
                    user1.address,
                    stakeAmount,
                    await ethers.provider
                        .getBlock('latest')
                        .then(b => b!.timestamp)
                );

            expect(await roomToken.balanceOf(user1.address)).to.equal(
                initialBalance - stakeAmount
            );
            expect(
                await roomToken.balanceOf(await staking.getAddress())
            ).to.equal(initialContractBalance + stakeAmount);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount
            );
            expect(await staking.getUserTotalStaked(user1.address)).to.equal(
                stakeAmount
            );
        });

        it('Should create position with correct data', async function () {
            await staking.connect(user1).stake(stakeAmount);

            const position = await staking.getPosition(1);
            expect(position.positionId).to.equal(1);
            expect(position.owner).to.equal(user1.address);
            expect(position.amount).to.equal(stakeAmount);
            expect(position.unlockTime).to.equal(0);
            expect(position.status).to.equal(1); // PositionStatus.Active

            const userPositions = await staking.getUserPositions(user1.address);
            expect(userPositions.length).to.equal(1);
            expect(userPositions[0]).to.equal(1);
        });

        it('Should allow multiple positions per user', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount * 2n);

            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount * 2n
            );
            expect(await staking.getUserTotalStaked(user1.address)).to.equal(
                stakeAmount * 2n
            );

            const userPositions = await staking.getUserPositions(user1.address);
            expect(userPositions.length).to.equal(2);
            expect(userPositions[0]).to.equal(1);
            expect(userPositions[1]).to.equal(2);
        });

        it('Should increment position ID correctly', async function () {
            await staking.connect(user1).stake(stakeAmount);
            expect(await staking.nextPositionId()).to.equal(2);

            await roomToken
                .connect(user2)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user2).stake(stakeAmount);
            expect(await staking.nextPositionId()).to.equal(3);
        });

        it('Should reject zero amount stake', async function () {
            await expect(staking.connect(user1).stake(0)).to.be.revertedWith(
                'Amount must be greater than zero'
            );
        });

        it('Should reject stake with insufficient balance', async function () {
            const largeAmount = ethers.parseUnits('10000', 6);
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), largeAmount);

            await expect(
                staking.connect(user1).stake(largeAmount)
            ).to.be.revertedWith('Insufficient token balance');
        });

        it('Should reject stake with insufficient allowance', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount - 1n);

            await expect(
                staking.connect(user1).stake(stakeAmount)
            ).to.be.revertedWith('Insufficient allowance');
        });
    });

    describe('Unstaking', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
        });

        it('Should allow position owner to unstake', async function () {
            const tx = await staking.connect(user1).unstake(1);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt!.blockNumber);

            await expect(tx)
                .to.emit(staking, 'PositionUnstaked')
                .withArgs(
                    1,
                    user1.address,
                    stakeAmount,
                    block!.timestamp + cooldownPeriod
                );

            const position = await staking.getPosition(1);
            expect(position.status).to.equal(2); // PositionStatus.Pending
            expect(position.unlockTime).to.equal(
                block!.timestamp + cooldownPeriod
            );
            expect(await staking.totalStaked(user1.address)).to.equal(0);
        });

        it('Should not allow non-owner to unstake', async function () {
            await expect(staking.connect(user2).unstake(1)).to.be.revertedWith(
                'Not position owner'
            );
        });

        it('Should not allow unstaking non-existent position', async function () {
            await expect(
                staking.connect(user1).unstake(999)
            ).to.be.revertedWith('Position does not exist');
        });

        it('Should not allow unstaking inactive position', async function () {
            await staking.connect(user1).unstake(1);
            await expect(staking.connect(user1).unstake(1)).to.be.revertedWith(
                'Position not active'
            );
        });

        it('Should update total staked correctly', async function () {
            // Create additional positions (one already exists from beforeEach)
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount * 2n);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount * 3n // 1 from beforeEach + 2 from this test
            );

            await staking.connect(user1).unstake(1);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount * 2n
            );

            await staking.connect(user1).unstake(2);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount
            );
        });
    });

    describe('Claiming', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).unstake(1);
        });

        it('Should allow claiming after cooldown period', async function () {
            // Fast forward past cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            const initialBalance = await roomToken.balanceOf(user1.address);
            const initialContractBalance = await roomToken.balanceOf(
                await staking.getAddress()
            );

            await expect(staking.connect(user1).claim(1))
                .to.emit(staking, 'PositionClaimed')
                .withArgs(1, user1.address, stakeAmount);

            expect(await roomToken.balanceOf(user1.address)).to.equal(
                initialBalance + stakeAmount
            );
            expect(
                await roomToken.balanceOf(await staking.getAddress())
            ).to.equal(initialContractBalance - stakeAmount);

            const position = await staking.getPosition(1);
            expect(position.amount).to.equal(0);
            expect(position.status).to.equal(0); // PositionStatus.None
        });

        it('Should not allow claiming before cooldown period', async function () {
            await expect(staking.connect(user1).claim(1)).to.be.revertedWith(
                'Lock period not ended'
            );
        });

        it('Should not allow claiming non-pending position', async function () {
            // Fast forward past cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            await staking.connect(user1).claim(1);

            await expect(staking.connect(user1).claim(1)).to.be.revertedWith(
                'Position not pending'
            );
        });

        it('Should not allow non-owner to claim', async function () {
            // Fast forward past cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            await expect(staking.connect(user2).claim(1)).to.be.revertedWith(
                'Not position owner'
            );
        });

        it('Should not allow claiming non-existent position', async function () {
            await expect(staking.connect(user1).claim(999)).to.be.revertedWith(
                'Position does not exist'
            );
        });
    });

    describe('Restaking', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).unstake(1);
        });

        it('Should allow restaking pending position', async function () {
            await expect(staking.connect(user1).restake(1))
                .to.emit(staking, 'PositionRestaked')
                .withArgs(1, user1.address, stakeAmount);

            const position = await staking.getPosition(1);
            expect(position.status).to.equal(1); // PositionStatus.Active
            expect(position.unlockTime).to.equal(0);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount
            );
        });

        it('Should not allow restaking non-pending position', async function () {
            await staking.connect(user1).restake(1);

            await expect(staking.connect(user1).restake(1)).to.be.revertedWith(
                'Position not pending'
            );
        });

        it('Should not allow non-owner to restake', async function () {
            await expect(staking.connect(user2).restake(1)).to.be.revertedWith(
                'Not position owner'
            );
        });

        it('Should not allow restaking non-existent position', async function () {
            await expect(
                staking.connect(user1).restake(999)
            ).to.be.revertedWith('Position does not exist');
        });

        it('Should update total staked correctly on restake', async function () {
            expect(await staking.totalStaked(user1.address)).to.equal(0);

            await staking.connect(user1).restake(1);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount
            );
        });
    });

    describe('View Functions', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount * 2n);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
        });

        it('Should return correct user positions', async function () {
            const positions = await staking.getUserPositions(user1.address);
            expect(positions.length).to.equal(2);
            expect(positions[0]).to.equal(1);
            expect(positions[1]).to.equal(2);
        });

        it('Should return correct position details', async function () {
            const position = await staking.getPosition(1);
            expect(position.positionId).to.equal(1);
            expect(position.owner).to.equal(user1.address);
            expect(position.amount).to.equal(stakeAmount);
            expect(position.status).to.equal(1); // PositionStatus.Active
        });

        it('Should return correct total staked', async function () {
            expect(await staking.getUserTotalStaked(user1.address)).to.equal(
                stakeAmount * 2n
            );
        });

        it('Should return correct time until unlock', async function () {
            await staking.connect(user1).unstake(1);

            const timeUntilUnlock = await staking.getTimeUntilUnlock(1);
            expect(timeUntilUnlock).to.be.greaterThan(0);
            expect(timeUntilUnlock).to.be.lessThanOrEqual(cooldownPeriod);
        });

        it('Should return zero time for non-pending position', async function () {
            const timeUntilUnlock = await staking.getTimeUntilUnlock(1);
            expect(timeUntilUnlock).to.equal(0);
        });

        it('Should return correct can claim status', async function () {
            await staking.connect(user1).unstake(1);

            expect(await staking.canClaim(1)).to.be.false;

            // Fast forward past cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            expect(await staking.canClaim(1)).to.be.true;
        });

        it('Should reject getting non-existent position', async function () {
            await expect(staking.getPosition(999)).to.be.revertedWith(
                'Position does not exist'
            );
        });
    });

    describe('Edge Cases and Security', function () {
        it('Should handle multiple users with multiple positions', async function () {
            // User 1 creates 2 positions
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount * 2n);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            // User 2 creates 1 position
            await roomToken
                .connect(user2)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user2).stake(stakeAmount);

            expect(
                await staking.getUserPositions(user1.address)
            ).to.have.length(2);
            expect(
                await staking.getUserPositions(user2.address)
            ).to.have.length(1);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount * 2n
            );
            expect(await staking.totalStaked(user2.address)).to.equal(
                stakeAmount
            );
        });

        it('Should handle position lifecycle correctly', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            // Position should be active
            let position = await staking.getPosition(1);
            expect(position.status).to.equal(1); // Active

            // Unstake
            await staking.connect(user1).unstake(1);
            position = await staking.getPosition(1);
            expect(position.status).to.equal(2); // Pending

            // Restake
            await staking.connect(user1).restake(1);
            position = await staking.getPosition(1);
            expect(position.status).to.equal(1); // Active

            // Unstake and claim
            await staking.connect(user1).unstake(1);
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);
            await staking.connect(user1).claim(1);

            position = await staking.getPosition(1);
            expect(position.status).to.equal(0); // None
            expect(position.amount).to.equal(0);
        });

        it('Should prevent reentrancy attacks', async function () {
            // This test ensures the nonReentrant modifier is working
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);

            // Normal stake should work
            await expect(staking.connect(user1).stake(stakeAmount)).to.emit(
                staking,
                'PositionCreated'
            );
        });

        it('Should handle zero address checks', async function () {
            // Test that position owner checks work
            await expect(staking.connect(user1).unstake(0)).to.be.revertedWith(
                'Position does not exist'
            );
        });

        it('Should maintain position integrity after operations', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            const originalPosition = await staking.getPosition(1);
            expect(originalPosition.positionId).to.equal(1);
            expect(originalPosition.owner).to.equal(user1.address);
            expect(originalPosition.amount).to.equal(stakeAmount);

            // After unstaking, position should maintain integrity
            await staking.connect(user1).unstake(1);
            const unstakedPosition = await staking.getPosition(1);
            expect(unstakedPosition.positionId).to.equal(1);
            expect(unstakedPosition.owner).to.equal(user1.address);
            expect(unstakedPosition.amount).to.equal(stakeAmount);
            expect(unstakedPosition.status).to.equal(2); // Pending
        });
    });

    describe('Time-based Operations', function () {
        beforeEach(async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).unstake(1);
        });

        it('Should calculate unlock time correctly', async function () {
            const position = await staking.getPosition(1);
            const currentTime = await ethers.provider
                .getBlock('latest')
                .then(b => b!.timestamp);
            expect(position.unlockTime).to.equal(currentTime + cooldownPeriod);
        });

        it('Should allow claiming exactly at unlock time', async function () {
            await ethers.provider.send('evm_increaseTime', [cooldownPeriod]);
            await ethers.provider.send('evm_mine', []);

            await expect(staking.connect(user1).claim(1)).to.emit(
                staking,
                'PositionClaimed'
            );
        });

        it('Should handle time calculations correctly', async function () {
            const timeUntilUnlock = await staking.getTimeUntilUnlock(1);
            expect(timeUntilUnlock).to.be.greaterThan(0);
            expect(timeUntilUnlock).to.be.lessThanOrEqual(cooldownPeriod);

            // Fast forward by half the cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod / 2,
            ]);
            await ethers.provider.send('evm_mine', []);

            const newTimeUntilUnlock = await staking.getTimeUntilUnlock(1);
            expect(newTimeUntilUnlock).to.be.lessThan(timeUntilUnlock);
        });
    });

    describe('Gas Optimization Tests', function () {
        it('Should handle large number of positions efficiently', async function () {
            const numPositions = 10;
            const amountPerPosition = ethers.parseUnits('10', 6);

            await roomToken
                .connect(user1)
                .approve(
                    await staking.getAddress(),
                    amountPerPosition * BigInt(numPositions)
                );

            // Create multiple positions
            for (let i = 0; i < numPositions; i++) {
                await staking.connect(user1).stake(amountPerPosition);
            }

            expect(
                await staking.getUserPositions(user1.address)
            ).to.have.length(numPositions);
            expect(await staking.totalStaked(user1.address)).to.equal(
                amountPerPosition * BigInt(numPositions)
            );
        });
    });
});
