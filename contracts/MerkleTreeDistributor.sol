// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleTreeDistributor is Ownable {
    using SafeERC20 for ERC20;

    ERC20 public immutable token;
    bytes32 public merkleRoot;

    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event RootChanged(bytes32 indexed oldRoot, bytes32 indexed newRoot);

    constructor(address _token, bytes32 _merkleRoot) Ownable(msg.sender) {
        token = ERC20(_token);
        merkleRoot = _merkleRoot;
    }

    function claim(
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        require(!claimed[account], "Already claimed");

        bytes32 leaf = keccak256(abi.encodePacked(account, amount));
        require(
            MerkleProof.verify(merkleProof, merkleRoot, leaf),
            "Invalid proof"
        );

        claimed[account] = true;
        token.safeTransfer(account, amount);

        emit Claimed(account, amount);
    }

    function isClaimed(address account) external view returns (bool) {
        return claimed[account];
    }

    function changeRoot(bytes32 _newMerkleRoot) external onlyOwner {
        bytes32 oldRoot = merkleRoot;
        merkleRoot = _newMerkleRoot;

        emit RootChanged(oldRoot, _newMerkleRoot);
    }

    function withdrawRemainingTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }
}
