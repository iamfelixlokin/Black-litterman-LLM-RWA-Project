// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Faucet-style mock USDC for Polygon Amoy testnet
 *         Anyone can mint up to 100,000 USDC per call for testing
 */
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100_000e6; // 100,000 USDC

    event Minted(address indexed to, uint256 amount);

    constructor() ERC20("Mock USD Coin", "USDC") {}

    /// @notice Returns 6 decimals to match real USDC
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet: mint USDC_FAUCET_AMOUNT to caller
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
        emit Minted(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Admin mint (for scripts / test setup)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        emit Minted(to, amount);
    }
}
