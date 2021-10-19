//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMerkleDistributor.sol";
import "../interfaces/IMintableShares.sol";

contract MerkleDistributor is IMerkleDistributor, Ownable {
    address public immutable override token;
    bytes32 public override merkleRoot;
    address public override feeAddress;

    uint16 public feeAmountBasisPoints = 100; // fee amount for claiming in basis points (default 1%)
    uint16 public constant BASIS_POINTS = 10000;

    mapping(address => uint256) private claimedLambdaAmount; // claimee address -> claimed Lambda amount.

    constructor(
        address _token,
        address _feeAddress,
        bytes32 _merkleRoot
    ) {
        token = _token;
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(merkleRoot);
        setFeeAddress(_feeAddress);
    }

   

    /**
     * @notice Returns the amount of lambda that has been claimed by this address since the creation of this contract
     * @param _claimee address 
     */
    function lambdaClaimed(address _claimee)
        external
        view
        override
        returns (uint256)
    {
        return claimedLambdaAmount[_claimee];
    }

    /**
     * @notice Allows a new merkle root to be set by the contracts owner (the DAO)
     * @param _merkleRoot the merkle root to be set 
     */
    function setMerkleRoot(bytes32 _merkleRoot) public onlyOwner {
        require(merkleRoot != _merkleRoot, "MerkleDistributor: DUPLICATE_ROOT");
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(merkleRoot);
    }

    /**
     * @notice Allows the contract owner (the DAO) to set a new fee address that can receive ERC20 based fees
     * @param _feeAddress the merkle root to be set 
     */
     function setFeeAddress(address _feeAddress) public onlyOwner {
        require(
            _feeAddress != address(0),
            "MerkleDistributor: INVALID_ADDRESS"
        );

        require(
            feeAddress != _feeAddress,
            "MerkleDistributor: DUPLICATE_ADDRESS"
        );
        feeAddress = _feeAddress;
        emit FeeAddressUpdated(feeAddress);
    }

    /**
     * @notice Allows the contract owner (the DAO) to set a new fee amount to be collected on claiming
     * @param _feeAmountBasisPoints fee amount denominated in basis points
     */
    function setFeeAmount(uint16 _feeAmountBasisPoints) public onlyOwner {
        require(
            _feeAmountBasisPoints != feeAmountBasisPoints,
            "MerkleDistributor: SAME_FEE"
        );
        feeAmountBasisPoints = _feeAmountBasisPoints;
        emit FeeAmountUpdated(feeAmountBasisPoints);
    }

    /**
     * @notice Allows the contract owner (the DAO) to set a new fee amount to be collected on claiming
     * @param _index the index of the merkle claim
     * @param _totalLambdaAmount the total lambda amount in the tree
     * @param _claimLambdaAmount the amount the users desires to claim
     * @param _merkleProof bytes32[] proof for the claim
     */
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

        uint256 mintFeeAmount =
            (_claimLambdaAmount * feeAmountBasisPoints) / BASIS_POINTS;
        uint256 claimAmountAfterFee = _claimLambdaAmount - mintFeeAmount;

        if (mintFeeAmount != 0) {
            require(
                IMintableShares(token).mintShares(feeAddress, mintFeeAmount),
                "MerkleDistributor: MINT_FAILED"
            );
        }

        require(
            IMintableShares(token).mintShares(msg.sender, claimAmountAfterFee),
            "MerkleDistributor: MINT_FAILED"
        );

        emit Claimed(_index, msg.sender, _claimLambdaAmount, mintFeeAmount);
    }
}
