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
}
