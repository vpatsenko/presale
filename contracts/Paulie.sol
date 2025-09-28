// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Paulie is ERC20, ERC20Burnable {
    constructor() ERC20("Paulie", "$PAULIE") {
        _mint(msg.sender, 10_000_000_000 * 10 ** decimals());
    }

}
