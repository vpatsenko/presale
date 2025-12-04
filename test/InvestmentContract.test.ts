import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { InvestmentContract, TestToken, Staking } from '../typechain-types';

describe('InvestmentContract', function () {
    let investmentContract: InvestmentContract;
    let usdcToken: TestToken;
    let stakingContract: Staking;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    const saleDuration = 7 * 24 * 3600; // 7 days in seconds
    const depositAmount1 = ethers.parseUnits('1000', 6); // 1000 USDC (6 decimals)
    const depositAmount2 = ethers.parseUnits('500', 6); // 500 USDC
    const depositAmount3 = ethers.parseUnits('2000', 6); // 2000 USDC

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Deploy USDC token (using TestToken with 6 decimals)
        const TestToken = await ethers.getContractFactory('TestToken');
        usdcToken = await TestToken.deploy();
        await usdcToken.waitForDeployment();

        // Deploy staking contract
        const Staking = await ethers.getContractFactory('Staking');
        stakingContract = await Staking.deploy(await usdcToken.getAddress());
        await stakingContract.waitForDeployment();

        // Deploy investment contract
        const InvestmentContract = await ethers.getContractFactory('InvestmentContract');
        investmentContract = await InvestmentContract.deploy(
            await usdcToken.getAddress(),
            await stakingContract.getAddress(),
            saleDuration
        );
        await investmentContract.waitForDeployment();

        // Transfer USDC tokens to users
        const tokenAmount = ethers.parseUnits('10000', 6);
        await usdcToken.transfer(user1.address, tokenAmount);
        await usdcToken.transfer(user2.address, tokenAmount);
        await usdcToken.transfer(user3.address, tokenAmount);
    });

    describe('Deployment', function () {
        it('Should set the correct USDC token address', async function () {
            expect(await investmentContract.usdcToken()).to.equal(
                await usdcToken.getAddress()
            );
        });

        it('Should set the correct staking contract address', async function () {
            expect(await investmentContract.stakingContract()).to.equal(
                await stakingContract.getAddress()
            );
        });

        it('Should set the correct sale duration', async function () {
            expect(await investmentContract.saleDuration()).to.equal(saleDuration);
        });

        it('Should initialize with zero values', async function () {
            expect(await investmentContract.saleStart()).to.equal(0);
            expect(await investmentContract.saleEnd()).to.equal(0);
            expect(await investmentContract.totalInvested()).to.equal(0);
        });

        it('Should reject zero address for USDC token', async function () {
            const InvestmentContract = await ethers.getContractFactory('InvestmentContract');
            await expect(
                InvestmentContract.deploy(
                    ethers.ZeroAddress,
                    await stakingContract.getAddress(),
                    saleDuration
                )
            ).to.be.revertedWith('USDC token address cannot be zero');
        });

        it('Should reject zero address for staking contract', async function () {
            const InvestmentContract = await ethers.getContractFactory('InvestmentContract');
            await expect(
                InvestmentContract.deploy(
                    await usdcToken.getAddress(),
                    ethers.ZeroAddress,
                    saleDuration
                )
            ).to.be.revertedWith('Staking contract address cannot be zero');
        });

        it('Should reject zero sale duration', async function () {
            const InvestmentContract = await ethers.getContractFactory('InvestmentContract');
            await expect(
                InvestmentContract.deploy(
                    await usdcToken.getAddress(),
                    await stakingContract.getAddress(),
                    0
                )
            ).to.be.revertedWith('Sale duration must be greater than zero');
        });
    });

    describe('Sale Management', function () {
        it('Should allow owner to start sale', async function () {
            const tx = await investmentContract.startSale();
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt!.blockNumber);

            await expect(tx)
                .to.emit(investmentContract, 'SaleStarted')
                .withArgs(
                    block!.timestamp,
                    block!.timestamp + saleDuration,
                    saleDuration
                );

            expect(await investmentContract.saleStart()).to.equal(block!.timestamp);
            expect(await investmentContract.saleEnd()).to.equal(
                block!.timestamp + saleDuration
            );
        });

        it('Should not allow non-owner to start sale', async function () {
            await expect(
                investmentContract.connect(user1).startSale()
            ).to.be.revertedWithCustomError(investmentContract, 'OwnableUnauthorizedAccount');
        });

        it('Should not allow starting sale twice while active', async function () {
            await investmentContract.startSale();
            await expect(investmentContract.startSale()).to.be.revertedWith(
                'Sale already active'
            );
        });

        it('Should allow restarting sale after it ends', async function () {
            await investmentContract.startSale();

            // Fast forward time past sale end
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            // Should be able to start new sale
            await expect(investmentContract.startSale()).to.not.be.reverted;
        });

        it('Should correctly check if sale is active', async function () {
            expect(await investmentContract.isSaleActive()).to.be.false;

            await investmentContract.startSale();
            expect(await investmentContract.isSaleActive()).to.be.true;

            // Fast forward past sale end
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            expect(await investmentContract.isSaleActive()).to.be.false;
        });
    });

    describe('Deposits', function () {
        beforeEach(async function () {
            await investmentContract.startSale();
        });

        it('Should allow users to deposit USDC', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );

            const initialBalance = await usdcToken.balanceOf(user1.address);
            const initialContractBalance = await usdcToken.balanceOf(
                await investmentContract.getAddress()
            );

            const tx = await investmentContract.connect(user1).deposit(depositAmount1);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt!.blockNumber);

            await expect(tx)
                .to.emit(investmentContract, 'DepositMade')
                .withArgs(
                    user1.address,
                    depositAmount1,
                    await stakingContract.getUserTotalStaked(user1.address)
                );

            expect(await usdcToken.balanceOf(user1.address)).to.equal(
                initialBalance - depositAmount1
            );
            expect(
                await usdcToken.balanceOf(await investmentContract.getAddress())
            ).to.equal(initialContractBalance + depositAmount1);

            expect(await investmentContract.amountInvested(user1.address)).to.equal(
                depositAmount1
            );
            expect(await investmentContract.totalInvested()).to.equal(depositAmount1);
        });

        it('Should snapshot staked balance at deposit time', async function () {
            // User1 stakes some tokens first
            const stakeAmount = ethers.parseUnits('500', 6);
            await usdcToken.connect(user1).approve(
                await stakingContract.getAddress(),
                stakeAmount
            );
            await stakingContract.connect(user1).stake(stakeAmount);

            // Now deposit
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await investmentContract.connect(user1).deposit(depositAmount1);

            const stakedSnapshot = await investmentContract.stakedSnapshot(user1.address);
            expect(stakedSnapshot).to.equal(stakeAmount);

            // If user stakes more after deposit, snapshot should remain the same
            await usdcToken.connect(user1).approve(
                await stakingContract.getAddress(),
                stakeAmount
            );
            await stakingContract.connect(user1).stake(stakeAmount);

            expect(await investmentContract.stakedSnapshot(user1.address)).to.equal(
                stakedSnapshot
            );
        });

        it('Should track all investors', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );
            await usdcToken.connect(user3).approve(
                await investmentContract.getAddress(),
                depositAmount3
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);
            await investmentContract.connect(user3).deposit(depositAmount3);

            const investors = await investmentContract.getAllInvestors(0, 100);
            expect(investors.length).to.equal(3);
            expect(investors[0].investor).to.equal(user1.address);
            expect(investors[1].investor).to.equal(user2.address);
            expect(investors[2].investor).to.equal(user3.address);
        });

        it('Should not allow deposit before sale starts', async function () {
            // Deploy new contract without starting sale
            const InvestmentContract = await ethers.getContractFactory('InvestmentContract');
            const newContract = await InvestmentContract.deploy(
                await usdcToken.getAddress(),
                await stakingContract.getAddress(),
                saleDuration
            );
            await newContract.waitForDeployment();

            await usdcToken.connect(user1).approve(
                await newContract.getAddress(),
                depositAmount1
            );

            await expect(
                newContract.connect(user1).deposit(depositAmount1)
            ).to.be.revertedWith('Sale not started');
        });

        it('Should not allow deposit after sale ends', async function () {
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );

            await expect(
                investmentContract.connect(user1).deposit(depositAmount1)
            ).to.be.revertedWith('Sale ended');
        });

        it('Should not allow zero amount deposit', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );

            await expect(
                investmentContract.connect(user1).deposit(0)
            ).to.be.revertedWith('Amount must be greater than zero');
        });

        it('Should not allow multiple deposits from same address', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1 * 2n
            );

            await investmentContract.connect(user1).deposit(depositAmount1);

            await expect(
                investmentContract.connect(user1).deposit(depositAmount1)
            ).to.be.revertedWith('Already deposited');
        });

        it('Should require approval before deposit', async function () {
            await expect(
                investmentContract.connect(user1).deposit(depositAmount1)
            ).to.be.reverted;
        });
    });

    describe('Allocations', function () {
        beforeEach(async function () {
            await investmentContract.startSale();

            // Setup deposits
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );
            await usdcToken.connect(user3).approve(
                await investmentContract.getAddress(),
                depositAmount3
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);
            await investmentContract.connect(user3).deposit(depositAmount3);
        });

        it('Should allow owner to set allocations', async function () {
            const addresses = [user1.address, user2.address, user3.address];
            const tokenAllocations = [
                ethers.parseUnits('100', 18),
                ethers.parseUnits('50', 18),
                ethers.parseUnits('200', 18),
            ];
            const usdcRefunds = [
                ethers.parseUnits('0', 6),
                ethers.parseUnits('100', 6),
                ethers.parseUnits('0', 6),
            ];

            const tx = await investmentContract.setAllocations(
                addresses,
                tokenAllocations,
                usdcRefunds
            );

            await expect(tx)
                .to.emit(investmentContract, 'AllocationsSet')
                .withArgs(addresses, tokenAllocations, usdcRefunds);

            expect(await investmentContract.tokenAllocation(user1.address)).to.equal(
                tokenAllocations[0]
            );
            expect(await investmentContract.tokenAllocation(user2.address)).to.equal(
                tokenAllocations[1]
            );
            expect(await investmentContract.tokenAllocation(user3.address)).to.equal(
                tokenAllocations[2]
            );

            expect(await investmentContract.usdcRefund(user1.address)).to.equal(
                usdcRefunds[0]
            );
            expect(await investmentContract.usdcRefund(user2.address)).to.equal(
                usdcRefunds[1]
            );
            expect(await investmentContract.usdcRefund(user3.address)).to.equal(
                usdcRefunds[2]
            );
        });

        it('Should not allow non-owner to set allocations', async function () {
            const addresses = [user1.address];
            const tokenAllocations = [ethers.parseUnits('100', 18)];
            const usdcRefunds = [ethers.parseUnits('0', 6)];

            await expect(
                investmentContract
                    .connect(user1)
                    .setAllocations(addresses, tokenAllocations, usdcRefunds)
            ).to.be.revertedWithCustomError(investmentContract, 'OwnableUnauthorizedAccount');
        });

        it('Should require matching array lengths', async function () {
            const addresses = [user1.address, user2.address];
            const tokenAllocations = [ethers.parseUnits('100', 18)];
            const usdcRefunds = [ethers.parseUnits('0', 6)];

            await expect(
                investmentContract.setAllocations(
                    addresses,
                    tokenAllocations,
                    usdcRefunds
                )
            ).to.be.revertedWith('Array lengths must match');
        });

        it('Should reject zero address in allocations', async function () {
            const addresses = [ethers.ZeroAddress];
            const tokenAllocations = [ethers.parseUnits('100', 18)];
            const usdcRefunds = [ethers.parseUnits('0', 6)];

            await expect(
                investmentContract.setAllocations(
                    addresses,
                    tokenAllocations,
                    usdcRefunds
                )
            ).to.be.revertedWith('Invalid address');
        });

        it('Should reject allocations for non-investors', async function () {
            const nonInvestor = user3.address;
            // Remove user3 from investors by not depositing
            // Actually, user3 did deposit, so let's use a new address
            const [nonInvestorSigner] = await ethers.getSigners();
            const addresses = [nonInvestorSigner.address];
            const tokenAllocations = [ethers.parseUnits('100', 18)];
            const usdcRefunds = [ethers.parseUnits('0', 6)];

            await expect(
                investmentContract.setAllocations(
                    addresses,
                    tokenAllocations,
                    usdcRefunds
                )
            ).to.be.revertedWith('Address did not invest');
        });
    });

    describe('Withdraw Funds', function () {
        beforeEach(async function () {
            await investmentContract.startSale();

            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);
        });

        it('Should allow owner to withdraw funds after sale ends', async function () {
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            const contractBalance = await usdcToken.balanceOf(
                await investmentContract.getAddress()
            );
            const ownerBalance = await usdcToken.balanceOf(owner.address);

            const tx = await investmentContract.withdrawFunds();

            await expect(tx)
                .to.emit(investmentContract, 'FundsWithdrawn')
                .withArgs(contractBalance);

            expect(await usdcToken.balanceOf(owner.address)).to.equal(
                ownerBalance + contractBalance
            );
            expect(
                await usdcToken.balanceOf(await investmentContract.getAddress())
            ).to.equal(0);
        });

        it('Should not allow non-owner to withdraw funds', async function () {
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            await expect(
                investmentContract.connect(user1).withdrawFunds()
            ).to.be.revertedWithCustomError(investmentContract, 'OwnableUnauthorizedAccount');
        });

        it('Should not allow withdrawal while sale is active', async function () {
            await expect(investmentContract.withdrawFunds()).to.be.revertedWith(
                'Sale still active'
            );
        });

        it('Should not allow withdrawal if no funds', async function () {
            const saleEnd = await investmentContract.saleEnd();
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                Number(saleEnd) + 1,
            ]);
            await ethers.provider.send('evm_mine', []);

            // Withdraw once
            await investmentContract.withdrawFunds();

            // Try to withdraw again
            await expect(investmentContract.withdrawFunds()).to.be.revertedWith(
                'No funds to withdraw'
            );
        });
    });

    describe('View Functions', function () {
        beforeEach(async function () {
            await investmentContract.startSale();

            // User1 stakes tokens
            const stakeAmount = ethers.parseUnits('300', 6);
            await usdcToken.connect(user1).approve(
                await stakingContract.getAddress(),
                stakeAmount
            );
            await stakingContract.connect(user1).stake(stakeAmount);

            // Users deposit
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);
        });

        it('Should return correct user info', async function () {
            const userInfo = await investmentContract.getUserInfo(user1.address);

            expect(userInfo.amountInvested_).to.equal(depositAmount1);
            expect(userInfo.stakedSnapshot_).to.equal(ethers.parseUnits('300', 6));
            expect(userInfo.tokenAllocation_).to.equal(0);
            expect(userInfo.usdcRefund_).to.equal(0);
        });

        it('Should return correct total invested', async function () {
            expect(await investmentContract.getTotalInvested()).to.equal(
                depositAmount1 + depositAmount2
            );
        });

        it('Should return correct sale times', async function () {
            const saleTimes = await investmentContract.getSaleTimes();
            const saleStart = await investmentContract.saleStart();

            expect(saleTimes.saleStart_).to.equal(saleStart);
            expect(saleTimes.saleEnd_).to.equal(saleStart + BigInt(saleDuration));
            expect(saleTimes.saleDuration_).to.equal(BigInt(saleDuration));
        });

        it('Should return all investors with complete info', async function () {
            // Set allocations first
            const addresses = [user1.address, user2.address];
            const tokenAllocations = [
                ethers.parseUnits('100', 18),
                ethers.parseUnits('50', 18),
            ];
            const usdcRefunds = [ethers.parseUnits('0', 6), ethers.parseUnits('100', 6)];

            await investmentContract.setAllocations(
                addresses,
                tokenAllocations,
                usdcRefunds
            );

            const investors = await investmentContract.getAllInvestors(0, 100);

            expect(investors.length).to.equal(2);
            expect(investors[0].investor).to.equal(user1.address);
            expect(investors[0].amountInvested).to.equal(depositAmount1);
            expect(investors[0].stakedSnapshot).to.equal(ethers.parseUnits('300', 6));
            expect(investors[0].tokenAllocation).to.equal(tokenAllocations[0]);
            expect(investors[0].usdcRefund).to.equal(usdcRefunds[0]);

            expect(investors[1].investor).to.equal(user2.address);
            expect(investors[1].amountInvested).to.equal(depositAmount2);
            expect(investors[1].tokenAllocation).to.equal(tokenAllocations[1]);
            expect(investors[1].usdcRefund).to.equal(usdcRefunds[1]);
        });

        it('Should return zero values for non-investor', async function () {
            const userInfo = await investmentContract.getUserInfo(user3.address);

            expect(userInfo.amountInvested_).to.equal(0);
            expect(userInfo.stakedSnapshot_).to.equal(0);
            expect(userInfo.tokenAllocation_).to.equal(0);
            expect(userInfo.usdcRefund_).to.equal(0);
        });
    });

    describe('Edge Cases', function () {
        beforeEach(async function () {
            await investmentContract.startSale();
        });

        it('Should handle user with zero staked balance', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );

            await investmentContract.connect(user1).deposit(depositAmount1);

            expect(await investmentContract.stakedSnapshot(user1.address)).to.equal(0);
        });

        it('Should handle multiple allocations updates', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await investmentContract.connect(user1).deposit(depositAmount1);

            // Set allocations first time
            await investmentContract.setAllocations(
                [user1.address],
                [ethers.parseUnits('100', 18)],
                [ethers.parseUnits('0', 6)]
            );

            // Update allocations
            await investmentContract.setAllocations(
                [user1.address],
                [ethers.parseUnits('150', 18)],
                [ethers.parseUnits('50', 6)]
            );

            expect(await investmentContract.tokenAllocation(user1.address)).to.equal(
                ethers.parseUnits('150', 18)
            );
            expect(await investmentContract.usdcRefund(user1.address)).to.equal(
                ethers.parseUnits('50', 6)
            );
        });

        it('Should handle partial investor list in allocations', async function () {
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);

            // Set allocations only for user1
            await investmentContract.setAllocations(
                [user1.address],
                [ethers.parseUnits('100', 18)],
                [ethers.parseUnits('0', 6)]
            );

            expect(await investmentContract.tokenAllocation(user1.address)).to.equal(
                ethers.parseUnits('100', 18)
            );
            expect(await investmentContract.tokenAllocation(user2.address)).to.equal(0);
        });
    });

    describe('Pagination', function () {
        beforeEach(async function () {
            await investmentContract.startSale();

            // Create multiple investors
            await usdcToken.connect(user1).approve(
                await investmentContract.getAddress(),
                depositAmount1
            );
            await usdcToken.connect(user2).approve(
                await investmentContract.getAddress(),
                depositAmount2
            );
            await usdcToken.connect(user3).approve(
                await investmentContract.getAddress(),
                depositAmount3
            );

            await investmentContract.connect(user1).deposit(depositAmount1);
            await investmentContract.connect(user2).deposit(depositAmount2);
            await investmentContract.connect(user3).deposit(depositAmount3);
        });

        it('Should return paginated investors with offset and limit', async function () {
            const investors = await investmentContract.getAllInvestors(0, 2);

            expect(investors.length).to.equal(2);
            expect(investors[0].investor).to.equal(user1.address);
            expect(investors[1].investor).to.equal(user2.address);
        });

        it('Should return remaining investors when limit exceeds available', async function () {
            const investors = await investmentContract.getAllInvestors(0, 10);

            expect(investors.length).to.equal(3);
            expect(investors[0].investor).to.equal(user1.address);
            expect(investors[1].investor).to.equal(user2.address);
            expect(investors[2].investor).to.equal(user3.address);
        });

        it('Should return empty array when offset exceeds total investors', async function () {
            const investors = await investmentContract.getAllInvestors(10, 5);

            expect(investors.length).to.equal(0);
        });

        it('Should return correct investors with offset', async function () {
            const investors = await investmentContract.getAllInvestors(1, 2);

            expect(investors.length).to.equal(2);
            expect(investors[0].investor).to.equal(user2.address);
            expect(investors[1].investor).to.equal(user3.address);
        });

        it('Should return partial results when offset + limit exceeds total', async function () {
            const investors = await investmentContract.getAllInvestors(2, 5);

            expect(investors.length).to.equal(1);
            expect(investors[0].investor).to.equal(user3.address);
        });

        it('Should handle zero limit', async function () {
            const investors = await investmentContract.getAllInvestors(0, 0);

            expect(investors.length).to.equal(0);
        });

        it('Should return all investors when using large limit', async function () {
            const investors = await investmentContract.getAllInvestors(0, 1000);

            expect(investors.length).to.equal(3);
            expect(investors[0].investor).to.equal(user1.address);
            expect(investors[1].investor).to.equal(user2.address);
            expect(investors[2].investor).to.equal(user3.address);
        });

        it('Should maintain correct data structure in paginated results', async function () {
            // Set allocations first
            const addresses = [user1.address, user2.address, user3.address];
            const tokenAllocations = [
                ethers.parseUnits('100', 18),
                ethers.parseUnits('50', 18),
                ethers.parseUnits('200', 18),
            ];
            const usdcRefunds = [
                ethers.parseUnits('0', 6),
                ethers.parseUnits('100', 6),
                ethers.parseUnits('0', 6),
            ];

            await investmentContract.setAllocations(
                addresses,
                tokenAllocations,
                usdcRefunds
            );

            const investors = await investmentContract.getAllInvestors(1, 1);

            expect(investors.length).to.equal(1);
            expect(investors[0].investor).to.equal(user2.address);
            expect(investors[0].amountInvested).to.equal(depositAmount2);
            expect(investors[0].tokenAllocation).to.equal(tokenAllocations[1]);
            expect(investors[0].usdcRefund).to.equal(usdcRefunds[1]);
        });
    });
});
