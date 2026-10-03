// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LootVault1155
/// @notice Lazy-mint ERC-1155 for multi-store NFT shops.
/// @dev Deliberately "dumb": every business rule (price, discounts, per-wallet limits,
///      publish state) lives off-chain and reaches the chain only through a Checkout
///      signed by the platform. The contract enforces just five invariants:
///      platform authorisation, buyer/deadline binding, single-use orderId,
///      per-token supply cap, and exact payment with fee split.
contract LootVault1155 is ERC1155, EIP712, Ownable, Pausable, ReentrancyGuard {
    struct Line {
        uint256 tokenId;
        address creator;
        uint256 quantity;
        uint256 unitPrice;
        uint256 maxSupply;
    }

    struct Checkout {
        bytes32 orderId;
        address buyer;
        Line[] lines;
        uint256 deadline;
    }

    bytes32 private constant LINE_TYPEHASH =
        keccak256("Line(uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply)");
    bytes32 private constant CHECKOUT_TYPEHASH =
        keccak256(
            "Checkout(bytes32 orderId,address buyer,Line[] lines,uint256 deadline)"
            "Line(uint256 tokenId,address creator,uint256 quantity,uint256 unitPrice,uint256 maxSupply)"
        );

    uint16 public constant MAX_FEE_BPS = 1000; // 10%
    uint16 private constant BPS_DENOMINATOR = 10_000;

    address public platformSigner;
    address public treasury;
    uint16 public feeBps;

    mapping(uint256 tokenId => uint256) public minted;
    mapping(uint256 tokenId => address) public creatorOf;
    mapping(bytes32 orderId => bool) public usedOrders;

    event Purchased(bytes32 indexed orderId, address indexed buyer, uint256 total, uint256 fee);
    event PlatformSignerUpdated(address indexed signer);
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint16 feeBps);

    error InvalidSignature();
    error WrongBuyer();
    error Expired();
    error OrderUsed();
    error EmptyCheckout();
    error CreatorMismatch(uint256 tokenId);
    error SoldOut(uint256 tokenId);
    error WrongPayment();
    error PayoutFailed();
    error FeeTooHigh();
    error ZeroAddress();

    constructor(string memory baseUri, address initialOwner, address signer, address treasury_)
        ERC1155(baseUri)
        EIP712("LootVault", "1")
        Ownable(initialOwner)
    {
        if (signer == address(0) || treasury_ == address(0)) revert ZeroAddress();
        platformSigner = signer;
        treasury = treasury_;
        feeBps = 250; // 2.5%
    }

    /// @notice Buy every line of a platform-signed checkout in one transaction.
    function purchase(Checkout calldata c, bytes calldata platformSig) external payable whenNotPaused nonReentrant {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashCheckout(c), platformSig);
        if (err != ECDSA.RecoverError.NoError || recovered != platformSigner) revert InvalidSignature();
        if (msg.sender != c.buyer) revert WrongBuyer();
        if (block.timestamp > c.deadline) revert Expired();
        if (usedOrders[c.orderId]) revert OrderUsed();
        if (c.lines.length == 0) revert EmptyCheckout();
        usedOrders[c.orderId] = true;

        // Checks + effects for every line before any external call.
        uint256 total;
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            address knownCreator = creatorOf[line.tokenId];
            if (knownCreator == address(0)) {
                creatorOf[line.tokenId] = line.creator;
            } else if (knownCreator != line.creator) {
                revert CreatorMismatch(line.tokenId);
            }
            if (minted[line.tokenId] + line.quantity > line.maxSupply) revert SoldOut(line.tokenId);
            minted[line.tokenId] += line.quantity;
            total += line.quantity * line.unitPrice;
        }
        if (msg.value != total) revert WrongPayment();

        // Interactions: mint (may call onERC1155Received) and pay out.
        uint256 feeTotal;
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            _mint(c.buyer, line.tokenId, line.quantity, "");
            uint256 lineTotal = line.quantity * line.unitPrice;
            uint256 lineFee = (lineTotal * feeBps) / BPS_DENOMINATOR;
            feeTotal += lineFee;
            _pay(line.creator, lineTotal - lineFee);
        }
        _pay(treasury, feeTotal);

        emit Purchased(c.orderId, c.buyer, total, feeTotal);
    }

    /// @notice EIP-712 digest of a checkout; exposed so off-chain code can be cross-checked.
    function hashCheckout(Checkout calldata c) public view returns (bytes32) {
        bytes32[] memory lineHashes = new bytes32[](c.lines.length);
        for (uint256 i; i < c.lines.length; ++i) {
            Line calldata line = c.lines[i];
            lineHashes[i] = keccak256(
                abi.encode(LINE_TYPEHASH, line.tokenId, line.creator, line.quantity, line.unitPrice, line.maxSupply)
            );
        }
        return _hashTypedDataV4(
            keccak256(
                abi.encode(CHECKOUT_TYPEHASH, c.orderId, c.buyer, keccak256(abi.encodePacked(lineHashes)), c.deadline)
            )
        );
    }

    // ---------------------------------------------------------------- admin

    function setPlatformSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        platformSigner = signer;
        emit PlatformSignerUpdated(signer);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setURI(string calldata newUri) external onlyOwner {
        _setURI(newUri);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }
}
