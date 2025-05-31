// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BackroomPresale
 * @dev Presale contract for Backroom token with ETH contributions
 * Features:
 * - 24-hour contribution window
 * - One contribution per address
 * - Soft cap / Hard cap mechanics
 * - Min/Max contribution limits
 * - Refund mechanism for failed sales
 */
contract BackroomPresale is Ownable, ReentrancyGuard {
    // Sale Parameters
    uint256 public softCap; // Minimum ETH to raise for success
    uint256 public hardCap; // Maximum ETH before early close
    uint256 public minContribution; // Minimum ETH per address
    uint256 public maxContribution; // Maximum ETH per address

    // Sale State
    uint256 public saleStartTime; // When sale begins
    uint256 public saleEndTime; // When sale ends (24h after start)
    uint256 public totalRaised; // Total ETH raised
    bool public saleActive; // Is sale currently active
    bool public saleFinalized; // Has sale been finalized
    bool public saleSuccessful; // Did sale meet soft cap

    // Constants
    uint256 public constant SALE_DURATION = 24 hours;

    // Participant tracking
    mapping(address => uint256) public contributions; // ETH contributed per address
    mapping(address => bool) public hasContributed; // Track if address contributed
    mapping(address => bool) public hasRefunded; // Track refund claims

    address[] public contributors; // Array of all contributors

    // Events
    event SaleStarted(uint256 startTime, uint256 endTime);
    event ContributionMade(address indexed contributor, uint256 amount);
    event SaleFinalized(bool successful, uint256 totalRaised);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event FundsWithdrawn(uint256 amount);

    // Modifiers
    modifier onlyDuringSale() {
        require(saleActive, "Sale not active");
        require(block.timestamp >= saleStartTime, "Sale not started");
        require(block.timestamp <= saleEndTime, "Sale ended");
        require(totalRaised < hardCap, "Hard cap reached");
        _;
    }

    modifier onlyAfterSale() {
        require(saleFinalized, "Sale not finalized");
        _;
    }

    constructor(
        uint256 _softCap,
        uint256 _hardCap,
        uint256 _minContribution,
        uint256 _maxContribution
    ) Ownable(msg.sender) {
        require(_softCap > 0, "Soft cap must be > 0");
        require(_hardCap > _softCap, "Hard cap must be > soft cap");
        require(_minContribution > 0, "Min contribution must be > 0");
        require(
            _maxContribution >= _minContribution,
            "Max must be >= min contribution"
        );
        require(
            _maxContribution <= _hardCap,
            "Max contribution cannot exceed hard cap"
        );

        softCap = _softCap;
        hardCap = _hardCap;
        minContribution = _minContribution;
        maxContribution = _maxContribution;
    }

    /**
     * @dev Start the presale (admin only)
     */
    function startSale() external onlyOwner {
        require(!saleActive, "Sale already active");
        require(!saleFinalized, "Sale already finalized");

        saleActive = true;
        saleStartTime = block.timestamp;
        saleEndTime = block.timestamp + SALE_DURATION;

        emit SaleStarted(saleStartTime, saleEndTime);
    }

    /**
     * @dev Contribute ETH to the presale
     */
    function contribute() external payable onlyDuringSale nonReentrant {
        require(msg.value >= minContribution, "Below minimum contribution");
        require(!hasContributed[msg.sender], "Already contributed");
        require(msg.value <= maxContribution, "Exceeds maximum contribution");
        require(totalRaised + msg.value <= hardCap, "Would exceed hard cap");

        // Record contribution
        contributions[msg.sender] = msg.value;
        hasContributed[msg.sender] = true;
        contributors.push(msg.sender);
        totalRaised += msg.value;

        emit ContributionMade(msg.sender, msg.value);

        // Auto-finalize if hard cap reached
        if (totalRaised >= hardCap) {
            _finalizeSale();
        }
    }

    /**
     * @dev Finalize the sale after 24 hours or when hard cap is reached
     */
    function finalizeSale() external {
        require(saleActive, "Sale not active");
        require(!saleFinalized, "Sale already finalized");
        require(
            block.timestamp > saleEndTime || totalRaised >= hardCap,
            "Sale period not ended and hard cap not reached"
        );

        _finalizeSale();
    }

    /**
     * @dev Internal function to finalize sale
     */
    function _finalizeSale() internal {
        saleActive = false;
        saleFinalized = true;
        saleSuccessful = totalRaised >= softCap;

        emit SaleFinalized(saleSuccessful, totalRaised);
    }

    /**
     * @dev Claim refund if sale failed (contributors only)
     */
    function claimRefund() external onlyAfterSale nonReentrant {
        require(!saleSuccessful, "Sale was successful, no refunds");
        require(hasContributed[msg.sender], "No contribution found");
        require(!hasRefunded[msg.sender], "Already refunded");

        uint256 refundAmount = contributions[msg.sender];
        require(refundAmount > 0, "No refund available");

        hasRefunded[msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");

        emit RefundClaimed(msg.sender, refundAmount);
    }

    /**
     * @dev Withdraw raised funds if sale was successful (admin only)
     */
    function withdrawFunds() external onlyOwner onlyAfterSale {
        require(saleSuccessful, "Sale was not successful");

        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(amount);
    }

    /**
     * @dev Emergency withdrawal function (admin only)
     */
    function emergencyWithdraw() external onlyOwner {
        require(
            !saleActive || block.timestamp > saleEndTime + 7 days,
            "Cannot emergency withdraw during active sale"
        );

        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Emergency withdrawal failed");

        emit FundsWithdrawn(amount);
    }

    // View Functions

    /**
     * @dev Get sale status information
     */
    function getSaleInfo()
        external
        view
        returns (
            bool _saleActive,
            bool _saleFinalized,
            bool _saleSuccessful,
            uint256 _totalRaised,
            uint256 _startTime,
            uint256 _endTime,
            uint256 _contributors
        )
    {
        return (
            saleActive,
            saleFinalized,
            saleSuccessful,
            totalRaised,
            saleStartTime,
            saleEndTime,
            contributors.length
        );
    }

    /**
     * @dev Get contribution info for an address
     */
    function getContributionInfo(
        address _contributor
    )
        external
        view
        returns (uint256 _contribution, bool _hasContributed, bool _hasRefunded)
    {
        return (
            contributions[_contributor],
            hasContributed[_contributor],
            hasRefunded[_contributor]
        );
    }

    /**
     * @dev Get all contributors (for off-chain token allocation calculation)
     */
    function getContributors() external view returns (address[] memory) {
        return contributors;
    }

    /**
     * @dev Get time remaining in sale
     */
    function getTimeRemaining() external view returns (uint256) {
        if (!saleActive || block.timestamp >= saleEndTime) {
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

        uint256 contributorETH = contributions[_contributor];
        if (contributorETH == 0) return 0;

        // UserTokens = (User ETH / Total ETH Raised) × Total Allocated Tokens
        return (contributorETH * _totalTokensAllocated) / totalRaised;
    }
}
