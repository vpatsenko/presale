// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IInvesting {
    struct InvestorInfo {
        address investor;
        uint256 amountInvested;
        uint256 stakedSnapshot;
        uint256 tokenAllocation;
        uint256 usdcRefund;
    }

    event SaleStarted(uint256 startTime, uint256 endTime, uint256 duration);
    event DepositMade(
        address indexed investor,
        uint256 amount,
        uint256 stakedSnapshot
    );
    event AllocationsSet(address[] investors, uint256[] tokenAllocations, uint256[] usdcRefunds);
    event FundsWithdrawn(uint256 amount);
}
