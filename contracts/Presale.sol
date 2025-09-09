// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BackroomPresale
 * @dev Presale contract for Backroom token with USDC contributions
 */
contract BackroomPresale is Ownable, ReentrancyGuard {
    IERC20 public immutable usdcToken;

    uint256 public softCap;
    uint256 public hardCap;
    uint256 public minContribution;
    uint256 public maxContribution;

    uint256 public saleStartTime;
    uint256 public saleEndTime;
    uint256 public totalRaised;
    bool public saleFinalized; // Has sale been finalized
    bool public saleSuccessful; // Did sale meet soft cap

    uint256 public constant SALE_DURATION = 24 hours;

    mapping(address => uint256) public contributions; // USDC contributed per address
    mapping(address => bool) public whitelist; // Whitelisted addresses

    event SaleStarted(uint256 startTime, uint256 endTime);
    event ContributionMade(address indexed contributor, uint256 amount);
    event SaleFinalized(bool successful, uint256 totalRaised);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event FundsWithdrawn(uint256 amount);
    event UserWhitelisted(address indexed user);

    modifier onlyDuringSale() {
        require(saleStartTime > 0, "Sale not started");
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
        address _usdcToken,
        uint256 _softCap,
        uint256 _hardCap,
        uint256 _minContribution,
        uint256 _maxContribution
    ) Ownable(msg.sender) {
        require(_usdcToken != address(0), "USDC token address cannot be zero");
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

        usdcToken = IERC20(_usdcToken);
        softCap = _softCap;
        hardCap = _hardCap;
        minContribution = _minContribution;
        maxContribution = _maxContribution;
    }

    /**
     * @dev Add multiple users to whitelist (admin only)
     */
    function addMultipleToWhitelist(
        address[] calldata _users
    ) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            require(_users[i] != address(0), "Invalid address");
            whitelist[_users[i]] = true;
            emit UserWhitelisted(_users[i]);
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
        require(whitelist[msg.sender], "Address not whitelisted");
        require(_amount >= minContribution, "Below minimum contribution");
        require(contributions[msg.sender] == 0, "Already contributed");
        require(_amount <= maxContribution, "Exceeds maximum contribution");
        require(totalRaised + _amount <= hardCap, "Would exceed hard cap");

        // Transfer USDC from user to this contract
        require(
            usdcToken.transferFrom(msg.sender, address(this), _amount),
            "USDC transfer failed"
        );

        contributions[msg.sender] = _amount;
        totalRaised += _amount;

        emit ContributionMade(msg.sender, _amount);

        if (totalRaised >= hardCap) {
            _finalizeSale();
        }
    }

    /**
     * @dev Finalize the sale after 24 hours or when hard cap is reached
     */
    function finalizeSale() external {
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
        saleFinalized = true;
        saleSuccessful = totalRaised >= softCap;

        emit SaleFinalized(saleSuccessful, totalRaised);
    }

    /**
     * @dev Claim refund if sale failed (contributors only)
     */
    function claimRefund() external onlyAfterSale nonReentrant {
        require(!saleSuccessful, "Sale was successful, no refunds");

        uint256 refundAmount = contributions[msg.sender];
        require(refundAmount > 0, "No contribution found");

        contributions[msg.sender] = 0;

        require(
            usdcToken.transfer(msg.sender, refundAmount),
            "USDC refund transfer failed"
        );

        emit RefundClaimed(msg.sender, refundAmount);
    }

    /**
     * @dev Withdraw raised funds if sale was successful (admin only)
     */
    function withdrawFunds() external onlyOwner onlyAfterSale {
        require(saleSuccessful, "Sale was not successful");

        uint256 amount = usdcToken.balanceOf(address(this));
        require(amount > 0, "No funds to withdraw");

        require(usdcToken.transfer(owner(), amount), "USDC withdrawal failed");

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
        return (contributions[_contributor], whitelist[_contributor]);
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
