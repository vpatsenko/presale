// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStaking} from "./interfaces/IStaking.sol";
import {IPresale} from "./interfaces/IPresale.sol";

/**
 * @title Presale
 * @dev Presale contract for Backroom token with USDC contributions
 * Features staking-based multipliers and oversubscription handling
 */
contract Presale is IPresale, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================
    // Constants
    // ============================================

    uint256 public constant SCALE = 1e18; // Fixed-point math scale for precision
    uint256 public constant MULTIPLIER_BASE = 1_000_000; // Base for multiplier: M_i = 1 + (staked_i / MULTIPLIER_BASE)

    // ============================================
    // Immutable State
    // ============================================

    IERC20 public immutable usdcToken;
    IStaking public immutable stakingContract; // Staking contract to get staked amounts for multipliers

    // ============================================
    // Sale State Variables
    // ============================================
    IERC20 public allocationToken; // Token to distribute as allocations

    uint256 public saleDuration; // Configurable sale duration (in seconds)
    uint256 public saleStartTime;
    uint256 public saleEndTime;
    uint256 public totalRaised;
    bool public saleFinalized;

    mapping(address => uint256) public contributions; // USDC contributed per address
    mapping(address => uint256) public whitelist; // Whitelisted addresses with tier limits
    mapping(address => bool) public hasClaimedAllocation; // Track who has claimed their allocation

    uint256 public hardCap; // Sale hard cap (H in formula)
    uint256 public normalizationSum; // Normalization sum S = Σ (C_i / R_i) from off-chain
    uint256 public normalizationFactor; // Normalization factor K = H / S (in fixed-point)
    bool public isAllocationSettled; // Whether allocation has been settled

    // ============================================
    // Modifiers
    // ============================================

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

    // ============================================
    // Constructor
    // ============================================

    constructor(address _usdcToken, address _stakingContract) Ownable(msg.sender) {
        require(_usdcToken != address(0), "USDC token address cannot be zero");
        require(_stakingContract != address(0), "Staking contract address cannot be zero");

        usdcToken = IERC20(_usdcToken);
        stakingContract = IStaking(_stakingContract);
    }

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

    // ============================================
    // Sale Management
    // ============================================

    /**
     * @dev Initialize allocation parameters and start the presale (admin only)
     * This function combines initialization and sale start into a single transaction
     * @param _allocationToken Address of the token to distribute as allocations
     * @param _hardCap Sale hard cap (H in formula)
     * @param _saleDuration Duration of the sale in seconds
     */
    function initializeAndStartSale(
        address _allocationToken,
        uint256 _hardCap,
        uint256 _saleDuration
    ) external onlyOwner {
        // Validation for allocation parameters
        require(_allocationToken != address(0), "Allocation token cannot be zero");
        require(_hardCap > 0, "Hard cap must be greater than zero");
        require(!isAllocationSettled, "Allocation already settled");

        // Validation for sale start
        require(
            block.timestamp > saleEndTime || saleStartTime == 0,
            "Sale already active or finalized"
        );
        require(!saleFinalized, "Sale already finalized");
        require(_saleDuration > 0, "Sale duration must be greater than zero");

        // Initialize allocation parameters
        allocationToken = IERC20(_allocationToken);
        hardCap = _hardCap;

        // Start the sale
        saleDuration = _saleDuration;
        saleStartTime = block.timestamp;
        saleEndTime = block.timestamp + _saleDuration;

        emit SaleStarted(saleStartTime, saleEndTime);
    }

    /**
     * @dev Contribute USDC to the presale
     * @param _amount Amount of USDC to contribute
     */
    function deposit(uint256 _amount) external onlyDuringSale nonReentrant {
        require(whitelist[msg.sender] > 0, "Address not whitelisted");
        require(
            contributions[msg.sender] + _amount <= whitelist[msg.sender],
            "Would exceed whitelist tier limit"
        );
        require(_amount > 0, "Amount must be greater than zero");

        usdcToken.safeTransferFrom(msg.sender, address(this), _amount);

        contributions[msg.sender] += _amount;
        totalRaised += _amount;

        emit ContributionMade(msg.sender, _amount);
    }

    /**
     * @dev Finalize the sale after sale period ends
     */
    function finalizeSale() external {
        require(!saleFinalized, "Sale already finalized");
        require(block.timestamp > saleEndTime, "Sale period has not ended");

        saleFinalized = true;

        emit SaleFinalized(true, totalRaised);
    }

    /**
     * @dev Withdraw raised funds after sale is finalized (admin only)
     */
    function withdrawFunds() external onlyOwner onlyAfterSale {
        uint256 amount = usdcToken.balanceOf(address(this));
        require(amount > 0, "No funds to withdraw");

        usdcToken.safeTransfer(owner(), amount);

        emit FundsWithdrawn(amount);
    }

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
        )
    {
        return (
            saleFinalized,
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

    // ============================================
    // Allocation Management (with Multipliers)
    // ============================================

    /**
     * @dev Set normalization sum from off-chain calculation (admin only)
     * Should be called after calculating S = Σ (C_i / R_i) off-chain
     * @param _normalizationSum The normalization sum S calculated off-chain
     */
    function setNormalizationSum(uint256 _normalizationSum) external onlyOwner {
        require(_normalizationSum > 0, "Normalization sum must be greater than zero");
        require(hardCap > 0, "Allocation not initialized");
        require(!isAllocationSettled, "Allocation already settled");
        require(saleFinalized, "Sale must be finalized first");

        normalizationSum = _normalizationSum;

        // Calculate normalization factor: K = H / S (stored in fixed-point)
        normalizationFactor = (hardCap * SCALE) / _normalizationSum;

        isAllocationSettled = true;

        emit NormalizationSumSet(_normalizationSum, normalizationFactor);
        emit AllocationSettled(hardCap, totalRaised, _normalizationSum);
    }

    // ============================================
    // Allocation Calculation Helpers
    // ============================================

    /**
     * @dev Get user's staked amount from Staking contract
     * @param user Address of the user
     * @return Staked amount
     */
    function getUserStaked(address user) public view returns (uint256) {
        return stakingContract.totalStaked(user);
    }

    /**
     * @dev Calculate user's multiplier based on staked amount
     * Formula: M_i = 1 + (staked_i / MULTIPLIER_BASE)
     * @param user Address of the user
     * @return Multiplier in 1e18 scale (e.g., 1.5 = 1.5e18)
     */
    function calculateMultiplier(address user) public view returns (uint256) {
        uint256 staked = getUserStaked(user);
        // M_i = SCALE + (staked * SCALE) / MULTIPLIER_BASE
        return SCALE + (staked * SCALE) / MULTIPLIER_BASE;
    }

    // ============================================
    // Allocation Calculation & Claiming
    // ============================================

    /**
     * @dev Calculate user's presale allocation on-demand using multiplier-based formula
     * Formula: A_i = (C_i / R_i) * K
     * Where:
     *   - C_i = user's commitment (contribution)
     *   - R_i = 1 + (R - 1) / M_i (personal softened oversubscription factor)
     *   - R = T / H (global oversubscription factor)
     *   - M_i = 1 + (staked_i / MULTIPLIER_BASE) (user's multiplier)
     *   - K = H / S (normalization factor)
     * @param user Address of the user
     * @return Allocation amount
     */
    function calculateAllocation(address user) public view returns (uint256) {
        require(isAllocationSettled, "Allocation not settled");

        uint256 commitment = contributions[user];
        if (commitment == 0) {
            return 0;
        }

        // If not oversubscribed, everyone gets 100% of their commitment
        if (totalRaised <= hardCap) {
            return commitment;
        }

        // Calculate global oversubscription factor: R = T / H (in fixed-point)
        uint256 R = (totalRaised * SCALE) / hardCap;

        // Get user's multiplier
        uint256 multiplier = calculateMultiplier(user);
        require(multiplier >= SCALE, "Invalid multiplier");

        // Calculate personal softened oversubscription factor: R_i = 1 + (R - 1) / M_i
        // In fixed-point: R_i = SCALE + ((R - SCALE) * SCALE) / M_i
        uint256 Ri = SCALE + ((R - SCALE) * SCALE) / multiplier;

        // Calculate C_i / R_i in fixed-point
        uint256 CiDivRi = (commitment * SCALE) / Ri;

        // Final allocation: A_i = (C_i / R_i) * K
        uint256 allocation = (CiDivRi * normalizationFactor) / SCALE;

        return allocation;
    }

    /**
     * @dev Claim presale allocation tokens
     * Calculates allocation on-demand and transfers tokens to user
     */
    function claimAllocation() external nonReentrant onlyAfterSale {
        require(isAllocationSettled, "Allocation not settled");
        require(!hasClaimedAllocation[msg.sender], "Already claimed");

        uint256 allocation = calculateAllocation(msg.sender);
        require(allocation > 0, "No allocation to claim");

        hasClaimedAllocation[msg.sender] = true;
        allocationToken.safeTransfer(msg.sender, allocation);

        emit AllocationClaimed(msg.sender, allocation);
    }

    // ============================================
    // Allocation View Functions
    // ============================================

    /**
     * @dev Get user's allocation without claiming
     * @param user Address of the user
     * @return Allocation amount (0 if already claimed or not settled)
     */
    function getUserAllocation(address user) external view returns (uint256) {
        if (!isAllocationSettled || hasClaimedAllocation[user]) {
            return 0;
        }
        return calculateAllocation(user);
    }

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
        )
    {
        return (
            address(stakingContract),
            address(allocationToken),
            hardCap,
            totalRaised,
            normalizationSum,
            normalizationFactor,
            isAllocationSettled
        );
    }
}
