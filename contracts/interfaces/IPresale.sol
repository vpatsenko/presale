// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title IPresale
 * @dev Interface for Presale contract
 * Features staking-based multipliers and oversubscription handling
 */
interface IPresale {
    // ============================================
    // Events
    // ============================================

    event SaleStarted(uint256 startTime, uint256 endTime);
    event ContributionMade(address indexed contributor, uint256 amount);
    event SaleFinalized(bool successful, uint256 totalRaised);
    event FundsWithdrawn(uint256 amount);
    event UserWhitelisted(address indexed user, uint256 tier);
    event NormalizationSumSet(uint256 normalizationSum, uint256 normalizationFactor);
    event AllocationClaimed(address indexed user, uint256 allocation);
    event AllocationSettled(uint256 hardCap, uint256 totalCommitted, uint256 normalizationSum);

    // ============================================
    // Whitelist Management
    // ============================================

    /**
     * @dev Add multiple users to whitelist (admin only)
     * @param _users Array of user addresses to whitelist
     * @param _tiers Array of tier limits (max contribution per user)
     */
    function addMultipleToWhitelist(
        address[] calldata _users,
        uint256[] calldata _tiers
    ) external;

    // ============================================
    // Sale Management
    // ============================================

    /**
     * @dev Initialize allocation parameters and start the presale (admin only)
     * @param _allocationToken Address of the token to distribute as allocations
     * @param _hardCap Sale hard cap (H in formula)
     * @param _saleDuration Duration of the sale in seconds
     */
    function initializeAndStartSale(
        address _allocationToken,
        uint256 _hardCap,
        uint256 _saleDuration
    ) external;

    /**
     * @dev Contribute USDC to the presale
     * @param _amount Amount of USDC to contribute
     */
    function deposit(uint256 _amount) external;

    /**
     * @dev Finalize the sale after sale period ends
     */
    function finalizeSale() external;

    /**
     * @dev Withdraw raised funds if sale was successful (admin only)
     */
    function withdrawFunds() external;

    // ============================================
    // Sale View Functions
    // ============================================

    /**
     * @dev Get sale status information
     */
    function getSaleInfo()
        external
        view
        returns (
            bool _saleFinalized,
            uint256 _totalRaised,
            uint256 _startTime,
            uint256 _endTime
        );

    /**
     * @dev Get contribution info for an address
     * @param _contributor Address to check
     * @return _contribution Amount contributed
     * @return _isWhitelisted Whether address is whitelisted
     */
    function getContributionInfo(
        address _contributor
    ) external view returns (uint256 _contribution, bool _isWhitelisted);

    /**
     * @dev Get time remaining in sale
     * @return Time remaining in seconds (0 if sale not started or ended)
     */
    function getTimeRemaining() external view returns (uint256);

    // ============================================
    // Allocation Management
    // ============================================

    /**
     * @dev Set normalization sum from off-chain calculation (admin only)
     * @param _normalizationSum The normalization sum S calculated off-chain
     */
    function setNormalizationSum(uint256 _normalizationSum) external;

    // ============================================
    // Allocation Calculation & Claiming
    // ============================================

    /**
     * @dev Calculate user's presale allocation on-demand using multiplier-based formula
     * @param user Address of the user
     * @return Allocation amount
     */
    function calculateAllocation(address user) external view returns (uint256);

    /**
     * @dev Claim presale allocation tokens
     */
    function claimAllocation() external;

    /**
     * @dev Get user's allocation without claiming
     * @param user Address of the user
     * @return Allocation amount (0 if already claimed or not settled)
     */
    function getUserAllocation(address user) external view returns (uint256);

    /**
     * @dev Get all allocation parameters (view function)
     * @return _stakingContract Address of the staking contract
     * @return _allocationToken Address of the allocation token
     * @return _hardCap Sale hard cap
     * @return _totalCommitted Total amount committed in sale
     * @return _normalizationSum Normalization sum S
     * @return _normalizationFactor Normalization factor K
     * @return _isSettled Whether allocation has been settled
     */
    function getAllocationInfo()
        external
        view
        returns (
            address _stakingContract,
            address _allocationToken,
            uint256 _hardCap,
            uint256 _totalCommitted,
            uint256 _normalizationSum,
            uint256 _normalizationFactor,
            bool _isSettled
        );
}
