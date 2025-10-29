import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import {MerkleTree} from 'merkletreejs';
import { DAO, DAO__factory, Proposal } from "../types";
import keccak256 = require('keccak256');

type Signers = {
    owner: HardhatEthersSigner;
    alice: HardhatEthersSigner;
    bob: HardhatEthersSigner;
    james: HardhatEthersSigner;
    jordan: HardhatEthersSigner;
    kobe: HardhatEthersSigner;
}

type Proof = {
    owner: string[],
    bob: string[],
    alice: string[],
    james: string[],
    jordan: string[],
    kobe: string[]
}

function getProof(address: String, merkleTree: MerkleTree) {
  const leaf = keccak256(address.toLowerCase().replace('0x', ''));
  return merkleTree.getHexProof(leaf);
}

function findAddress(receipt: any) {
    let address = ''
    for(const log of receipt.logs) {
        if(log.data && log.data !== '0x') {
            const data = log.data
            address = "0x" + data.slice(-40)
            break;
        }
    }
    return address;
}
// // Helper to mimic contract's _toHexString (40-char lowercase hex without 0x)
// function toHexString(address: string) {
//   return address.toLowerCase().slice(2); // Remove '0x'
// }

// // Helper to compute leaf: keccak256(bytes(toHexString(addr)))
// function computeLeaf(address: string) {
//   const hexStr = toHexString(address);
//   return keccak256(ethers.toUtf8Bytes(hexStr));
// }

// // Simple Merkle tree for testing: sorted hashing
// function computeMerkleRoot(leaves) {
//   if (leaves.length === 1) return leaves[0];
//   const mid = Math.floor(leaves.length / 2);
//   const left = computeMerkleRoot(leaves.slice(0, mid));
//   const right = computeMerkleRoot(leaves.slice(mid));
//   return ethers.utils.keccak256(ethers.utils.concat(left < right ?
// [left, right] : [right, left]));
// }

// // Get proof for a leaf (simple for small tree)
// function getProof(leaves, index) {
//   let proof = [];
//   let currentIndex = index;
//   let currentLeaves = [...leaves];
//   while (currentLeaves.length > 1) {
//     const mid = Math.floor(currentLeaves.length / 2);
//     const pairIndex = currentIndex % 2 === 0 ? currentIndex + 1 :
// currentIndex - 1;
//     if (pairIndex < currentLeaves.length) {
//       proof.push(currentLeaves[pairIndex]);
//     }
//     currentLeaves = currentLeaves.reduce((acc, _, i) => {
//       if (i % 2 === 0) {
//         const left = currentLeaves[i];
//         const right = i + 1 < currentLeaves.length ? currentLeaves[i +
// 1] : left;
//         acc.push(ethers.utils.keccak256(ethers.utils.concat(left <
// right ? [left, right] : [right, left])));
//       }
//       return acc;
//     }, []);
//     currentIndex = Math.floor(currentIndex / 2);
//   }
//   return proof;
// }

