//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

// interface for interaction with Elastic style tokens that allow for minting "shares" or lambda.
interface IMintableShares {
    function mintShares(address _account, uint256 _amount)
        external
        returns (bool);
}
