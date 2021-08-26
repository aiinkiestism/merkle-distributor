//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMerkleDistributor.sol";

contract MerkleDistributor is IMerkleDistributor, Ownable {
    address public immutable override token;
    bytes32 public override merkleRoot;
    address public override feeAddress;

    mapping(uint256 => uint256) private claimedBitMap; // packed array of booleans.
    mapping(address => uint256) private claimedAmount; // claimee address -> claimed amount.

    constructor(address _token, bytes32 _merkleRoot) {
        token = _token;
        merkleRoot = _merkleRoot;
    }

    function isClaimed(uint256 _index) public view override returns (bool) {
        uint256 claimedWordIndex = _index / 256;
        uint256 claimedBitIndex = _index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 _index) private {
        uint256 claimedWordIndex = _index / 256;
        uint256 claimedBitIndex = _index % 256;
        claimedBitMap[claimedWordIndex] =
            claimedBitMap[claimedWordIndex] |
            (1 << claimedBitIndex);
    }

    function claim(
        uint256 _index,
        address _account,
        uint256 _amount,
        bytes32[] calldata _merkleProof
    ) external override {
        require(!isClaimed(_index), "MerkleDistributor: ALREADY_CLAIMED");

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(_index, _account, _amount));
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, node),
            "MerkleDistributor: INVALID_PROOF"
        );

        // Mark it claimed and send the token.
        _setClaimed(_index);
        require(
            IERC20(token).transfer(_account, _amount),
            "MerkleDistributor: TRANSFER_FAILED"
        );

        emit Claimed(_index, _account, _amount);
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(merkleRoot != _merkleRoot, "MerkleDistributor: DUPLICATE_ROOT");
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(merkleRoot);
    }

    function setFeeAddress(address _feeAddress) external onlyOwner {
        require(
            feeAddress != _feeAddress,
            "MerkleDistributor: DUPLICATE_ADDRESS"
        );
        feeAddress = _feeAddress;
        emit FeeAddressUpdated(feeAddress);
    }
}
