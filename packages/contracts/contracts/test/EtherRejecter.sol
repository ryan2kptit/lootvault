// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Test helper: a payee that refuses ETH, used to exercise PayoutFailed.
contract EtherRejecter {
    receive() external payable {
        revert("EtherRejecter: no ETH");
    }
}
