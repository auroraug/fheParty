// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Airdrop.sol";
import "./Proposal.sol";

contract DAO is Ownable(msg.sender) {
    bytes32 public merkleRoot;

    event MerkleRootUpdated(bytes32 newRoot);
    event ProposalCreated(address indexed creator, address proposalAddress);
    event AirdropCreated(address indexed creator, address airdropAddress);

    constructor(bytes32 _merkleRoot) {
        merkleRoot = _merkleRoot;
    }

    function updateMerkleRoot(bytes32 _newMerkleRoot) external onlyOwner {
        merkleRoot = _newMerkleRoot;
        emit MerkleRootUpdated(_newMerkleRoot);
    }

    function verify(bytes32[] calldata proof, address account) public view returns (bool) {
        bytes32 leaf = keccak256(bytes(toHexString(account)));
        return verifyProof(proof, leaf, merkleRoot);
    }

    function verifyProof(
        bytes32[] calldata proof,
        bytes32 leaf,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == root;
    }

    function toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(40);
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            uint8 hi = b >> 4;
            uint8 lo = b & 0x0f;
            buffer[2 * i] = bytes1(hi < 10 ? hi + 0x30 : hi + 0x57);
            buffer[2 * i + 1] = bytes1(lo < 10 ? lo + 0x30 : lo + 0x57);
        }
        return string(buffer);
    }

    function createProposal(bytes32[] calldata proof) external returns (address) {
        require(verify(proof, msg.sender), "Not in Merkle Tree");
        address proposalAddress = deployProxy(type(Proposal).creationCode);
        emit ProposalCreated(msg.sender, proposalAddress);
        return proposalAddress;
    }

    function createAirdrop(bytes32[] calldata proof) external returns (address) {
        require(verify(proof, msg.sender), "Not in Merkle Tree");
        address airdropAddress = deployProxy(type(Airdrop).creationCode);
        emit AirdropCreated(msg.sender, airdropAddress);
        return airdropAddress;
    }

    function deployProxy(bytes memory bytecode) internal returns (address) {
        bytes memory code = abi.encodePacked(bytecode);
        address proxy;
        assembly {
            proxy := create2(0, add(code, 0x20), mload(code), 0)
        }
        require(proxy != address(0), "Proxy deployment failed");
        return proxy;
    }
}



