// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStaking} from "./interfaces/IStaking.sol";

/**
 * @title Staking
 * @dev Staking contract for $ROOM tokens with 2-week lock period
 * Features:
 * - Unlimited number of positions per user
 * - Each stake creates a unique position with positionId
 * - 2-week lock period for unstaked tokens
 * - Restake function to return pending tokens to active staking
 */
contract Staking is ReentrancyGuard, IStaking {
    using SafeERC20 for IERC20;

    IERC20 public immutable roomToken;

    uint256 public constant COOLDOWN_PERIOD = 5 minutes;
    uint256 public nextPositionId = 1;

    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;
    mapping(address => uint256) public totalStaked;

    address[] public stakers;

    modifier onlyPositionOwner(uint256 positionId) {
        require(
            positions[positionId].owner == msg.sender,
            "Not position owner"
        );
        _;
    }

    modifier positionExists(uint256 positionId) {
        require(
            positions[positionId].owner != address(0),
            "Position does not exist"
        );
        _;
    }

    constructor(address _roomToken) {
        require(_roomToken != address(0), "ROOM token address cannot be zero");
        roomToken = IERC20(_roomToken);
    }

    /**
     * @dev Stake tokens and create a new position
     * @param amount Amount of tokens to stake
     * @return positionId The ID of the created position
     */
    function stake(uint256 amount) external nonReentrant returns (uint256) {
        require(amount > 0, "Amount must be greater than zero");
        roomToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 positionId = nextPositionId++;
        positions[positionId] = Position({
            positionId: positionId,
            owner: msg.sender,
            amount: amount,
            unlockTime: 0,
            stakeTime: block.timestamp,
            status: PositionStatus.Active
        });

        userPositions[msg.sender].push(positionId);
        totalStaked[msg.sender] += amount;

        stakers.push(msg.sender);

        emit PositionCreated(positionId, msg.sender, amount, block.timestamp);

        return positionId;
    }

    /**
     * @dev Unstake tokens from a position (starts lock period)
     * @param positionId ID of the position to unstake
     */
    function unstake(
        uint256 positionId
    )
        external
        positionExists(positionId)
        onlyPositionOwner(positionId)
        nonReentrant
    {
        Position storage position = positions[positionId];
        require(
            position.status == PositionStatus.Active,
            "Position not active"
        );

        position.status = PositionStatus.Pending;
        position.unlockTime = block.timestamp + COOLDOWN_PERIOD;

        totalStaked[msg.sender] -= position.amount;

        emit PositionUnstaked(
            positionId,
            msg.sender,
            position.amount,
            position.unlockTime
        );
    }

    /**
     * @dev Claim tokens after lock period has ended
     * @param positionId ID of the position to claim
     */
    function claim(
        uint256 positionId
    )
        external
        positionExists(positionId)
        onlyPositionOwner(positionId)
        nonReentrant
    {
        Position storage position = positions[positionId];
        require(
            position.status == PositionStatus.Pending,
            "Position not pending"
        );
        require(
            block.timestamp >= position.unlockTime,
            "Lock period not ended"
        );

        uint256 amount = position.amount;
        position.status = PositionStatus.Claimed;

        roomToken.safeTransfer(msg.sender, amount);

        emit PositionClaimed(positionId, msg.sender, amount);
    }

    /**
     * @dev Restake tokens from a pending position (cancels lock period)
     * @param positionId ID of the position to restake
     */
    function restake(
        uint256 positionId
    )
        external
        positionExists(positionId)
        onlyPositionOwner(positionId)
        nonReentrant
    {
        Position storage position = positions[positionId];
        require(
            position.status == PositionStatus.Pending,
            "Position not pending"
        );

        position.status = PositionStatus.Active;
        position.unlockTime = 0;

        totalStaked[msg.sender] += position.amount;

        emit PositionRestaked(positionId, msg.sender, position.amount);
    }

    function getAllStakersWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        address[] memory result = new address[](limit);

        for (uint256 i = offset; i < offset + limit; i++) {
            result[i - offset] = stakers[i];
        }

        return result;
    }

    function getAllPositionsByStatusWithPagination(
        PositionStatus status,
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory) {
        Position[] memory result = new Position[](limit);

        for (uint256 i = offset; i < offset + limit; i++) {
            Position storage position = positions[i];
            if (position.status == status) {
                result[i - offset] = position;
            }
        }

        return result;
    }

    function getAllPositionsWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory) {
        Position[] memory result = new Position[](limit);

        for (uint256 i = offset; i < offset + limit; i++) {
            result[i - offset] = positions[i];
        }

        return result;
    }

    function getUserPositionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        uint256[] storage allPositions = userPositions[user];
        uint256 length = allPositions.length;

        if (offset >= length) {
            return new uint256[](0);
        }

        uint256 end = offset + limit;
        if (end > length) {
            end = length;
        }

        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allPositions[i];
        }

        return result;
    }

    function getUserPositionCount(
        address user
    ) external view returns (uint256) {
        return userPositions[user].length;
    }

    /**
     * @dev Get position details
     * @param positionId ID of the position
     * @return Position struct
     */
    function getPosition(
        uint256 positionId
    ) external view returns (Position memory) {
        return positions[positionId];
    }

    /**
     * @dev Get user's total staked amount
     * @param user Address of the user
     * @return Total staked amount
     */
    function getUserTotalStaked(address user) external view returns (uint256) {
        return totalStaked[user];
    }

    /**
     * @dev Get time remaining until position can be claimed
     * @param positionId ID of the position
     * @return Time remaining in seconds (0 if not pending or already unlockable)
     */
    function getTimeUntilUnlock(
        uint256 positionId
    ) external view returns (uint256) {
        Position memory position = positions[positionId];
        if (position.status != PositionStatus.Pending) {
            return 0;
        }
        if (block.timestamp >= position.unlockTime) {
            return 0;
        }
        return position.unlockTime - block.timestamp;
    }

    /**
     * @dev Check if position can be claimed
     * @param positionId ID of the position
     * @return True if position can be claimed
     */
    function canClaim(uint256 positionId) external view returns (bool) {
        Position memory position = positions[positionId];
        return
            position.status == PositionStatus.Pending &&
            block.timestamp >= position.unlockTime;
    }
}
