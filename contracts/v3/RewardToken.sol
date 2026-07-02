// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LiteForge Reward (LFR)
/// @notice ERC20 minted by the V3MiningCore as mining rewards.
///         Owner sets the authorized minter once (typically the Core proxy).
contract RewardToken is ERC20, Ownable {
    address public minter;
    bool public minterLocked;

    event MinterUpdated(address indexed newMinter);
    event MinterLocked();

    error NotMinter();
    error MinterAlreadyLocked();
    error ZeroAddress();

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor() ERC20("LiteForge Reward", "LFR") Ownable(msg.sender) {}

    function setMinter(address newMinter) external onlyOwner {
        if (minterLocked) revert MinterAlreadyLocked();
        if (newMinter == address(0)) revert ZeroAddress();
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function lockMinter() external onlyOwner {
        if (minterLocked) revert MinterAlreadyLocked();
        minterLocked = true;
        emit MinterLocked();
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }
}
