// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "contracts/DAO.sol";

contract Proposal {
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public deadline;
    // DAO public dao;
    address public delegateContract;
    
    mapping(address => bool) public hasVoted;

    constructor() {
        deadline = block.timestamp + 259200;
        // dao = DAO(msg.sender);
        delegateContract = msg.sender;
    }

    function vote(bytes32[] calldata _proof, bool support) external {
        require(block.timestamp < deadline, "Proposal is not active");
        require(!hasVoted[msg.sender], "Already voted");
        (bool success, ) =
        delegateContract.delegatecall(abi.encodeWithSignature("verify(bytes32[], address)",
            _proof, msg.sender));
        require(success, "Not in Merkle Tree");
        // require(dao.verify(_proof, msg.sender), "Not in Merkle Tree");
        hasVoted[msg.sender] = true;
        if (support) {
            yesVotes++;
        } else {
            noVotes++;
        }
    }
}