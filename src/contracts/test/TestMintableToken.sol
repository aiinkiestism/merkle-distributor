//SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../interfaces/IMintableShares.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestMintableToken is ERC20, IMintableShares, Ownable {
    address public minter;

    modifier onlyMinter() {
        require(msg.sender == minter, "TestMintableToken: ONLY_MINTER");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 amountToMint
    ) ERC20(name_, symbol_) {
        setBalance(msg.sender, amountToMint);
    }

    // sets the balance of the address
    // this mints/burns the amount depending on the current balance
    function setBalance(address _to, uint256 _amount) public {
        uint256 old = balanceOf(_to);
        if (old < _amount) {
            _mint(_to, _amount - old);
        } else if (old > _amount) {
            _burn(_to, old - _amount);
        }
    }

    function mintShares(address _account, uint256 _amount)
        external
        override
        onlyMinter
        returns (bool)
    {
        _mint(_account, _amount); // for this we can assume lambda : 1 token, it doesn't matter for our testing
        return true;
    }

    function setMinterAddress(address _minter) external onlyOwner {
        minter = _minter;
    }
}
