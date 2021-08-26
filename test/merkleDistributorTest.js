const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
const { BalanceTree } = require("../src/BalanceTree");
const { parseBalanceMap } = require("../src/parseBalanceMap");

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("MerkleDistributor", () => {
  let accounts;
  let token;
  let merkleDistributor;

  beforeEach(async () => {
    await deployments.fixture();
    accounts = await ethers.getSigners();

    const TestERC20 = await deployments.get("TestERC20");
    token = new ethers.Contract(TestERC20.address, TestERC20.abi, accounts[0]);

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
        token.address,
        ZERO_BYTES32
      );

      expect(await distributor.token()).to.be.equal(token.address);
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

  describe("two account tree", () => {
    let tree;

    beforeEach("deploy", async () => {
      tree = new BalanceTree([
        { account: accounts[1].address, amount: ethers.BigNumber.from(100) },
        { account: accounts[2].address, amount: ethers.BigNumber.from(101) },
      ]);
      await merkleDistributor.setMerkleRoot(tree.getHexRoot());
      await token.setBalance(merkleDistributor.address, 201);
    });

    it("successful claim", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(merkleDistributor.claim(0, accounts[1].address, 100, proof0))
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(0, accounts[1].address, 100);
      const proof1 = tree.getProof(
        1,
        accounts[2].address,
        ethers.BigNumber.from(101)
      );
      await expect(merkleDistributor.claim(1, accounts[2].address, 101, proof1))
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(1, accounts[2].address, 101);
    });

    it("transfers the token", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      expect(await token.balanceOf(accounts[1].address)).to.be.equal(0);
      await merkleDistributor.claim(0, accounts[1].address, 100, proof0);
      expect(await token.balanceOf(accounts[1].address)).to.be.equal(100);
    });

    it("must have enough to transfer", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await token.setBalance(merkleDistributor.address, 99);
      await expect(
        merkleDistributor.claim(0, accounts[1].address, 100, proof0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("sets #isClaimed", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      expect(await merkleDistributor.isClaimed(0)).to.be.equal(false);
      expect(await merkleDistributor.isClaimed(1)).to.be.equal(false);
      await merkleDistributor.claim(0, accounts[1].address, 100, proof0);
      expect(await merkleDistributor.isClaimed(0)).to.be.equal(true);
      expect(await merkleDistributor.isClaimed(1)).to.be.equal(false);
    });

    it("cannot allow two claims", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await merkleDistributor.claim(0, accounts[1].address, 100, proof0);
      await expect(
        merkleDistributor.claim(0, accounts[1].address, 100, proof0)
      ).to.be.revertedWith("MerkleDistributor: ALREADY_CLAIMED");
    });

    it("cannot claim more than once: 0 and then 1", async () => {
      await merkleDistributor.claim(
        0,
        accounts[1].address,
        100,
        tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
      );
      await merkleDistributor.claim(
        1,
        accounts[2].address,
        101,
        tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
      );

      await expect(
        merkleDistributor.claim(
          0,
          accounts[1].address,
          100,
          tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
        )
      ).to.be.revertedWith("MerkleDistributor: ALREADY_CLAIMED");
    });

    it("cannot claim more than once: 1 and then 0", async () => {
      await merkleDistributor.claim(
        1,
        accounts[2].address,
        101,
        tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
      );
      await merkleDistributor.claim(
        0,
        accounts[1].address,
        100,
        tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
      );

      await expect(
        merkleDistributor.claim(
          1,
          accounts[2].address,
          101,
          tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
        )
      ).to.be.revertedWith("MerkleDistributor: ALREADY_CLAIMED");
    });

    it("cannot claim for address other than proof", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(
        merkleDistributor.claim(1, accounts[2].address, 101, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });

    it("cannot claim more than proof", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(
        merkleDistributor.claim(0, accounts[1].address, 101, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });

    it("gas", async () => {
      const proof = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      const tx = await merkleDistributor.claim(
        0,
        accounts[1].address,
        100,
        proof
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.equal(83219);
    });
  });

  describe("larger tree", () => {
    let tree;
    beforeEach("deploy", async () => {
      tree = new BalanceTree(
        accounts.map((account, ix) => ({
          account: account.address,
          amount: ethers.BigNumber.from(ix + 1),
        }))
      );

      await merkleDistributor.setMerkleRoot(tree.getHexRoot());
      await token.setBalance(merkleDistributor.address, 201);
    });

    it("claim index 4", async () => {
      const proof = tree.getProof(
        4,
        accounts[4].address,
        ethers.BigNumber.from(5)
      );
      await expect(merkleDistributor.claim(4, accounts[4].address, 5, proof))
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(4, accounts[4].address, 5);
    });

    it("claim index 9", async () => {
      const proof = tree.getProof(
        9,
        accounts[9].address,
        ethers.BigNumber.from(10)
      );
      await expect(merkleDistributor.claim(9, accounts[9].address, 10, proof))
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(9, accounts[9].address, 10);
    });

    it("gas", async () => {
      const proof = tree.getProof(
        9,
        accounts[9].address,
        ethers.BigNumber.from(10)
      );
      const tx = await merkleDistributor.claim(
        9,
        accounts[9].address,
        10,
        proof
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.eq(86759);
    });

    it("gas second down about 15k", async () => {
      await merkleDistributor.claim(
        0,
        accounts[0].address,
        1,
        tree.getProof(0, accounts[0].address, ethers.BigNumber.from(1))
      );
      const tx = await merkleDistributor.claim(
        1,
        accounts[1].address,
        2,
        tree.getProof(1, accounts[1].address, ethers.BigNumber.from(2))
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.eq(69659);
    });
  });

  describe("realistic size tree", () => {
    let tree;
    const NUM_LEAVES = 100000;
    const NUM_SAMPLES = 25;
    const elements = [];

    before(async () => {
      accounts = await ethers.getSigners();
      for (let i = 0; i < NUM_LEAVES; i++) {
        const node = {
          account: accounts[1].address,
          amount: ethers.BigNumber.from(100),
        };
        elements.push(node);
      }
      tree = new BalanceTree(elements);
    });

    beforeEach(async () => {
      await token.setBalance(
        merkleDistributor.address,
        ethers.constants.MaxInt256 // using int to avoid overflow with supply (vs uint.max)
      );
      await merkleDistributor.setMerkleRoot(tree.getHexRoot());
    });

    it("proof verification works", () => {
      const root = Buffer.from(tree.getHexRoot().slice(2), "hex");
      for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
        const proof = tree
          .getProof(i, accounts[1].address, ethers.BigNumber.from(100))
          .map((el) => Buffer.from(el.slice(2), "hex"));
        const validProof = BalanceTree.verifyProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100),
          proof,
          root
        );
        expect(validProof).to.equal(true);
      }
    });

    it("gas", async () => {
      const proof = tree.getProof(
        50000,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      const tx = await merkleDistributor.claim(
        50000,
        accounts[1].address,
        100,
        proof
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.equal(97365);
    });

    it("gas deeper node", async () => {
      const proof = tree.getProof(
        90000,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      const tx = await merkleDistributor.claim(
        90000,
        accounts[1].address,
        100,
        proof
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.equal(97399);
    });

    /* eslint no-await-in-loop: 0 */

    it("gas average random distribution", async () => {
      let total = ethers.BigNumber.from(0);
      let count = 0;
      for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
        const proof = tree.getProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100)
        );
        const tx = await merkleDistributor.claim(
          i,
          accounts[1].address,
          100,
          proof
        );
        const receipt = await tx.wait();
        total = total.add(receipt.gasUsed);
        count += 1;
      }
      const average = total.div(count);
      expect(average).to.equal(80936);
    });

    it("gas average first 25", async () => {
      let total = ethers.BigNumber.from(0);
      let count = 0;
      for (let i = 0; i < 25; i++) {
        const proof = tree.getProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100)
        );
        const tx = await merkleDistributor.claim(
          i,
          accounts[1].address,
          100,
          proof
        );
        const receipt = await tx.wait();
        total = total.add(receipt.gasUsed);
        count += 1;
      }
      const average = total.div(count);
      expect(average).to.eq(64509);
    });

    it("no double claims in random distribution", async () => {
      for (
        let i = 0;
        i < 25;
        i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))
      ) {
        const proof = tree.getProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100)
        );
        await merkleDistributor.claim(i, accounts[1].address, 100, proof);
        await expect(
          merkleDistributor.claim(i, accounts[1].address, 100, proof)
        ).to.be.revertedWith("MerkleDistributor: ALREADY_CLAIMED");
      }
    });
  });

  describe("parseBalanceMap", () => {
    let claimsOut;

    beforeEach(async () => {
      // NOTE: the ordering below is due to the need for sorting of the addressing in the map.
      // unsure if this will hold on other machines, may need to sort them before we cerate map.
      const { claims, merkleRoot, tokenTotal } = parseBalanceMap({
        [accounts[2].address]: 200,
        [accounts[1].address]: 300,
        [accounts[3].address]: 250,
      });
      expect(tokenTotal).to.eq("0x02ee"); // 750
      claimsOut = claims;
      merkleDistributor.setMerkleRoot(merkleRoot);
      await token.setBalance(merkleDistributor.address, tokenTotal);
    });

    it("check the proofs is as expected", () => {
      expect(claimsOut).to.deep.eq({
        [accounts[2].address]: {
          index: 0,
          amount: "0xc8",
          proof: [
            "0x0782528e118c4350a2465fbeabec5e72fff06991a29f21c08d37a0d275e38ddd",
            "0xd48eef31cb6b7ef5a8fb8ef79608aaa21a3c0c17855c721bfda30e965334ff52",
          ],
        },
        [accounts[1].address]: {
          index: 1,
          amount: "0x012c",
          proof: [
            "0xc4ffe061f182b980a5e53513208b4e10664dcf3c2fc955431d1eed6e08a0a144",
            "0xd48eef31cb6b7ef5a8fb8ef79608aaa21a3c0c17855c721bfda30e965334ff52",
          ],
        },
        [accounts[3].address]: {
          index: 2,
          amount: "0xfa",
          proof: [
            "0x1400602339d0a5a17731bea498a2591781420afb5d8df9df7e6007b1adcb1137",
          ],
        },
      });
    });

    it("all claims work exactly once", async () => {
      for (const account in claimsOut) {
        const claim = claimsOut[account];
        await expect(
          merkleDistributor.claim(
            claim.index,
            account,
            claim.amount,
            claim.proof
          )
        )
          .to.emit(merkleDistributor, "Claimed")
          .withArgs(claim.index, account, claim.amount);
        await expect(
          merkleDistributor.claim(
            claim.index,
            account,
            claim.amount,
            claim.proof
          )
        ).to.be.revertedWith("MerkleDistributor: ALREADY_CLAIMED");
      }
      expect(await token.balanceOf(merkleDistributor.address)).to.eq(0);
    });
  });
});
