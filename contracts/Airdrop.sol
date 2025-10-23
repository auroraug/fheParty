// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "contracts/DAO.sol";

contract Airdrop {
    address public creator;
    mapping(address => bool) public claimed;
    uint256 public amountPerClaim;
    DAO public dao;
    IERC20 public token;

    constructor() {
        creator = tx.origin;
        // dao = DAO(msg.sender);
        dao = DAO(msg.sender);
    }

    function initializeToken(address _token, uint256 _amountPerclaim) external {
        require(creator == msg.sender, "You are not able to handle this");
        token = IERC20(_token);
        amountPerClaim = _amountPerclaim;
    }

    function claim(bytes32[] calldata _proof) external {
        require(token.balanceOf(address(this)) >= amountPerClaim, "You are so late");
        require(!claimed[msg.sender], "Already claimed");
        require(dao.verify(_proof, msg.sender), "Not in Merkle Tree");
        claimed[msg.sender] = true;
        token.transfer(msg.sender, amountPerClaim);
    }
}