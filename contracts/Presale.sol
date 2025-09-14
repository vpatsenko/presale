// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Presale
 * @dev Presale contract for Backroom token with USDC contributions
 */
contract Presale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdcToken;

    uint256 public saleStartTime;
    uint256 public saleEndTime;
    uint256 public totalRaised;
    bool public saleFinalized; // Has sale been finalized
    bool public saleSuccessful; // Was sale successful

    uint256 public constant SALE_DURATION = 24 hours;

    mapping(address => uint256) public contributions; // USDC contributed per address
    mapping(address => uint256) public whitelist; // Whitelisted addresses

    event SaleStarted(uint256 startTime, uint256 endTime);
    event ContributionMade(address indexed contributor, uint256 amount);
    event SaleFinalized(bool successful, uint256 totalRaised);
    event FundsWithdrawn(uint256 amount);
    event UserWhitelisted(address indexed user, uint256 tier);

    modifier onlyDuringSale() {
        require(saleStartTime > 0, "Sale not started");
        require(block.timestamp >= saleStartTime, "Sale not started");
        require(block.timestamp <= saleEndTime, "Sale ended");
        _;
    }

    modifier onlyAfterSale() {
        require(saleFinalized, "Sale not finalized");
        _;
    }

    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "USDC token address cannot be zero");

        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @dev Add multiple users to whitelist (admin only)
     */
    function addMultipleToWhitelist(
        address[] calldata _users,
        uint256[] calldata _tiers
    ) external onlyOwner {
        require(
            _users.length == _tiers.length,
            "Users and tiers must have the same length"
        );
        for (uint256 i = 0; i < _users.length; i++) {
            require(_users[i] != address(0), "Invalid address");

            whitelist[_users[i]] = _tiers[i];
            emit UserWhitelisted(_users[i], _tiers[i]);
        }
    }

    /**
     * @dev Start the presale (admin only)
     */
    function startSale() external onlyOwner {
        require(
            block.timestamp > saleEndTime || saleStartTime == 0,
            "Sale already active or finalized"
        );
        require(!saleFinalized, "Sale already finalized");

        saleStartTime = block.timestamp;
        saleEndTime = block.timestamp + SALE_DURATION;

        emit SaleStarted(saleStartTime, saleEndTime);
    }

    /**
     * @dev Contribute USDC to the presale
     */
    function deposit(uint256 _amount) external onlyDuringSale nonReentrant {
        require(whitelist[msg.sender] > 0, "Address not whitelisted");
        require(
            contributions[msg.sender] <= whitelist[msg.sender],
            "Already contributed full amount"
        );
        require(
            _amount <= whitelist[msg.sender],
            "Amount must be less than or equal to whitelist"
        );

        // Transfer USDC from user to this contract
        usdcToken.safeTransferFrom(msg.sender, address(this), _amount);

        contributions[msg.sender] += _amount;
        totalRaised += _amount;

        emit ContributionMade(msg.sender, _amount);
    }

    /**
     * @dev Finalize the sale after 24 hours
     */
    function finalizeSale() external {
        require(!saleFinalized, "Sale already finalized");
        require(
            block.timestamp > saleEndTime,
            "Sale period not ended and hard cap not reached"
        );

        saleFinalized = true;
        saleSuccessful = true;

        emit SaleFinalized(saleSuccessful, totalRaised);
    }

    /**
     * @dev Withdraw raised funds if sale was successful (admin only)
     */
    function withdrawFunds() external onlyOwner onlyAfterSale {
        require(saleSuccessful, "Sale was not successful");

        uint256 amount = usdcToken.balanceOf(address(this));
        require(amount > 0, "No funds to withdraw");

        usdcToken.safeTransfer(owner(), amount);

        emit FundsWithdrawn(amount);
    }
    // ************************************
    // ********** View Functions **********
    // ************************************

    /**
     * @dev Get sale status information
     */
    function getSaleInfo()
        external
        view
        returns (
            bool _saleFinalized,
            bool _saleSuccessful,
            uint256 _totalRaised,
            uint256 _startTime,
            uint256 _endTime
        )
    {
        return (
            saleFinalized,
            saleSuccessful,
            totalRaised,
            saleStartTime,
            saleEndTime
        );
    }

    /**
     * @dev Get contribution info for an address
     */
    function getContributionInfo(
        address _contributor
    ) external view returns (uint256 _contribution, bool _isWhitelisted) {
        return (contributions[_contributor], whitelist[_contributor] > 0);
    }

    /**
     * @dev Get time remaining in sale
     */
    function getTimeRemaining() external view returns (uint256) {
        if (saleStartTime == 0 || block.timestamp >= saleEndTime) {
            return 0;
        }
        return saleEndTime - block.timestamp;
    }

    /**
     * @dev Calculate token allocation for a contributor (view only, for off-chain reference)
     * @param _contributor Address to calculate for
     * @param _totalTokensAllocated Total tokens allocated to presale (e.g., 5% of supply)
     */
    function calculateTokenAllocation(
        address _contributor,
        uint256 _totalTokensAllocated
    ) external view returns (uint256) {
        require(
            saleFinalized && saleSuccessful,
            "Sale not successfully finalized"
        );
        require(totalRaised > 0, "No contributions");

        uint256 contributorUSDC = contributions[_contributor];
        if (contributorUSDC == 0) return 0;

        // UserTokens = (User USDC / Total USDC Raised) × Total Allocated Tokens
        return (contributorUSDC * _totalTokensAllocated) / totalRaised;
    }
}
