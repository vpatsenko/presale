// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStaking.sol";
import "./interfaces/IInvesting.sol";

/**
 * @title InvestmentContract
 * @dev Simple sale collector that accepts USDC deposits, snapshots staked balances,
 *      and stores final token allocations and refund amounts
 */
contract InvestmentContract is Ownable, ReentrancyGuard, IInvesting {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdcToken;
    IStaking public immutable stakingContract;

    uint256 public saleStart;
    uint256 public saleEnd;
    uint256 public saleDuration;

    uint256 public totalInvested;

    // Per-user data
    mapping(address => uint256) public amountInvested;
    mapping(address => uint256) public stakedSnapshot;
    mapping(address => uint256) public tokenAllocation;
    mapping(address => uint256) public usdcRefund;

    // Track all investors
    address[] public investors;

    modifier onlyDuringSale() {
        require(saleStart > 0, "Sale not started");
        require(block.timestamp >= saleStart, "Sale not started");
        require(block.timestamp <= saleEnd, "Sale ended");
        _;
    }

    modifier onlyAfterSale() {
        require(saleStart > 0, "Sale not started");
        require(block.timestamp > saleEnd, "Sale still active");
        _;
    }

    /**
     * @dev Constructor
     * @param _usdcToken Address of USDC token
     * @param _stakingContract Address of staking contract
     * @param _saleDuration Duration of the sale in seconds
     */
    constructor(
        address _usdcToken,
        address _stakingContract,
        uint256 _saleDuration
    ) Ownable(msg.sender) {
        require(_usdcToken != address(0), "USDC token address cannot be zero");
        require(
            _stakingContract != address(0),
            "Staking contract address cannot be zero"
        );
        require(_saleDuration > 0, "Sale duration must be greater than zero");

        usdcToken = IERC20(_usdcToken);
        stakingContract = IStaking(_stakingContract);
        saleDuration = _saleDuration;
    }

    /**
     * @dev Start the sale (admin only)
     */
    function startSale() external onlyOwner {
        require(
            saleStart == 0 || block.timestamp > saleEnd,
            "Sale already active"
        );

        saleStart = block.timestamp;
        saleEnd = saleStart + saleDuration;

        emit SaleStarted(saleStart, saleEnd, saleDuration);
    }

    /**
     * @dev Deposit USDC during the sale
     * @param _amount Amount of USDC to deposit
     */
    function deposit(uint256 _amount) external onlyDuringSale nonReentrant {
        require(_amount > 0, "Amount must be greater than zero");
        require(amountInvested[msg.sender] == 0, "Already deposited");

        // Transfer USDC from user to this contract
        usdcToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Get user's staked balance at deposit time
        uint256 staked = stakingContract.getUserTotalStaked(msg.sender);

        // Store investment data
        amountInvested[msg.sender] = _amount;
        stakedSnapshot[msg.sender] = staked;
        investors.push(msg.sender);
        totalInvested += _amount;

        emit DepositMade(msg.sender, _amount, staked);
    }

    /**
     * @dev Set allocations and refunds for investors (admin only)
     * @param _addresses Array of investor addresses
     * @param _tokenAllocations Array of token allocations
     * @param _usdcRefunds Array of USDC refund amounts
     */
    function setAllocations(
        address[] calldata _addresses,
        uint256[] calldata _tokenAllocations,
        uint256[] calldata _usdcRefunds
    ) external onlyOwner {
        require(
            _addresses.length == _tokenAllocations.length &&
                _addresses.length == _usdcRefunds.length,
            "Array lengths must match"
        );

        for (uint256 i = 0; i < _addresses.length; i++) {
            require(_addresses[i] != address(0), "Invalid address");
            require(amountInvested[_addresses[i]] > 0, "Address did not invest");

            tokenAllocation[_addresses[i]] = _tokenAllocations[i];
            usdcRefund[_addresses[i]] = _usdcRefunds[i];
        }

        emit AllocationsSet(_addresses, _tokenAllocations, _usdcRefunds);
    }

    /**
     * @dev Withdraw all collected USDC after the sale (admin only)
     */
    function withdrawFunds() external onlyOwner onlyAfterSale {
        uint256 amount = usdcToken.balanceOf(address(this));
        require(amount > 0, "No funds to withdraw");

        usdcToken.safeTransfer(owner(), amount);

        emit FundsWithdrawn(amount);
    }

    // ************************************
    // ********** View Functions **********
    // ************************************

    /**
     * @dev Get user investment information
     * @param user Address of the user
     * @return amountInvested_ USDC deposited by user
     * @return stakedSnapshot_ Staked balance at deposit time
     * @return tokenAllocation_ Final token allocation
     * @return usdcRefund_ Final USDC refund amount
     */
    function getUserInfo(
        address user
    )
        external
        view
        returns (
            uint256 amountInvested_,
            uint256 stakedSnapshot_,
            uint256 tokenAllocation_,
            uint256 usdcRefund_
        )
    {
        return (
            amountInvested[user],
            stakedSnapshot[user],
            tokenAllocation[user],
            usdcRefund[user]
        );
    }

    /**
     * @dev Get total amount invested across all users
     * @return Total USDC invested
     */
    function getTotalInvested() external view returns (uint256) {
        return totalInvested;
    }

    /**
     * @dev Get sale timing information
     * @return saleStart_ Sale start timestamp
     * @return saleEnd_ Sale end timestamp
     * @return saleDuration_ Sale duration in seconds
     */
    function getSaleTimes()
        external
        view
        returns (
            uint256 saleStart_,
            uint256 saleEnd_,
            uint256 saleDuration_
        )
    {
        return (saleStart, saleEnd, saleDuration);
    }

    /**
     * @dev Check if sale is currently active
     * @return true if sale is active, false otherwise
     */
    function isSaleActive() external view returns (bool) {
        return saleStart > 0 && block.timestamp >= saleStart && block.timestamp <= saleEnd;
    }

    /**
     * @dev Get all investors with their complete information (paginated)
     * @param offset Starting index for pagination
     * @param limit Maximum number of investors to return
     * @return Array of InvestorInfo structs
     */
    function getAllInvestors(
        uint256 offset,
        uint256 limit
    ) external view returns (InvestorInfo[] memory) {
        uint256 investorsLength = investors.length;

        // If offset is beyond the array length, return empty array
        if (offset >= investorsLength) {
            return new InvestorInfo[](0);
        }

        // Calculate actual limit (don't exceed array bounds)
        uint256 actualLimit = limit;
        if (offset + limit > investorsLength) {
            actualLimit = investorsLength - offset;
        }

        InvestorInfo[] memory result = new InvestorInfo[](actualLimit);

        for (uint256 i = 0; i < actualLimit; i++) {
            address investor = investors[offset + i];
            result[i] = InvestorInfo({
                investor: investor,
                amountInvested: amountInvested[investor],
                stakedSnapshot: stakedSnapshot[investor],
                tokenAllocation: tokenAllocation[investor],
                usdcRefund: usdcRefund[investor]
            });
        }

        return result;
    }

}
