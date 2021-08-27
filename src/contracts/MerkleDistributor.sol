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

    mapping(address => uint256) private claimedLambdaAmount; // claimee address -> claimed Lambda amount.

    constructor(address _token, address _feeAddress, bytes32 _merkleRoot) {
        token = _token;
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(merkleRoot);
        setFeeAddress(_feeAddress);
    }

    function lambdaClaimed(address _claimee)
        external
        view
        override
        returns (uint256)
    {
        return claimedLambdaAmount[_claimee];
    }

    function setMerkleRoot(bytes32 _merkleRoot) public onlyOwner {
        require(merkleRoot != _merkleRoot, "MerkleDistributor: DUPLICATE_ROOT");
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(merkleRoot);
    }

function setFeeAddress(address _feeAddress) public onlyOwner {
        require(_feeAddress != address(0), "MerkleDistributor: INVALID_ADDRESS");

        require(
            feeAddress != _feeAddress,
            "MerkleDistributor: DUPLICATE_ADDRESS"
        );
        feeAddress = _feeAddress;
        emit FeeAddressUpdated(feeAddress);
    }

    function claim(
        uint256 _index,
        uint256 _totalLambdaAmount,
        uint256 _claimLambdaAmount,
        bytes32[] calldata _merkleProof
    ) external override {
        require(
            _claimLambdaAmount <= _totalLambdaAmount,
            "MerkleDistributor: INVALID_CLAIM_AMOUNT"
        );

        // Verify the merkle proof.
        bytes32 node =
            keccak256(abi.encodePacked(_index, msg.sender, _totalLambdaAmount));
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, node),
            "MerkleDistributor: INVALID_PROOF"
        );

        uint256 alreadyClaimedLambdaAmount = claimedLambdaAmount[msg.sender];
        require(
            _totalLambdaAmount - alreadyClaimedLambdaAmount >=
                _claimLambdaAmount,
            "MerkleDistributor: INVALID_CLAIM_AMOUNT"
        );

        claimedLambdaAmount[msg.sender] =
            alreadyClaimedLambdaAmount +
            _claimLambdaAmount;
        // TODO: translate lambda amount to token amount....
        require(
            IERC20(token).transfer(msg.sender, _claimLambdaAmount),
            "MerkleDistributor: TRANSFER_FAILED"
        );

        emit Claimed(_index, msg.sender, _claimLambdaAmount);
    }

    
}
