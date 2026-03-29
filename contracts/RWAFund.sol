// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RWAFund
 * @notice Black-Litterman Strategy RWA Fund on Polygon Amoy
 *
 * Architecture:
 * - Non-transferable (soulbound) ERC-20 fund tokens
 * - NAV denominated in USDC (6 decimals)
 * - Oracle pushes NAV + portfolio weights monthly
 * - Users subscribe (USDC -> tokens) and redeem (tokens -> USDC)
 *
 * Roles:
 * - DEFAULT_ADMIN_ROLE: Can grant/revoke roles
 * - MANAGER_ROLE: Pause, set fees, emergency withdraw
 * - ORACLE_ROLE: Update NAV and rebalance weights
 */
contract RWAFund is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================================================
    // Roles
    // =========================================================
    bytes32 public constant ORACLE_ROLE  = keccak256("ORACLE_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    // =========================================================
    // State
    // =========================================================
    IERC20 public immutable usdc;

    /// @notice Price per fund token expressed in USDC (6 decimals)
    ///         e.g. 100_000_000 = $100.00 per token
    uint256 public navPerToken;

    /// @notice Total AUM tracked by oracle (USDC, 6 decimals)
    uint256 public totalAUM;

    uint256 public lastNavUpdate;
    uint256 public lastRebalance;

    /// @notice Subscription fee in basis points (e.g. 50 = 0.5%)
    uint256 public subscriptionFeeBps = 50;

    /// @notice Redemption fee in basis points
    uint256 public redemptionFeeBps = 50;

    uint256 public constant MAX_FEE_BPS      = 500;   // 5% cap
    uint256 public constant MIN_SUBSCRIPTION = 10e6;  // $10 USDC minimum

    /// @dev Initial NAV = $100 per token
    uint256 public constant INITIAL_NAV = 100e6;

    /// @dev Ordered list of asset tickers in the portfolio
    string[] private _assets;

    /// @notice Portfolio weight per asset in basis points (sum = 10_000)
    mapping(string => uint256) public weights;

    // =========================================================
    // Events
    // =========================================================
    event NAVUpdated(uint256 indexed newNAV, uint256 totalAUM, uint256 timestamp);
    event Subscribed(
        address indexed investor,
        uint256 usdcAmount,
        uint256 tokensIssued,
        uint256 nav
    );
    event Redeemed(
        address indexed investor,
        uint256 tokenAmount,
        uint256 usdcReturned,
        uint256 nav
    );
    event Rebalanced(string[] assets, uint256[] newWeights, uint256 timestamp);
    event FeesUpdated(uint256 subscriptionFeeBps, uint256 redemptionFeeBps);
    event FeesCollected(address indexed to, uint256 amount);

    // =========================================================
    // Constructor
    // =========================================================
    constructor(
        address _usdc,
        address _manager,
        address _oracle
    ) ERC20("MAG7 Fund", "M7F") {
        require(_usdc    != address(0), "Invalid USDC");
        require(_manager != address(0), "Invalid manager");
        require(_oracle  != address(0), "Invalid oracle");

        usdc = IERC20(_usdc);
        navPerToken = INITIAL_NAV;

        _grantRole(DEFAULT_ADMIN_ROLE, _manager);
        _grantRole(MANAGER_ROLE, _manager);
        _grantRole(ORACLE_ROLE, _oracle);
    }

    // =========================================================
    // Soulbound: disable all transfers
    // =========================================================

    /// @dev Tokens can only be minted (subscribe) or burned (redeem)
    function transfer(address, uint256) public pure override returns (bool) {
        revert("M7F: non-transferable");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("M7F: non-transferable");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert("M7F: non-transferable");
    }

    // =========================================================
    // Oracle functions
    // =========================================================

    /**
     * @notice Update NAV (called by oracle after each valuation)
     * @param _newNAV     New price per token in USDC (6 decimals)
     * @param _totalAUM   Total fund AUM in USDC (6 decimals)
     */
    function updateNAV(uint256 _newNAV, uint256 _totalAUM)
        external
        onlyRole(ORACLE_ROLE)
    {
        require(_newNAV > 0, "NAV must be > 0");
        navPerToken  = _newNAV;
        totalAUM     = _totalAUM;
        lastNavUpdate = block.timestamp;
        emit NAVUpdated(_newNAV, _totalAUM, block.timestamp);
    }

    /**
     * @notice Store latest rebalance weights on-chain (called monthly by oracle)
     * @param _assetList  Ordered array of ticker strings  e.g. ["AAPL","MSFT",...]
     * @param _weights    Corresponding weights in bps, must sum to 10_000
     */
    function updateRebalance(
        string[] calldata _assetList,
        uint256[] calldata _weights
    ) external onlyRole(ORACLE_ROLE) {
        uint256 len = _assetList.length;
        require(len > 0 && len == _weights.length, "Length mismatch");

        uint256 total;
        for (uint256 i; i < len; ++i) total += _weights[i];
        require(total == 10_000, "Weights != 10000 bps");

        // Clear previous weights
        for (uint256 i; i < _assets.length; ++i) delete weights[_assets[i]];
        delete _assets;

        // Store new weights
        for (uint256 i; i < len; ++i) {
            _assets.push(_assetList[i]);
            weights[_assetList[i]] = _weights[i];
        }

        lastRebalance = block.timestamp;
        emit Rebalanced(_assetList, _weights, block.timestamp);
    }

    // =========================================================
    // User functions
    // =========================================================

    /**
     * @notice Subscribe: deposit USDC and receive fund tokens at current NAV
     * @param usdcAmount  Amount of USDC to invest (6 decimals)
     */
    function subscribe(uint256 usdcAmount)
        external
        nonReentrant
        whenNotPaused
    {
        require(usdcAmount >= MIN_SUBSCRIPTION, "Below minimum");

        uint256 fee     = (usdcAmount * subscriptionFeeBps) / 10_000;
        uint256 net     = usdcAmount - fee;

        // tokensToMint = net_USDC (6 dec) * 1e18 / navPerToken (6 dec)
        //              → fund tokens with 18 decimals
        uint256 tokens  = (net * 1e18) / navPerToken;
        require(tokens > 0, "Too small");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        _mint(msg.sender, tokens);

        emit Subscribed(msg.sender, usdcAmount, tokens, navPerToken);
    }

    /**
     * @notice Redeem: burn fund tokens and receive USDC at current NAV
     * @param tokenAmount  Amount of fund tokens to redeem (18 decimals)
     */
    function redeem(uint256 tokenAmount)
        external
        nonReentrant
        whenNotPaused
    {
        require(tokenAmount > 0, "Amount == 0");
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient balance");

        // grossUSDC = tokenAmount (18 dec) * navPerToken (6 dec) / 1e18
        uint256 gross   = (tokenAmount * navPerToken) / 1e18;
        uint256 fee     = (gross * redemptionFeeBps) / 10_000;
        uint256 net     = gross - fee;

        require(usdc.balanceOf(address(this)) >= net, "Insufficient liquidity");

        _burn(msg.sender, tokenAmount);
        usdc.safeTransfer(msg.sender, net);

        emit Redeemed(msg.sender, tokenAmount, net, navPerToken);
    }

    // =========================================================
    // View helpers
    // =========================================================

    /// @notice Returns the ordered list of asset tickers in the portfolio
    function getAssets() external view returns (string[] memory) {
        return _assets;
    }

    /**
     * @notice One-call fund snapshot for frontends / the oracle
     */
    function getFundInfo()
        external
        view
        returns (
            uint256 _navPerToken,
            uint256 _totalSupply,
            uint256 _totalAUM,
            uint256 _lastNavUpdate,
            uint256 _lastRebalance,
            uint256 _usdcBalance
        )
    {
        return (
            navPerToken,
            totalSupply(),
            totalAUM,
            lastNavUpdate,
            lastRebalance,
            usdc.balanceOf(address(this))
        );
    }

    /**
     * @notice Preview how many tokens a USDC amount would mint (after fee)
     */
    function previewSubscribe(uint256 usdcAmount)
        external
        view
        returns (uint256 tokensOut, uint256 feeCharged)
    {
        feeCharged = (usdcAmount * subscriptionFeeBps) / 10_000;
        uint256 net = usdcAmount - feeCharged;
        tokensOut   = (net * 1e18) / navPerToken;
    }

    /**
     * @notice Preview how much USDC a token amount would return (after fee)
     */
    function previewRedeem(uint256 tokenAmount)
        external
        view
        returns (uint256 usdcOut, uint256 feeCharged)
    {
        uint256 gross = (tokenAmount * navPerToken) / 1e18;
        feeCharged    = (gross * redemptionFeeBps) / 10_000;
        usdcOut       = gross - feeCharged;
    }

    // =========================================================
    // Manager functions
    // =========================================================

    function pause()   external onlyRole(MANAGER_ROLE) { _pause(); }
    function unpause() external onlyRole(MANAGER_ROLE) { _unpause(); }

    /**
     * @notice Update subscription and redemption fees
     * @param _subFee  Subscription fee in bps (max 500 = 5%)
     * @param _redFee  Redemption fee in bps (max 500 = 5%)
     */
    function setFees(uint256 _subFee, uint256 _redFee)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(_subFee <= MAX_FEE_BPS && _redFee <= MAX_FEE_BPS, "Fee too high");
        subscriptionFeeBps = _subFee;
        redemptionFeeBps   = _redFee;
        emit FeesUpdated(_subFee, _redFee);
    }

    /**
     * @notice Collect accumulated fees (USDC surplus above token backing)
     * @param to  Recipient address
     */
    function collectFees(address to) external onlyRole(MANAGER_ROLE) {
        require(to != address(0), "Invalid recipient");
        uint256 backing = (totalSupply() * navPerToken) / 1e18;
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > backing, "No surplus fees");
        uint256 surplus = balance - backing;
        usdc.safeTransfer(to, surplus);
        emit FeesCollected(to, surplus);
    }
}
