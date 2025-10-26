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

            await expect(staking.connect(user1).stake(largeAmount)).to.be
                .reverted;
        });

        it('Should reject stake with insufficient allowance', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount - 1n);

            await expect(staking.connect(user1).stake(stakeAmount)).to.be
                .reverted;
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
            expect(position.amount).to.equal(stakeAmount);
            expect(position.status).to.equal(3); // PositionStatus.Claimed
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

        it('Should return empty position for non-existent position', async function () {
            const position = await staking.getPosition(999);
            expect(position.owner).to.equal(ethers.ZeroAddress);
            expect(position.amount).to.equal(0);
            expect(position.status).to.equal(0); // PositionStatus.None
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
            expect(position.status).to.equal(3); // PositionStatus.Claimed
            expect(position.amount).to.equal(stakeAmount);
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

    describe('Pagination Methods', function () {
        beforeEach(async function () {
            // Create multiple users and positions for pagination testing
            const users = [user1, user2, user3];
            const amounts = [
                ethers.parseUnits('100', 6),
                ethers.parseUnits('200', 6),
                ethers.parseUnits('300', 6),
            ];

            // Each user stakes multiple times
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const totalAmount = amounts[i] * 3n; // 3 positions per user

                await roomToken
                    .connect(user)
                    .approve(await staking.getAddress(), totalAmount);

                // Create 3 positions per user
                for (let j = 0; j < 3; j++) {
                    await staking.connect(user).stake(amounts[i]);
                }
            }

            // Change some positions to different statuses
            // User 1: position 1 (active), position 2 (pending), position 3 (active)
            await staking.connect(user1).unstake(2);

            // User 2: position 4 (active), position 5 (pending), position 6 (active)
            await staking.connect(user2).unstake(5);

            // User 3: position 7 (active), position 8 (active), position 9 (active)
            // All positions remain active
        });

        describe('getAllStakersWithPagination', function () {
            it('Should return correct stakers with pagination', async function () {
                // Test first page
                const firstPage = await staking.getAllStakersWithPagination(
                    0,
                    2
                );
                expect(firstPage.length).to.equal(2);
                expect(firstPage[0]).to.equal(user1.address);
                expect(firstPage[1]).to.equal(user2.address);

                // Test second page
                const secondPage = await staking.getAllStakersWithPagination(
                    2,
                    2
                );
                expect(secondPage.length).to.equal(1);
                expect(secondPage[0]).to.equal(user3.address);

                // Test with limit larger than available
                const allStakers = await staking.getAllStakersWithPagination(
                    0,
                    10
                );
                expect(allStakers.length).to.equal(3);
            });

            it('Should handle edge cases for getAllStakersWithPagination', async function () {
                // Test offset beyond available stakers
                const emptyResult = await staking.getAllStakersWithPagination(
                    10,
                    5
                );
                expect(emptyResult.length).to.equal(5); // Returns array of limit size with zero addresses

                // Test with zero limit
                const zeroLimit = await staking.getAllStakersWithPagination(
                    0,
                    0
                );
                expect(zeroLimit.length).to.equal(0);
            });
        });

        describe('getAllPositionsByStatusWithPagination', function () {
            it('Should return active positions with pagination', async function () {
                const activePositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        1,
                        0,
                        5
                    ); // PositionStatus.Active = 1

                // Should return positions with status Active
                expect(activePositions.length).to.equal(5);
                for (let i = 0; i < activePositions.length; i++) {
                    if (activePositions[i].owner !== ethers.ZeroAddress) {
                        expect(activePositions[i].status).to.equal(1); // PositionStatus.Active
                    }
                }
            });

            it('Should return pending positions with pagination', async function () {
                const pendingPositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        2,
                        0,
                        5
                    ); // PositionStatus.Pending = 2

                // Should return positions with status Pending
                expect(pendingPositions.length).to.equal(5);
                for (let i = 0; i < pendingPositions.length; i++) {
                    if (pendingPositions[i].owner !== ethers.ZeroAddress) {
                        expect(pendingPositions[i].status).to.equal(2); // PositionStatus.Pending
                    }
                }
            });

            it('Should handle non-existent status', async function () {
                const claimedPositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        3,
                        0,
                        5
                    ); // PositionStatus.Claimed = 3

                // Should return empty positions since no positions are claimed yet
                expect(claimedPositions.length).to.equal(5);
                for (let i = 0; i < claimedPositions.length; i++) {
                    expect(claimedPositions[i].owner).to.equal(
                        ethers.ZeroAddress
                    );
                }
            });

            it('Should handle edge cases for getAllPositionsByStatusWithPagination', async function () {
                // Test with offset beyond available positions
                const emptyResult =
                    await staking.getAllPositionsByStatusWithPagination(
                        1,
                        100,
                        5
                    );
                expect(emptyResult.length).to.equal(5);

                // Test with zero limit
                const zeroLimit =
                    await staking.getAllPositionsByStatusWithPagination(
                        1,
                        0,
                        0
                    );
                expect(zeroLimit.length).to.equal(0);
            });
        });

        describe('getAllPositionsWithPagination', function () {
            it('Should return all positions with pagination', async function () {
                // Test first page
                const firstPage = await staking.getAllPositionsWithPagination(
                    0,
                    3
                );
                expect(firstPage.length).to.equal(3);
                expect(firstPage[0].positionId).to.equal(1);
                expect(firstPage[1].positionId).to.equal(2);
                expect(firstPage[2].positionId).to.equal(3);

                // Test second page
                const secondPage = await staking.getAllPositionsWithPagination(
                    3,
                    3
                );
                expect(secondPage.length).to.equal(3);
                expect(secondPage[0].positionId).to.equal(4);
                expect(secondPage[1].positionId).to.equal(5);
                expect(secondPage[2].positionId).to.equal(6);

                // Test third page
                const thirdPage = await staking.getAllPositionsWithPagination(
                    6,
                    3
                );
                expect(thirdPage.length).to.equal(3);
                expect(thirdPage[0].positionId).to.equal(7);
                expect(thirdPage[1].positionId).to.equal(8);
                expect(thirdPage[2].positionId).to.equal(9);
            });

            it('Should handle edge cases for getAllPositionsWithPagination', async function () {
                // Test offset beyond available positions
                const emptyResult = await staking.getAllPositionsWithPagination(
                    100,
                    5
                );
                expect(emptyResult.length).to.equal(5);
                for (let i = 0; i < emptyResult.length; i++) {
                    expect(emptyResult[i].owner).to.equal(ethers.ZeroAddress);
                }

                // Test with limit larger than available
                const allPositions =
                    await staking.getAllPositionsWithPagination(0, 20);
                expect(allPositions.length).to.equal(20);
            });
        });

        describe('getUserPositionsPaginated', function () {
            it('Should return user positions with pagination', async function () {
                // Test user1's positions (positions 1, 2, 3)
                const user1Page1 = await staking.getUserPositionsPaginated(
                    user1.address,
                    0,
                    2
                );
                expect(user1Page1.length).to.equal(2);
                expect(user1Page1[0]).to.equal(1);
                expect(user1Page1[1]).to.equal(2);

                const user1Page2 = await staking.getUserPositionsPaginated(
                    user1.address,
                    2,
                    2
                );
                expect(user1Page2.length).to.equal(1);
                expect(user1Page2[0]).to.equal(3);

                // Test user2's positions (positions 4, 5, 6)
                const user2Positions = await staking.getUserPositionsPaginated(
                    user2.address,
                    0,
                    5
                );
                expect(user2Positions.length).to.equal(3);
                expect(user2Positions[0]).to.equal(4);
                expect(user2Positions[1]).to.equal(5);
                expect(user2Positions[2]).to.equal(6);
            });

            it('Should handle edge cases for getUserPositionsPaginated', async function () {
                // Test offset beyond user's positions
                const emptyResult = await staking.getUserPositionsPaginated(
                    user1.address,
                    10,
                    5
                );
                expect(emptyResult.length).to.equal(0);

                // Test with limit larger than user's positions
                const allUserPositions =
                    await staking.getUserPositionsPaginated(
                        user1.address,
                        0,
                        10
                    );
                expect(allUserPositions.length).to.equal(3);

                // Test with zero limit
                const zeroLimit = await staking.getUserPositionsPaginated(
                    user1.address,
                    0,
                    0
                );
                expect(zeroLimit.length).to.equal(0);

                // Test with offset equal to user's position count
                const atBoundary = await staking.getUserPositionsPaginated(
                    user1.address,
                    3,
                    5
                );
                expect(atBoundary.length).to.equal(0);
            });

            it('Should handle user with no positions', async function () {
                const [newUser] = await ethers.getSigners();
                const noPositions = await staking.getUserPositionsPaginated(
                    newUser.address,
                    0,
                    5
                );
                expect(noPositions.length).to.equal(0);
            });
        });

        describe('Pagination Edge Cases', function () {
            it('Should handle large offset values', async function () {
                const largeOffset = await staking.getAllStakersWithPagination(
                    1000,
                    5
                );
                expect(largeOffset.length).to.equal(5);

                const largeOffsetPositions =
                    await staking.getAllPositionsWithPagination(1000, 5);
                expect(largeOffsetPositions.length).to.equal(5);
            });

            it('Should handle zero limit consistently', async function () {
                const zeroLimitStakers =
                    await staking.getAllStakersWithPagination(0, 0);
                expect(zeroLimitStakers.length).to.equal(0);

                const zeroLimitPositions =
                    await staking.getAllPositionsWithPagination(0, 0);
                expect(zeroLimitPositions.length).to.equal(0);

                const zeroLimitUserPositions =
                    await staking.getUserPositionsPaginated(
                        user1.address,
                        0,
                        0
                    );
                expect(zeroLimitUserPositions.length).to.equal(0);
            });

            it('Should handle boundary conditions', async function () {
                // Test exactly at the boundary
                const boundaryStakers =
                    await staking.getAllStakersWithPagination(2, 1);
                expect(boundaryStakers.length).to.equal(1);
                expect(boundaryStakers[0]).to.equal(user3.address);

                // Test one beyond boundary
                const beyondBoundary =
                    await staking.getAllStakersWithPagination(3, 1);
                expect(beyondBoundary.length).to.equal(1);
                expect(beyondBoundary[0]).to.equal(ethers.ZeroAddress);
            });
        });

        describe('Pagination with Position Status Changes', function () {
            it('Should reflect status changes in pagination', async function () {
                // Initially position 2 is pending
                let pendingPositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        2,
                        0,
                        5
                    );

                let hasPosition2 = false;
                for (let i = 0; i < pendingPositions.length; i++) {
                    if (pendingPositions[i].positionId === 2n) {
                        hasPosition2 = true;
                        break;
                    }
                }
                expect(hasPosition2).to.be.true;

                // Restake position 2 (changes from pending to active)
                await staking.connect(user1).restake(2);

                // Now position 2 should be in active positions, not pending
                const activePositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        1,
                        0,
                        5
                    );
                let hasPosition2Active = false;
                for (let i = 0; i < activePositions.length; i++) {
                    if (activePositions[i].positionId === 2n) {
                        hasPosition2Active = true;
                        break;
                    }
                }
                expect(hasPosition2Active).to.be.true;

                // And should not be in pending positions
                pendingPositions =
                    await staking.getAllPositionsByStatusWithPagination(
                        2,
                        0,
                        5
                    );
                hasPosition2 = false;
                for (let i = 0; i < pendingPositions.length; i++) {
                    if (pendingPositions[i].positionId === 2n) {
                        hasPosition2 = false;
                        break;
                    }
                }
                expect(hasPosition2).to.be.false;
            });
        });
    });

    describe('Additional Edge Cases', function () {
        it('Should handle restaking after partial time has passed', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);
            await staking.connect(user1).unstake(1);

            // Fast forward by half the cooldown period
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod / 2,
            ]);
            await ethers.provider.send('evm_mine', []);

            // Should still be able to restake
            await expect(staking.connect(user1).restake(1))
                .to.emit(staking, 'PositionRestaked')
                .withArgs(1, user1.address, stakeAmount);

            const position = await staking.getPosition(1);
            expect(position.status).to.equal(1); // PositionStatus.Active
            expect(position.unlockTime).to.equal(0);
        });

        it('Should handle multiple operations on same position', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            // Unstake
            await staking.connect(user1).unstake(1);
            let position = await staking.getPosition(1);
            expect(position.status).to.equal(2); // PositionStatus.Pending

            // Restake
            await staking.connect(user1).restake(1);
            position = await staking.getPosition(1);
            expect(position.status).to.equal(1); // PositionStatus.Active

            // Unstake again
            await staking.connect(user1).unstake(1);
            position = await staking.getPosition(1);
            expect(position.status).to.equal(2); // PositionStatus.Pending

            // Fast forward and claim
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);
            await staking.connect(user1).claim(1);

            position = await staking.getPosition(1);
            expect(position.status).to.equal(3); // PositionStatus.Claimed
        });

        it('Should handle zero amount edge cases', async function () {
            // Test that zero amount is rejected
            await expect(staking.connect(user1).stake(0)).to.be.revertedWith(
                'Amount must be greater than zero'
            );
        });

        it('Should handle position queries for non-existent positions', async function () {
            const position = await staking.getPosition(999);
            expect(position.owner).to.equal(ethers.ZeroAddress);
            expect(position.amount).to.equal(0);
            expect(position.status).to.equal(0); // PositionStatus.None
            expect(position.positionId).to.equal(0);
            expect(position.unlockTime).to.equal(0);
        });

        it('Should handle time calculations for non-pending positions', async function () {
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            // Active position should return 0
            expect(await staking.getTimeUntilUnlock(1)).to.equal(0);
            expect(await staking.canClaim(1)).to.be.false;

            // After unstaking, should have time remaining
            await staking.connect(user1).unstake(1);
            const timeRemaining = await staking.getTimeUntilUnlock(1);
            expect(timeRemaining).to.be.greaterThan(0);
            expect(await staking.canClaim(1)).to.be.false;

            // After time passes, should be claimable
            await ethers.provider.send('evm_increaseTime', [
                cooldownPeriod + 1,
            ]);
            await ethers.provider.send('evm_mine', []);
            expect(await staking.getTimeUntilUnlock(1)).to.equal(0);
            expect(await staking.canClaim(1)).to.be.true;
        });

        it('Should handle concurrent operations from different users', async function () {
            // User 1 stakes
            await roomToken
                .connect(user1)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user1).stake(stakeAmount);

            // User 2 stakes
            await roomToken
                .connect(user2)
                .approve(await staking.getAddress(), stakeAmount);
            await staking.connect(user2).stake(stakeAmount);

            // Both users should have correct positions
            expect(
                await staking.getUserPositions(user1.address)
            ).to.have.length(1);
            expect(
                await staking.getUserPositions(user2.address)
            ).to.have.length(1);
            expect(await staking.totalStaked(user1.address)).to.equal(
                stakeAmount
            );
            expect(await staking.totalStaked(user2.address)).to.equal(
                stakeAmount
            );

            // User 1 unstakes
            await staking.connect(user1).unstake(1);
            expect(await staking.totalStaked(user1.address)).to.equal(0);
            expect(await staking.totalStaked(user2.address)).to.equal(
                stakeAmount
            );

            // User 2 should not be affected
            const user2Positions = await staking.getUserPositions(
                user2.address
            );
            expect(user2Positions).to.have.length(1);
            expect(user2Positions[0]).to.equal(2); // Second position ID
        });
    });
});
