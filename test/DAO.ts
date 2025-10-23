import {MerkleTree} from 'merkletreejs';
import keccak256 = require('keccak256');
import { DAO, DAO__factory, Proposal, Proposal__factory, Airdrop, Airdrop__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

type Signers = {
    owner: HardhatEthersSigner;
    alice: HardhatEthersSigner;
    bob: HardhatEthersSigner;
    james: HardhatEthersSigner;
    jordan: HardhatEthersSigner;
    kobe: HardhatEthersSigner;
}

async function deployFixture() {
  const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();  
  let signers: Signers = {
    owner: ethSigners[0],
    bob: ethSigners[1],
    alice: ethSigners[2],
    james: ethSigners[3],
    jordan: ethSigners[4],
    kobe: ethSigners[5]
  }
  const leavesAddr = [
    signers.owner.address,
    signers.bob.address,
    signers.alice.address,
  ]
  console.log('build merkle tree by first three signers: owner bob alice')

  // build leaves
  const leaves = leavesAddr.map(addr => keccak256(addr.toLowerCase().replace('0x', '')));
  // build Merkle Tree
  const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  // get Merkle Root
  const root = merkleTree.getHexRoot();
  // console.log(root)

  const factory = (await ethers.getContractFactory("DAO")) as DAO__factory;
  const daoContract = (await factory.deploy(root)) as DAO;
  const daoContractAddress = await daoContract.getAddress();

  return { daoContract, daoContractAddress, merkleTree };
}

describe("DAO", function () {
  let signers: Signers;
  let daoContract: DAO;
  let daoContractAddress: String;
  let merkleTree: MerkleTree;
  
  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = {
        owner: ethSigners[0],
        bob: ethSigners[1],
        alice: ethSigners[2],
        james: ethSigners[3],
        jordan: ethSigners[4],
        kobe: ethSigners[5]
    }
  })

  beforeEach(async () => {
    // Deploy a new instance of the contract before each test
    ({ daoContract, daoContractAddress, merkleTree } = await deployFixture());
  })

  it("should be deployed", async function () {
    console.log(`Counter has been deployed at address ${daoContractAddress}`);
    // Test the deployed address is valid
    expect(ethers.isAddress(daoContractAddress)).to.eq(true);
  });

  it("value should be true after call verfy for signers: owner ,bob, alice", async function () {
    const ownerProof = getProof(signers.owner.address, merkleTree)
    const bobProof = getProof(signers.bob.address, merkleTree)
    const aliceProof = getProof(signers.alice.address, merkleTree)
    const boolOwner = await daoContract.connect(signers.owner).verify(
        ownerProof, signers.owner.address
    );
    const boolBob = await daoContract.connect(signers.bob).verify(
        bobProof, signers.bob.address
    );
    const boolAlice = await daoContract.connect(signers.alice).verify(
        aliceProof, signers.alice.address
    );
    console.log(`DAO.verify(ownerProof, owner) === ${boolOwner}`);
    console.log(`DAO.verify(bobProof, bob) === ${boolBob}`);
    console.log(`DAO.verify(aliceProof, alice) === ${boolAlice}`);
    // Expect owner bob alice in the merkle tree
    expect(boolOwner).to.eq(true);
    expect(boolBob).to.eq(true);
    expect(boolAlice).to.eq(true);
  });

  it("value should be false after call verfy for signers: james ,jordan, kobe", async function () {
    const jamesProof = getProof(signers.james.address, merkleTree)
    const jordanProof = getProof(signers.jordan.address, merkleTree)
    const kobeProof = getProof(signers.kobe.address, merkleTree)
    const boolJames = await daoContract.connect(signers.james).verify(
        jamesProof, signers.james.address
    );
    const boolJordan = await daoContract.connect(signers.jordan).verify(
        jordanProof, signers.jordan.address
    );
    const boolKobe = await daoContract.connect(signers.kobe).verify(
        kobeProof, signers.kobe.address
    );
    console.log(`DAO.verify(jamesProof, james) === ${boolJames}`);
    console.log(`DAO.verify(jordanProof, jordan) === ${boolJordan}`);
    console.log(`DAO.verify(kobeProof, kobe) === ${boolKobe}`);
    // Expect owner bob alice in the merkle tree
    expect(boolJames).to.eq(false);
    expect(boolJordan).to.eq(false);
    expect(boolKobe).to.eq(false);
  });

  it("only leaves will be able to participate in proposal or airdrop", async function () {
    let [ ownerProof, bobProof, aliceProof, jamesProof, jordanProof, kobeProof] =
        [
            getProof(signers.owner.address, merkleTree),
            getProof(signers.bob.address, merkleTree),
            getProof(signers.alice.address, merkleTree),
            getProof(signers.james.address, merkleTree),
            getProof(signers.jordan.address, merkleTree),
            getProof(signers.kobe.address, merkleTree),
        ]
    const createProposalTx = await daoContract.connect(signers.bob).createProposal(bobProof)
    const createAirdropTx = await daoContract.connect(signers.alice).createAirdrop(aliceProof)

    const receipt1 = await createProposalTx.wait()
    const receipt2 = await createAirdropTx.wait()
    // console.log("Full logs: ", JSON.stringify(receipt1?.logs, null, 2))    
    const proposalAddr = findAddress(receipt1)
    const airdropAddr = findAddress(receipt2)
    console.log(`proposalContract address:${proposalAddr}`, `isAddress(proposalAddr) === ${ethers.isAddress(proposalAddr)}`)
    console.log(`airdropContract address:${airdropAddr}`, `isAddress(airdropAddr) === ${ethers.isAddress(airdropAddr)}`)
    // get contract instances
    const proposalContract = (await ethers.getContractAt("Proposal", proposalAddr)) as Proposal
    const airdropContract = (await ethers.getContractAt("Airdrop", airdropAddr)) as Airdrop
    const addr1 = await proposalContract.dao()
    const addr2 = await airdropContract.dao()
    // Expect both delegateContract is daoContractAddress
    expect(addr1 === daoContractAddress).to.eq(true)
    expect(addr2 === daoContractAddress).to.eq(true)

    const tx1 = await proposalContract.connect(signers.owner).vote(ownerProof, true)
    const tx2 = await proposalContract.connect(signers.bob).vote(bobProof, true)
    const tx3 = await proposalContract.connect(signers.alice).vote(aliceProof, false)
    await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()])
    expect(await proposalContract.yesVotes() === 2n).to.eq(true)
    expect(await proposalContract.noVotes() === 1n).to.eq(true)
    // expect james failed participating in proposal
    let tx: any;
    try {
      tx = await proposalContract.connect(signers.james).vote(jamesProof, true)
    } catch (error) {
      expect(tx).to.eq(undefined)
    }
    const newLeavesAddr = [
      signers.owner.address,
      signers.bob.address,
      signers.alice.address,
      signers.james.address,
      signers.jordan.address,
      signers.kobe.address
    ]
    console.log('\nrebuild merkle tree by all signers: owner bob alice james jordan kobe')
    // build leaves
    const leaves = newLeavesAddr.map(addr => keccak256(addr.toLowerCase().replace('0x', '')));
    // build Merkle Tree
    const newMerkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    // get Merkle Root
    const root = newMerkleTree.getHexRoot();
    console.log('update merkle root in daoContract')
    await daoContract.updateMerkleRoot(root)
    expect(await daoContract.merkleRoot()).to.eq(root)

    jamesProof = getProof(signers.james.address, newMerkleTree)
    jordanProof = getProof(signers.jordan.address, newMerkleTree)
    kobeProof = getProof(signers.kobe.address, newMerkleTree)
    const boolJames = await daoContract.connect(signers.james).verify(
        jamesProof, signers.james.address
    );
    const boolJordan = await daoContract.connect(signers.jordan).verify(
        jordanProof, signers.jordan.address
    );
    const boolKobe = await daoContract.connect(signers.kobe).verify(
        kobeProof, signers.kobe.address
    );
    console.log(`DAO.verify(jamesProof, james) === ${boolJames}`);
    console.log(`DAO.verify(jordanProof, jordan) === ${boolJordan}`);
    console.log(`DAO.verify(kobeProof, kobe) === ${boolKobe}`);
    // Expect owner bob alice in the merkle tree
    expect(boolJames).to.eq(true);
    expect(boolJordan).to.eq(true);
    expect(boolKobe).to.eq(true);
  });
});

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