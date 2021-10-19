//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

// Allows anyone to claim a token if they exist in a merkle root.
interface IMerkleDistributor {
    // Returns the address of the token distributed by this contract.
    function token() external view returns (address);

    // Returns the merkle root of the merkle tree containing account balances available to claim.
    function merkleRoot() external view returns (bytes32);

    function feeAddress() external view returns (address);

    // Returns true if the index has been marked claimed.
    function lambdaClaimed(address _claimee) external view returns (uint256);

    // Claim the given amount of the token to the given address. Reverts if the inputs are invalid.
    function claim(
        uint256 _index,
        uint256 _totalLambdaAmount,
        uint256 _claimLambdaAmount,
        bytes32[] calldata _merkleProof
    ) external;

    // This event is triggered whenever a call to #claim succeeds.
    event Claimed(
        uint256 index,
        address indexed account,
        uint256 lambdaAmountClaimed,
        uint256 feeAmount
    );
    event MerkleRootUpdated(bytes32 merkleRoot);
    event FeeAddressUpdated(address feeAddress);
    event FeeAmountUpdated(uint16 feeAmountInBasisPoints);
}
