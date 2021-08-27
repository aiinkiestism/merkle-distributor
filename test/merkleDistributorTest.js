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
        accounts[9].address,
        ZERO_BYTES32
      );

      expect(await distributor.token()).to.be.equal(token.address);
      expect(await distributor.merkleRoot()).to.be.equal(ZERO_BYTES32);
    });
  });

  describe("claim", () => {
    it("fails for empty proof", async () => {
      await expect(
        merkleDistributor
          .connect(accounts[1])
          .claim(0, accounts[1].address, 10, [])
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });
  });

  describe("setMerkleRoot", () => {
    let tree;

    beforeEach("deploy", async () => {
      tree = new BalanceTree([
        { account: accounts[1].address, amount: ethers.BigNumber.from(100) },
        { account: accounts[2].address, amount: ethers.BigNumber.from(101) },
      ]);
    });

    it("can be set by owner", async () => {
      expect(await merkleDistributor.merkleRoot()).to.be.equal(ZERO_BYTES32);
      await merkleDistributor.setMerkleRoot(tree.getHexRoot());
      expect(await merkleDistributor.merkleRoot()).to.be.equal(
        tree.getHexRoot()
      );
    });

    it("reverts when set by non owner", async () => {
      await expect(
        merkleDistributor.connect(accounts[1]).setMerkleRoot(tree.getHexRoot())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("emits MerkleRootUpdated", async () => {
      await expect(await merkleDistributor.setMerkleRoot(tree.getHexRoot()))
        .to.emit(merkleDistributor, "MerkleRootUpdated")
        .withArgs(tree.getHexRoot());
    });
  });

  describe("setFeeAddress", () => {
    it("can be set by owner", async () => {
      expect(await merkleDistributor.feeAddress()).to.be.equal(
        accounts[5].address
      );
      await merkleDistributor.setFeeAddress(accounts[9].address);
      expect(await merkleDistributor.feeAddress()).to.be.equal(
        accounts[9].address
      );
    });

    it("reverts when set by non owner", async () => {
      await expect(
        merkleDistributor
          .connect(accounts[1])
          .setFeeAddress(accounts[9].address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts when the address is a duplicate", async () => {
      await expect(
        merkleDistributor.setFeeAddress(accounts[5].address)
      ).to.be.revertedWith("MerkleDistributor: DUPLICATE_ADDRESS");
    });

    it("reverts when the address is zero address", async () => {
      await expect(
        merkleDistributor.setFeeAddress(ethers.constants.AddressZero)
      ).to.be.revertedWith("MerkleDistributor: INVALID_ADDRESS");
    });

    it("emits FeeAddressUpdated", async () => {
      await expect(await merkleDistributor.setFeeAddress(accounts[9].address))
        .to.emit(merkleDistributor, "FeeAddressUpdated")
        .withArgs(accounts[9].address);
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
      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 100, 100, proof0)
      )
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(0, accounts[1].address, 100);
      const proof1 = tree.getProof(
        1,
        accounts[2].address,
        ethers.BigNumber.from(101)
      );
      await expect(
        merkleDistributor.connect(accounts[2]).claim(1, 101, 51, proof1)
      )
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(1, accounts[2].address, 51);

      await expect(
        merkleDistributor.connect(accounts[2]).claim(1, 101, 50, proof1)
      )
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(1, accounts[2].address, 50);
    });

    it("transfers the token", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      expect(await token.balanceOf(accounts[1].address)).to.be.equal(0);
      await merkleDistributor.connect(accounts[1]).claim(0, 100, 100, proof0);
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
        merkleDistributor.connect(accounts[1]).claim(0, 100, 100, proof0)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("sets lambdaClaimed", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      expect(
        await merkleDistributor.lambdaClaimed(accounts[1].address)
      ).to.be.equal(0);
      expect(
        await merkleDistributor.lambdaClaimed(accounts[2].address)
      ).to.be.equal(0);
      await merkleDistributor.connect(accounts[1]).claim(0, 100, 50, proof0);
      expect(
        await merkleDistributor.lambdaClaimed(accounts[1].address)
      ).to.be.equal(50);
      expect(
        await merkleDistributor.lambdaClaimed(accounts[2].address)
      ).to.be.equal(0);
    });

    it("cannot allow two claims", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await merkleDistributor.connect(accounts[1]).claim(0, 100, 100, proof0);
      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 100, 100, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
    });

    it("cannot claim more than once: 0 and then 1", async () => {
      await merkleDistributor
        .connect(accounts[1])
        .claim(
          0,
          100,
          100,
          tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
        );
      await merkleDistributor
        .connect(accounts[2])
        .claim(
          1,
          101,
          101,
          tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
        );

      await expect(
        merkleDistributor
          .connect(accounts[1])
          .claim(
            0,
            100,
            100,
            tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
          )
      ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
    });

    it("cannot claim more than once: 1 and then 0", async () => {
      await merkleDistributor
        .connect(accounts[2])
        .claim(
          1,
          101,
          101,
          tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
        );
      await merkleDistributor
        .connect(accounts[1])
        .claim(
          0,
          100,
          100,
          tree.getProof(0, accounts[1].address, ethers.BigNumber.from(100))
        );

      await expect(
        merkleDistributor
          .connect(accounts[2])
          .claim(
            1,
            101,
            101,
            tree.getProof(1, accounts[2].address, ethers.BigNumber.from(101))
          )
      ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
    });

    it("cannot claim for address other than proof", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(
        merkleDistributor.connect(accounts[2]).claim(0, 100, 100, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });

    it("cannot claim more than proof", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 101, 101, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });

    it("cannot claim more than amount in single transaction", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 100, 101, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
    });

    it("cannot claim more than amount in multiple transactions", async () => {
      const proof0 = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );

      await merkleDistributor.connect(accounts[1]).claim(0, 100, 30, proof0);
      await merkleDistributor.connect(accounts[1]).claim(0, 100, 30, proof0);
      await merkleDistributor.connect(accounts[1]).claim(0, 100, 30, proof0);
      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 100, 30, proof0)
      ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
    });

    it("cannot claim another users proof", async () => {
      const proof1 = tree.getProof(
        1,
        accounts[2].address,
        ethers.BigNumber.from(101)
      );

      await expect(
        merkleDistributor.connect(accounts[1]).claim(0, 101, 30, proof1)
      ).to.be.revertedWith("MerkleDistributor: INVALID_PROOF");
    });

    it("gas", async () => {
      const proof = tree.getProof(
        0,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      const tx = await merkleDistributor
        .connect(accounts[1])
        .claim(0, 100, 100, proof);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.equal(82626);
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
      await expect(merkleDistributor.connect(accounts[4]).claim(4, 5, 5, proof))
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(4, accounts[4].address, 5);
    });

    it("claim index 9", async () => {
      const proof = tree.getProof(
        9,
        accounts[9].address,
        ethers.BigNumber.from(10)
      );
      await expect(
        merkleDistributor.connect(accounts[9]).claim(9, 10, 10, proof)
      )
        .to.emit(merkleDistributor, "Claimed")
        .withArgs(9, accounts[9].address, 10);
    });

    it("gas", async () => {
      const proof = tree.getProof(
        9,
        accounts[9].address,
        ethers.BigNumber.from(10)
      );
      const tx = await merkleDistributor
        .connect(accounts[9])
        .claim(9, 10, 10, proof);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.eq(86166);
    });

    it("gas second down about 15k", async () => {
      await merkleDistributor
        .connect(accounts[0])
        .claim(
          0,
          1,
          1,
          tree.getProof(0, accounts[0].address, ethers.BigNumber.from(1))
        );
      const tx = await merkleDistributor
        .connect(accounts[1])
        .claim(
          1,
          2,
          2,
          tree.getProof(1, accounts[1].address, ethers.BigNumber.from(2))
        );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.eq(86166);
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
      const tx = await merkleDistributor
        .connect(accounts[1])
        .claim(50000, 100, 100, proof);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.equal(96772);
    });

    it("gas deeper node", async () => {
      const proof = tree.getProof(
        90000,
        accounts[1].address,
        ethers.BigNumber.from(100)
      );
      const tx = await merkleDistributor
        .connect(accounts[1])
        .claim(90000, 100, 100, proof);
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.equal(96806);
    });

    it("gas average random distribution", async () => {
      const transactionPromises = [];
      for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
        const proof = tree.getProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100)
        );

        transactionPromises.push(
          merkleDistributor.connect(accounts[1]).claim(i, 100, 1, proof)
        );
      }

      const transactions = await Promise.all(transactionPromises);
      const receipts = await Promise.all(transactions.map((tx) => tx.wait()));
      const total = ethers.BigNumber.from(
        receipts.reduce(
          (prevValue, currentValue) => prevValue.add(currentValue.gasUsed),
          ethers.BigNumber.from(0)
        )
      );

      const average = total.div(receipts.length);
      expect(average).to.equal(63927);
    });

    it("gas average first 25", async () => {
      const transactionPromises = [];
      for (let i = 0; i < 25; i++) {
        const proof = tree.getProof(
          i,
          accounts[1].address,
          ethers.BigNumber.from(100)
        );
        transactionPromises.push(
          merkleDistributor.connect(accounts[1]).claim(i, 100, 1, proof)
        );
      }
      const transactions = await Promise.all(transactionPromises);
      const receipts = await Promise.all(transactions.map((tx) => tx.wait()));
      const total = ethers.BigNumber.from(
        receipts.reduce(
          (prevValue, currentValue) => prevValue.add(currentValue.gasUsed),
          ethers.BigNumber.from(0)
        )
      );

      const average = total.div(receipts.length);
      expect(average).to.eq(63916);
    });
  });

  describe("parseBalanceMap", () => {
    let claimsOut;
    let claimsWSigners;

    beforeEach(async () => {
      // NOTE: the ordering below is due to the need for sorting of the addressing in the map.
      // unsure if this will hold on other machines, may need to sort them before we cerate map.
      const { claims, merkleRoot, tokenTotal } = parseBalanceMap({
        [accounts[2].address]: 200,
        [accounts[1].address]: 300,
        [accounts[3].address]: 250,
      });
      claimsOut = JSON.parse(JSON.stringify(claims)); // deep copy to make the checks below work easily
      // add signers for ease of iteration below in test
      [
        claims[accounts[2].address].signer,
        claims[accounts[1].address].signer,
        claims[accounts[3].address].signer,
      ] = [accounts[2], accounts[1], accounts[3]];
      claimsWSigners = claims;
      expect(tokenTotal).to.eq("0x02ee"); // 750
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
      await Promise.all(
        Object.keys(claimsWSigners).map(async (account) => {
          const claim = claimsWSigners[account];
          await expect(
            merkleDistributor
              .connect(claim.signer)
              .claim(claim.index, claim.amount, claim.amount, claim.proof)
          )
            .to.emit(merkleDistributor, "Claimed")
            .withArgs(claim.index, account, claim.amount);
          return expect(
            merkleDistributor
              .connect(claim.signer)
              .claim(claim.index, claim.amount, claim.amount, claim.proof)
          ).to.be.revertedWith("MerkleDistributor: INVALID_CLAIM_AMOUNT");
        })
      );
      expect(await token.balanceOf(merkleDistributor.address)).to.eq(0);
    });
  });
});
