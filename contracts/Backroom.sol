// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Backroom is Ownable {
    using SafeERC20 for ERC20;

    address public protocolFeeDestination;
    uint256 public protocolFeePercent;
    uint256 public subjectFeePercent;

    address public token;

    uint256 public multiplier1;
    uint256 public multiplier2;
    uint256 public multiplier3;

    // SharesSubject => Curve Index (1, 2, or 3)
    mapping(address => uint256) public subjectCurve;

    event Trade(
        address trader,
        address subject,
        bool isBuy,
        uint256 shareAmount,
        uint256 tokenAmount,
        uint256 protocolTokenAmount,
        uint256 subjectTokenAmount,
        uint256 supply,
        uint256 multiplier
    );

    // SharesSubject => (Holder => Balance)
    mapping(address => mapping(address => uint256)) public sharesBalance;

    // SharesSubject => Supply
    mapping(address => uint256) public sharesSupply;

    constructor(
        address _feeDestination,
        uint256 _protocolFeePercent,
        uint256 _subjectFeePercent,
        address _token,
        uint256 _multiplier1,
        uint256 _multiplier2,
        uint256 _multiplier3
    ) Ownable(msg.sender) {
        require(_multiplier1 > 0, "Multiplier1 cannot be zero");
        require(_multiplier2 > 0, "Multiplier2 cannot be zero");
        require(_multiplier3 > 0, "Multiplier3 cannot be zero");

        protocolFeeDestination = _feeDestination;
        protocolFeePercent = _protocolFeePercent;
        subjectFeePercent = _subjectFeePercent;
        token = _token;
        multiplier1 = _multiplier1;
        multiplier2 = _multiplier2;
        multiplier3 = _multiplier3;
    }

    function setFeeDestination(address _feeDestination) public onlyOwner {
        protocolFeeDestination = _feeDestination;
    }

    function setProtocolFeePercent(uint256 _feePercent) public onlyOwner {
        protocolFeePercent = _feePercent;
    }

    function setSubjectFeePercent(uint256 _feePercent) public onlyOwner {
        subjectFeePercent = _feePercent;
    }

    function getPrice(
        uint256 supply,
        uint256 amount,
        address sharesSubject
    ) public view returns (uint256) {
        uint256 sum1 = supply == 0
            ? 0
            : ((supply - 1) * (supply) * (2 * (supply - 1) + 1)) / 6;
        uint256 sum2 = supply == 0 && amount == 1
            ? 0
            : ((supply - 1 + amount) *
                (supply + amount) *
                (2 * (supply - 1 + amount) + 1)) / 6;
        uint256 summation = sum2 - sum1;

        uint256 multiplier;
        uint256 curveIndex = subjectCurve[sharesSubject];
        if (curveIndex == 1) {
            multiplier = multiplier1;
        } else if (curveIndex == 2) {
            multiplier = multiplier2;
        } else if (curveIndex == 3) {
            multiplier = multiplier3;
        } else {
            multiplier = multiplier1; // Default to first curve
        }

        return (summation * 1 ether) * multiplier;
    }

    function getBuyPrice(
        address sharesSubject,
        uint256 amount
    ) public view returns (uint256) {
        return getPrice(sharesSupply[sharesSubject], amount, sharesSubject);
    }

    function getSellPrice(
        address sharesSubject,
        uint256 amount
    ) public view returns (uint256) {
        return
            getPrice(
                sharesSupply[sharesSubject] - amount,
                amount,
                sharesSubject
            );
    }

    function getBuyPriceAfterFee(
        address sharesSubject,
        uint256 amount
    ) public view returns (uint256) {
        uint256 price = getBuyPrice(sharesSubject, amount);
        uint256 protocolFee = (price * protocolFeePercent) / 1 ether;
        uint256 subjectFee = (price * subjectFeePercent) / 1 ether;
        return price + protocolFee + subjectFee;
    }

    function getSellPriceAfterFee(
        address sharesSubject,
        uint256 amount
    ) public view returns (uint256) {
        uint256 price = getSellPrice(sharesSubject, amount);
        uint256 protocolFee = (price * protocolFeePercent) / 1 ether;
        uint256 subjectFee = (price * subjectFeePercent) / 1 ether;
        return price - protocolFee - subjectFee;
    }

    function buyShares(
        address sharesSubject,
        uint256 amount,
        uint256 curveIndex
    ) public payable {
        uint256 supply = sharesSupply[sharesSubject];
        require(
            supply > 0 || sharesSubject == msg.sender,
            "Only the shares' subject can buy the first share"
        );

        // Set curve for subject on first share purchase
        if (supply == 0 && sharesSubject == msg.sender) {
            require(curveIndex >= 1 && curveIndex <= 3, "Invalid curve index");
            subjectCurve[sharesSubject] = curveIndex;
        }

        uint256 price = getPrice(supply, amount, sharesSubject);
        uint256 protocolFee = (price * protocolFeePercent) / 1 ether;
        uint256 subjectFee = (price * subjectFeePercent) / 1 ether;

        sharesBalance[sharesSubject][msg.sender] =
            sharesBalance[sharesSubject][msg.sender] +
            amount;
        sharesSupply[sharesSubject] = supply + amount;

        uint256 multiplier;
        curveIndex = subjectCurve[sharesSubject];

        if (curveIndex == 1) {
            multiplier = multiplier1;
        } else if (curveIndex == 2) {
            multiplier = multiplier2;
        } else if (curveIndex == 3) {
            multiplier = multiplier3;
        } else {
            multiplier = multiplier1; // Default to first curve
        }

        emit Trade(
            msg.sender,
            sharesSubject,
            true,
            amount,
            price,
            protocolFee,
            subjectFee,
            supply + amount,
            multiplier
        );

        ERC20(token).safeTransferFrom(msg.sender, address(this), price);
        ERC20(token).safeTransferFrom(
            msg.sender,
            protocolFeeDestination,
            protocolFee
        );
        ERC20(token).safeTransferFrom(msg.sender, sharesSubject, subjectFee);
    }

    function sellShares(address sharesSubject, uint256 amount) public payable {
        uint256 supply = sharesSupply[sharesSubject];
        require(supply > amount, "Cannot sell the last share");

        uint256 price = getPrice(supply - amount, amount, sharesSubject);
        uint256 protocolFee = (price * protocolFeePercent) / 1 ether;
        uint256 subjectFee = (price * subjectFeePercent) / 1 ether;

        require(
            sharesBalance[sharesSubject][msg.sender] >= amount,
            "Insufficient shares"
        );

        sharesBalance[sharesSubject][msg.sender] =
            sharesBalance[sharesSubject][msg.sender] -
            amount;
        sharesSupply[sharesSubject] = supply - amount;

        uint256 multiplier;
        uint256 curveIndex = subjectCurve[sharesSubject];

        if (curveIndex == 1) {
            multiplier = multiplier1;
        } else if (curveIndex == 2) {
            multiplier = multiplier2;
        } else if (curveIndex == 3) {
            multiplier = multiplier3;
        } else {
            multiplier = multiplier1; // Default to first curve
        }

        emit Trade(
            msg.sender,
            sharesSubject,
            false,
            amount,
            price,
            protocolFee,
            subjectFee,
            supply - amount,
            multiplier
        );

        ERC20(token).safeTransfer(msg.sender, price - protocolFee - subjectFee);
        ERC20(token).safeTransfer(protocolFeeDestination, protocolFee);
        ERC20(token).safeTransfer(sharesSubject, subjectFee);
    }
}
