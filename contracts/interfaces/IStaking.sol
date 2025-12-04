// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IStaking {
    enum PositionStatus {
        None,
        Active,
        Pending,
        Claimed
    }

    struct Position {
        uint256 positionId;
        address owner;
        uint256 amount;
        uint256 unlockTime;
        uint256 stakeTime;
        PositionStatus status;
    }

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        uint256 amount,
        uint256 stakeTime
    );

    event PositionUnstaked(
        uint256 indexed positionId,
        address indexed owner,
        uint256 amount,
        uint256 unlockTime
    );

    event PositionClaimed(
        uint256 indexed positionId,
        address indexed owner,
        uint256 amount
    );

    event PositionRestaked(
        uint256 indexed positionId,
        address indexed owner,
        uint256 amount
    );

    function COOLDOWN_PERIOD() external view returns (uint256);
    function nextPositionId() external view returns (uint256);
    function totalStaked(address user) external view returns (uint256);
    function stakers(uint256 index) external view returns (address);
    function isRegistered(address user) external view returns (bool);

    function stake(uint256 amount) external returns (uint256);
    function unstake(uint256 positionId) external;
    function claim(uint256 positionId) external;
    function restake(uint256 positionId) external;

    function getAllStakersWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory);

    function getAllPositionsByStatusWithPagination(
        PositionStatus status,
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory);

    function getAllPositionsWithPagination(
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory);

    function getUserPositionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory);

    function getUserPositions(address user) external view returns (uint256[] memory);
    function getUserPositionCount(address user) external view returns (uint256);
    function getPosition(uint256 positionId) external view returns (Position memory);
    function getUserTotalStaked(address user) external view returns (uint256);
    function getTimeUntilUnlock(uint256 positionId) external view returns (uint256);
    function canClaim(uint256 positionId) external view returns (bool);
}
