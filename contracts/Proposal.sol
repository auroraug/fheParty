// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "contracts/DAO.sol";

contract Proposal {
    uint32 public proposalId;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public commitEnd;
    uint256 public revealEnd;
    string public description;
    DAO public dao;

    address public targetAddress;
    uint256 public value;
    bytes public executionCalldata;
    bool public executed;
    
    event VoteCommitted(address committer, bytes32 commitment);
    event VoteRevealed(address revealer, uint8 support);
    event ProposalExecuted(address executor);

    // user commitment：proposalId => address => commitment (hash(support + salt))
    mapping(address => bytes32) public commitments;
    mapping(address => bool) public revealed;

    constructor(uint32 _proposalId,
      string memory _description,
      uint256 _vtPeriod,
      address _target,
      uint256 _value,
      bytes memory _calldata
    ) {
        proposalId = _proposalId;
        revealEnd = block.timestamp + _vtPeriod;
        commitEnd = block.timestamp + _vtPeriod/2;
        description = _description;
        targetAddress = _target;
        value = _value;
        executionCalldata = _calldata;
        dao = DAO(payable(msg.sender));
    }

    function isActive() public view returns (bool) {
        return block.timestamp <= revealEnd;
    }

    // commitment：submit hash(support + salt); support => even num(dis)/odd num(agree)
    // salt: private random bytes32
    function commitVote(bytes32[] calldata proof, bytes32 commitment) external {
        require(isActive(), "Proposal not active");
        require(dao.verify(proof, msg.sender), "Only member can participate");
        require(block.timestamp <= commitEnd, "Commit period ended");
        require(commitments[msg.sender] == 0, "Already committed");
        
        commitments[msg.sender] = commitment;
        emit VoteCommitted(msg.sender, commitment);
    }

    // reveal：submit the support and salt what you committed, and reptation be increased
    function revealVote(uint8 support, bytes32 salt) external {
        require(block.timestamp > commitEnd, "Commit period not ended");
        require(block.timestamp <= revealEnd, "Proposal not active");
        require(!revealed[msg.sender], "Already revealed");
        
        bytes32 commitment = keccak256(abi.encodePacked(support, salt));
        require(commitments[msg.sender] == commitment, "Invalid reveal");
        
        _countVote(msg.sender, support);
        
        revealed[msg.sender] = true;
        dao.addReputation(proposalId, msg.sender, 1);

        emit VoteRevealed(msg.sender, support);
    }

    function _countVote(address _voter, uint8 _support) internal {
        uint256 weight = 1 + dao.balanceOf(_voter);
        if (_support % 2 == 0) {
            noVotes += weight;
        } else {
            yesVotes += weight;
        }
    }

    // proposal execution logic
    function execute() external {
        require(block.timestamp > revealEnd, "Voting not ended");
        require(!executed, "Already executed");
        require(yesVotes > noVotes, "Proposal did not pass");
        require(address(dao).balance >= value, "DAO: insufficient ETH");

        executed = true;
        emit ProposalExecuted(msg.sender);

        dao.executeProposal(proposalId, targetAddress, value, executionCalldata, msg.sender);
    }
}