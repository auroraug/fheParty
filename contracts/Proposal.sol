// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "contracts/DAO.sol";
import "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract Proposal is ZamaEthereumConfig{
    uint32 public proposalId;
    uint64 public decryptedYesVotes;
    uint64 public decryptedNoVotes;
    euint64 public encryptedYesVotes;
    euint64 public encryptedNoVotes;
    uint256 public commitEnd;
    uint256 public revealEnd;
    string public description;
    DAO public dao;
    bool public decrypted;
    address public targetAddress;
    uint256 public value;
    bytes public executionCalldata;
    bool public executed;
    
    event VoteCommitted(address committer, bytes32 commitment);
    event VoteRevealed(address revealer);
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
        encryptedYesVotes = FHE.asEuint64(0);
        encryptedNoVotes = FHE.asEuint64(0);
        dao = DAO(payable(msg.sender));

        FHE.allowThis(encryptedYesVotes);
        FHE.allowThis(encryptedNoVotes);
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
    function revealVote(externalEuint8 esupport, bytes32 salt, bytes calldata attestation) external {
        require(block.timestamp > commitEnd, "Commit period not ended");
        require(block.timestamp <= revealEnd, "Proposal not active");
        require(!revealed[msg.sender], "Already revealed");
        
        euint8 support = FHE.fromExternal(esupport, attestation);
        bytes32 commitment = keccak256(abi.encodePacked(support, salt));
        require(commitments[msg.sender] == commitment, "Invalid reveal");
        
        ebool eq0 = FHE.eq(support, FHE.asEuint8(0));
        ebool gt0 = FHE.eq(support, FHE.asEuint8(1));
        uint64 weight = uint64(1 + dao.balanceOf(msg.sender));
        euint64 eweight = FHE.asEuint64(weight);
        encryptedYesVotes = FHE.select(gt0, FHE.add(encryptedYesVotes, eweight), FHE.add(encryptedYesVotes, FHE.asEuint64(0)));
        encryptedNoVotes = FHE.select(eq0, FHE.add(encryptedNoVotes, eweight), FHE.add(encryptedNoVotes, FHE.asEuint64(0)));
        
        revealed[msg.sender] = true;
        dao.addReputation(proposalId, msg.sender, 1);

        FHE.allowThis(encryptedYesVotes);
        FHE.allowThis(encryptedNoVotes);
        FHE.makePubliclyDecryptable(encryptedYesVotes);
        FHE.makePubliclyDecryptable(encryptedNoVotes);

        emit VoteRevealed(msg.sender);
    }

    // proposal execution logic
    function execute(
        bytes memory abiEncodedResult,
        bytes memory decryptionProof
    ) external {
        require(block.timestamp > revealEnd, "Voting not ended");
        require(!executed, "Already executed");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(encryptedYesVotes);
        cts[1] = FHE.toBytes32(encryptedNoVotes);

        FHE.checkSignatures(cts, abiEncodedResult, decryptionProof);
        (uint64 decodedYesVotes, uint64 decodedNoVotes) = abi.decode(
            abiEncodedResult,
            (uint64, uint64)
        );

        require(decodedYesVotes > decodedNoVotes, "Proposal did not pass");
        require(address(dao).balance >= value, "DAO: insufficient ETH");

        executed = true;

        dao.executeProposal(proposalId, targetAddress, value, executionCalldata, msg.sender);
        emit ProposalExecuted(msg.sender);
    }

    // function requestDecryptVotes() internal returns (uint64, uint64) {
    //     require(block.timestamp > revealEnd, "Voting not ended");

    //     bytes32[] memory cts = new bytes32[](2);
    //     cts[0] = FHE.toBytes32(encryptedYesVotes);
    //     cts[1] = FHE.toBytes32(encryptedNoVotes);

        
    //     FHE.requestDecryption(cts, this.callbackDecryptVotes.selector);
    // }

    // function callbackDecryptVotes(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) public {
    //     FHE.checkSignatures(requestId, cleartexts, decryptionProof);

    //     (uint64 yesVotes, uint64 noVotes) = abi.decode(cleartexts, (uint64, uint64));
    //     decryptedYesVotes = yesVotes;
    //     decryptedNoVotes = noVotes;
    //     decrypted = true;
    // }
}