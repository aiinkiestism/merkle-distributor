const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("MerkleDistributor", () => {
  let accounts;
  let testERC20;
  let merkleDistributor;

  beforeEach(async () => {
    await deployments.fixture();
    accounts = await ethers.getSigners();

    const TestERC20 = await deployments.get("TestERC20");
    testERC20 = new ethers.Contract(
      TestERC20.address,
      TestERC20.abi,
      accounts[0]
    );

    const MerkleDistributor = await deployments.get("MerkleDistributor");
    merkleDistributor = new ethers.Contract(
      MerkleDistributor.address,
      MerkleDistributor.abi,
      accounts[0]
    );
  });

  describe("constructor", () => {
    it("Deploys with correct token and root", async () => {
      const MerkleDistributor = await ethers.getContractFactory(
        "MerkleDistributor"
      );
      const distributor = await MerkleDistributor.deploy(
        testERC20.address,
        ZERO_BYTES32
      );

      expect(await distributor.token()).to.be.equal(testERC20.address);
      expect(await distributor.merkleRoot()).to.be.equal(ZERO_BYTES32);
    });
  });

  describe("claim", () => {
    it("fails for empty proof", async () => {
      await expect(
        merkleDistributor.claim(0, accounts[1].address, 10, [])
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });
  });
});