describe("DAO and Proposal", function () {
   const provider = ethers.provider;
   let signers: Signers;
   let leaves, newLeaves;
   let merkleTree: MerkleTree, newMerkleTree: MerkleTree;
   let root: string, newRoot: string;
   let proofs: Proof, newProofs: Proof;
   let dao: DAO;
   let daoContractAddress: string;
   let DAO, Proposal;

  beforeEach(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
        owner: ethSigners[0],
        bob: ethSigners[1],
        alice: ethSigners[2],
        james: ethSigners[3],
        jordan: ethSigners[4],
        kobe: ethSigners[5]
    }
    // leaves without james jordan kobe
    const leavesAddr1 = [
      signers.owner.address,
      signers.bob.address,
      signers.alice.address,
    ]
    const leavesAddr2 = [
      signers.owner.address,
      signers.bob.address,
      signers.alice.address,
      signers.james.address,
      signers.jordan.address,
      signers.kobe.address,
    ]
    // Compute simple Merkle tree for member1 and member2
    leaves = leavesAddr1.map(addr => keccak256(addr.toLowerCase().replace('0x', '')));
    newLeaves = leavesAddr2.map(addr => keccak256(addr.toLowerCase().replace('0x', '')));
    merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    newMerkleTree = new MerkleTree(newLeaves, keccak256, { sortPairs: true });
    root = merkleTree.getHexRoot();
    newRoot = newMerkleTree.getHexRoot();
    // Deploy DAO with merkleRoot
    const factory = (await ethers.getContractFactory("DAO")) as DAO__factory;
    dao = (await factory.deploy(root)) as DAO;
    daoContractAddress = await dao.getAddress();

    // compute proofs
    proofs = {
      owner: getProof(signers.owner.address, merkleTree),
      bob: getProof(signers.bob.address, merkleTree),
      alice: getProof(signers.alice.address, merkleTree),
      james: getProof(signers.james.address, merkleTree),
      jordan: getProof(signers.jordan.address, merkleTree),
      kobe: getProof(signers.kobe.address, merkleTree)
    };
    newProofs = {
      owner: getProof(signers.owner.address, newMerkleTree),
      bob: getProof(signers.bob.address, newMerkleTree),
      alice: getProof(signers.alice.address, newMerkleTree),
      james: getProof(signers.james.address, newMerkleTree),
      jordan: getProof(signers.jordan.address, newMerkleTree),
      kobe: getProof(signers.kobe.address, newMerkleTree)
    };
  });

  it("Should deploy DAO correctly and verify Merkle proofs", async function () {
    expect(await dao.merkleRoot()).to.equal(root);
    expect(await dao.name()).to.equal("Gov Token");
    expect(await dao.symbol()).to.equal("GT");
    expect(await dao.decimals()).to.equal(1); // Assuming override fix

    // Verify members
    expect(await dao.verify(proofs.owner, signers.owner.address)).to.be.true;
    expect(await dao.verify(proofs.bob, signers.bob.address)).to.be.true;
    expect(await dao.verify(proofs.james, signers.james.address)).to.be.false; //Invalid proof
  });

  it("Should allow owner to update Merkle root", async function () {
    expect(await dao.updateMerkleRoot(newRoot))
      .to.emit(dao, "MerkleRootUpdated")
      .withArgs(newRoot);
    expect(await dao.merkleRoot()).to.equal(newRoot);

    // Non-owner cannot update
    await expect(dao.connect(signers.bob).updateMerkleRoot(newRoot)).to.be.reverted;
  });

  it("Should create a proposal and emit event", async function () {
    const description = "Test Proposal";
    const votingPeriod = 86400; // 1 day in seconds
    const target = signers.kobe.address; // Send ETH to this address
    const value = ethers.parseEther("1.0");
    const executionCalldata = "0x"; // Empty for simple ETH transfer

    // Fund DAO
    await signers.owner.sendTransaction({ to: daoContractAddress, value: ethers.parseEther("2.0") });

    // Create proposal as member1
    expect(await dao.connect(signers.owner).createProposal(proofs.owner, description, votingPeriod, target, value, executionCalldata))
      .to.emit(dao, "ProposalCreated")
      .withArgs(signers.owner.address, await dao.proposal(1));

    const proposalAddress = await dao.proposal(1);
    const proposal = await ethers.getContractAt("Proposal", proposalAddress);

    expect(await proposal.description()).to.equal(description);
    expect(await proposal.targetAddress()).to.equal(target);
    expect(await proposal.value()).to.equal(value);
    expect(await proposal.executionCalldata()).to.equal(executionCalldata);
    expect(await proposal.dao()).to.equal(daoContractAddress);
  });

  it("Should handle full voting process: commit, reveal, and count votes", async function () {
    const description = "Voting Test";
    const votingPeriod = 3600; // 1 hour
    const target = signers.kobe.address; // No-op
    const value = 0;
    const executionCalldata = "0x";

    // Create proposal
    await dao.connect(signers.owner).createProposal(proofs.owner, description, votingPeriod, target, value, executionCalldata);
    const proposalAddress = await dao.proposal(1);
    const proposal = await ethers.getContractAt("Proposal", proposalAddress);

    // Advance time to start
    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine");

    // Commit votes (support: 1=yes/odd, 0=no/even)
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt1"));
    const commitment1 = ethers.solidityPackedKeccak256(["uint8","bytes32"], [1, salt1]); // Yes
    expect(await proposal.connect(signers.owner).commitVote(proofs.owner, commitment1))
      .to.emit(proposal, "VoteCommitted")
      .withArgs(signers.owner.address, commitment1);

    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt2"));
    const commitment2 = ethers.solidityPackedKeccak256(["uint8","bytes32"], [0, salt2]); // No
    expect(await proposal.connect(signers.bob).commitVote(proofs.bob, commitment2))
      .to.emit(proposal, "VoteCommitted")
      .withArgs(signers.bob.address, commitment2);

    const salt3 = ethers.keccak256(ethers.toUtf8Bytes("salt3"));
    const commitment3 = ethers.solidityPackedKeccak256(["uint8","bytes32"], [0, salt3]); // No  

    // Non-member cannot commit
    await expect(proposal.connect(signers.james).commitVote([], commitment1)).to.be.revertedWith("Only member can participate");

    // Already committed cannot recommit
    await expect(proposal.connect(signers.owner).commitVote(proofs.owner, commitment1)).to.be.revertedWith("Already committed");

    // Advance time past commitEnd (half period)
    // const currentBlock = await provider.getBlock("latest");
    // const currentTimestamp = currentBlock?.timestamp;
    // console.log(`current timestamp is ${currentTimestamp}`)
    await network.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await network.provider.send("evm_mine");
    // const newBlock = await provider.getBlock("latest");
    // const newTimestamp = newBlock?.timestamp
    // console.log(`new timestamp is ${newTimestamp}`)
    // console.log(`commit end at ${await proposal.commitEnd()}`)
    // console.log(`reveal end at ${await proposal.revealEnd()}`)

    // Cannot commit after commitEnd
    await expect(proposal.connect(signers.alice).commitVote(proofs.alice, commitment3)).to.be.revertedWith("Commit period ended");

    // Reveal votes
    expect(await proposal.connect(signers.owner).revealVote(1, salt1))
      .to.emit(proposal, "VoteRevealed")
      .withArgs(signers.owner.address, 1);
    expect(await dao.balanceOf(signers.owner.address)).to.equal(1); //Reputation added

    expect(await proposal.connect(signers.bob).revealVote(0, salt2))
      .to.emit(proposal, "VoteRevealed")
      .withArgs(signers.bob.address, 0);
    expect(await dao.balanceOf(signers.bob.address)).to.equal(1);

    // Check vote counts (weight = 1 + balance; balance=0 initially, +1 after reveal, but counted before add?)
    // Note: Since addReputation after _countVote, weight=1 (initial 0 +1 base)
    expect(await proposal.yesVotes()).to.equal(1); // member1 yes
    expect(await proposal.noVotes()).to.equal(1); // member2 no

    // Invalid reveal
    await expect(proposal.connect(signers.owner).revealVote(1, salt1)).to.be.revertedWith("Already revealed");
    await expect(proposal.connect(signers.alice).revealVote(2, salt1)).to.be.revertedWith("Invalid reveal");

    // Advance past revealEnd
    await network.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await network.provider.send("evm_mine");

    // Cannot reveal after revealEnd
    await expect(proposal.connect(signers.alice).revealVote(0, salt3)).to.be.revertedWith("Proposal not active");
  });

  it("Should execute proposal if passed, mint bonus, and handle failures", async function () {
    const description = "Execution Test";
    const votingPeriod = 3600;
    const target = signers.bob.address; // Send ETH to member2
    const value = ethers.parseEther("1.0");
    const executionCalldata = "0x";

    // Fund DAO
    await signers.owner.sendTransaction({ to: daoContractAddress, value: ethers.parseEther("2.0") });

    // Create proposal
    await dao.connect(signers.owner).createProposal(proofs.owner, description, votingPeriod, target, value, executionCalldata);
    const proposalAddress = await dao.proposal(1);
    const proposal = await ethers.getContractAt("Proposal", proposalAddress);

    // Commit and reveal yes vote from member1 (to pass: yes=1 > no=0)
    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const commitment = ethers.solidityPackedKeccak256(["uint8","bytes32"], [1, salt]);
    await proposal.connect(signers.owner).commitVote(proofs.owner, commitment);

    // Advance to reveal phase
    await network.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await network.provider.send("evm_mine");

    await proposal.connect(signers.owner).revealVote(1, salt);
    expect(await proposal.yesVotes()).to.equal(1);
    expect(await proposal.noVotes()).to.equal(0);

    // Advance past voting
    await ethers.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await ethers.provider.send("evm_mine");

    // Execute (by anyone, but calls dao.executeProposal)
    const initialBalance = await provider.getBalance(signers.bob.address);
    expect(await proposal.connect(signers.kobe).execute())
      .to.emit(proposal, "ProposalExecuted") // Assuming owner executes

    expect(await provider.getBalance(signers.bob.address)).to.equal(initialBalance + value); // ETH sent
    expect(await dao.balanceOf(signers.kobe.address)).to.equal(1); //Executor bonus mint
    expect(await proposal.executed()).to.be.true;

    // Cannot re-execute
    await expect(proposal.execute()).to.be.revertedWith("Already executed");

    // Test failure: insufficient votes (new proposal)
    await dao.connect(signers.owner).createProposal(proofs.owner, "Fail Test", votingPeriod, target, value, executionCalldata);
    const failProposalAddr = await dao.proposal(2);
    const failProposal = await ethers.getContractAt("Proposal", failProposalAddr);

    // No votes: yes=0 == no=0, should fail
    await ethers.provider.send("evm_increaseTime", [votingPeriod + 10]);
    await ethers.provider.send("evm_mine");
    await expect(failProposal.execute()).to.be.revertedWith("Proposal did not pass");

    // Test insufficient ETH
    await dao.connect(signers.owner).createProposal(proofs.owner, "ETH Fail", votingPeriod, target, ethers.parseEther("10.0"), executionCalldata);
    const ethFailAddr = await dao.proposal(3);
    const ethFail = await ethers.getContractAt("Proposal", ethFailAddr);

    // Simulate pass with vote
    await ethFail.connect(signers.owner).commitVote(proofs.owner, commitment);
    await ethers.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await ethers.provider.send("evm_mine");
    await ethFail.connect(signers.owner).revealVote(1, salt);
    await ethers.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await ethers.provider.send("evm_mine");

    await expect(ethFail.execute()).to.be.revertedWith("DAO: insufficient ETH");
  });

  it("Should handle reputation minting via addReputation", async function () {
    // Reputation added on reveal (tested above), here test indirect via proposal call
    // Since addReputation only callable by proposal, it's covered in voting tests
    expect(await dao.balanceOf(signers.owner.address)).to.equal(0); // Initial

    // Create and vote to mint
    const description = "Rep Test";
    const votingPeriod = 3600;
    const target = signers.bob.address;
    const value = 0;
    const executionCalldata = "0x";

    await dao.connect(signers.owner).createProposal(proofs.owner, description, votingPeriod, target, value, executionCalldata);
    const proposalAddress = await dao.proposal(1);
    const proposal = await ethers.getContractAt("Proposal", proposalAddress);

    const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
    const commitment = ethers.solidityPackedKeccak256(["uint8","bytes32"], [1, salt]);
    await proposal.connect(signers.owner).commitVote(proofs.owner, commitment);

    await network.provider.send("evm_increaseTime", [votingPeriod / 2 + 10]);
    await network.provider.send("evm_mine");

    await proposal.connect(signers.owner).revealVote(1, salt);
    expect(await dao.balanceOf(signers.owner.address)).to.equal(1); //Minted via addReputation

    // Non-proposal cannot mint
    await expect(dao.connect(signers.kobe).addReputation(1, signers.kobe.address, 10)).to.be.revertedWith("Not proposal contract");
  });

  it("Should reject actions during inactive proposal", async function () {
    const description = "Inactive Test";
    const votingPeriod = 3600;
    const target = signers.bob.address;
    const value = 0;
    const executionCalldata = "0x";

    await dao.connect(signers.owner).createProposal(proofs.owner, description, votingPeriod, target, value, executionCalldata);
    const proposalAddress = await dao.proposal(1);
    const proposal = await ethers.getContractAt("Proposal", proposalAddress);

    // Advance past revealEnd
    await ethers.provider.send("evm_increaseTime", [votingPeriod + 10]);
    await ethers.provider.send("evm_mine");

    expect(await proposal.isActive()).to.be.false;

    // Cannot commit or reveal when inactive
    const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint8","bytes32"], [1, ethers.keccak256(ethers.toUtf8Bytes("salt"))]));
    await expect(proposal.connect(signers.owner).commitVote(proofs.owner, commitment)).to.be.revertedWith("Proposal not active");
    await expect(proposal.connect(signers.owner).revealVote(1, ethers.keccak256(ethers.toUtf8Bytes("salt")))).to.be.revertedWith("Proposal not active");
  });
});