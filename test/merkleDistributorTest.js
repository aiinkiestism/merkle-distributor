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
        accounts.map((account, ix) => {
          return {
            account: account.address,
            amount: ethers.BigNumber.from(ix + 1),
          };
        })
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

  //     describe('realistic size tree', () => {
  //       let merkleDistributor: Contract
  //       let tree: BalanceTree
  //       const NUM_LEAVES = 100_000
  //       const NUM_SAMPLES = 25
  //       const elements: { account: string; amount: ethers.BigNumber }[] = []
  //       for (let i = 0; i < NUM_LEAVES; i++) {
  //         const node = { account: accounts[1].address, amount: ethers.BigNumber.from(100) }
  //         elements.push(node)
  //       }
  //       tree = new BalanceTree(elements)

  //       it('proof verification works', () => {
  //         const root = Buffer.from(tree.getHexRoot().slice(2), 'hex')
  //         for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
  //           const proof = tree
  //             .getProof(i, accounts[1].address, ethers.BigNumber.from(100))
  //             .map((el) => Buffer.from(el.slice(2), 'hex'))
  //           const validProof = BalanceTree.verifyProof(i, accounts[1].address, ethers.BigNumber.from(100), proof, root)
  //           expect(validProof).to.be.true
  //         }
  //       })

  //       beforeEach('deploy', async () => {
  //         merkleDistributor = await deployContract(wallet0, merkleDistributor, [token.address, tree.getHexRoot()], overrides)
  //         await token.setBalance(merkleDistributor.address, constants.MaxUint256)
  //       })

  //       it('gas', async () => {
  //         const proof = tree.getProof(50000, accounts[1].address, ethers.BigNumber.from(100))
  //         const tx = await merkleDistributor.claim(50000, accounts[1].address, 100, proof, overrides)
  //         const receipt = await tx.wait()
  //         expect(receipt.gasUsed).to.eq(91650)
  //       })
  //       it('gas deeper node', async () => {
  //         const proof = tree.getProof(90000, accounts[1].address, ethers.BigNumber.from(100))
  //         const tx = await merkleDistributor.claim(90000, accounts[1].address, 100, proof, overrides)
  //         const receipt = await tx.wait()
  //         expect(receipt.gasUsed).to.eq(91586)
  //       })
  //       it('gas average random distribution', async () => {
  //         let total: ethers.BigNumber = ethers.BigNumber.from(0)
  //         let count: number = 0
  //         for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
  //           const proof = tree.getProof(i, accounts[1].address, ethers.BigNumber.from(100))
  //           const tx = await merkleDistributor.claim(i, accounts[1].address, 100, proof, overrides)
  //           const receipt = await tx.wait()
  //           total = total.add(receipt.gasUsed)
  //           count++
  //         }
  //         const average = total.div(count)
  //         expect(average).to.eq(77075)
  //       })
  //       // this is what we gas golfed by packing the bitmap
  //       it('gas average first 25', async () => {
  //         let total: ethers.BigNumber = ethers.BigNumber.from(0)
  //         let count: number = 0
  //         for (let i = 0; i < 25; i++) {
  //           const proof = tree.getProof(i, accounts[1].address, ethers.BigNumber.from(100))
  //           const tx = await merkleDistributor.claim(i, accounts[1].address, 100, proof, overrides)
  //           const receipt = await tx.wait()
  //           total = total.add(receipt.gasUsed)
  //           count++
  //         }
  //         const average = total.div(count)
  //         expect(average).to.eq(62824)
  //       })

  //       it('no double claims in random distribution', async () => {
  //         for (let i = 0; i < 25; i += Math.floor(Math.random() * (NUM_LEAVES / NUM_SAMPLES))) {
  //           const proof = tree.getProof(i, accounts[1].address, ethers.BigNumber.from(100))
  //           await merkleDistributor.claim(i, accounts[1].address, 100, proof, overrides)
  //           await expect(merkleDistributor.claim(i, accounts[1].address, 100, proof, overrides)).to.be.revertedWith(
  //             'MerklemerkleDistributor: Drop already claimed.'
  //           )
  //         }
  //       })
  //     })
  //   })

  //   describe('parseBalanceMap', () => {
  //     let merkleDistributor: Contract
  //     let claims: {
  //       [account: string]: {
  //         index: number
  //         amount: string
  //         proof: string[]
  //       }
  //     }
  //     beforeEach('deploy', async () => {
  //       const { claims: innerClaims, merkleRoot, tokenTotal } = parseBalanceMap({
  //         [accounts[1].address]: 200,
  //         [accounts[2].address]: 300,
  //         [accounts[2].address]: 250,
  //       })
  //       expect(tokenTotal).to.eq('0x02ee') // 750
  //       claims = innerClaims
  //       merkleDistributor = await deployContract(wallet0, merkleDistributor, [token.address, merkleRoot], overrides)
  //       await token.setBalance(merkleDistributor.address, tokenTotal)
  //     })

  //     it('check the proofs is as expected', () => {
  //       expect(claims).to.deep.eq({
  //         [accounts[1].address]: {
  //           index: 0,
  //           amount: '0xc8',
  //           proof: ['0x2a411ed78501edb696adca9e41e78d8256b61cfac45612fa0434d7cf87d916c6'],
  //         },
  //         [accounts[2].address]: {
  //           index: 1,
  //           amount: '0x012c',
  //           proof: [
  //             '0xbfeb956a3b705056020a3b64c540bff700c0f6c96c55c0a5fcab57124cb36f7b',
  //             '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
  //           ],
  //         },
  //         [accounts[2].address]: {
  //           index: 2,
  //           amount: '0xfa',
  //           proof: [
  //             '0xceaacce7533111e902cc548e961d77b23a4d8cd073c6b68ccf55c62bd47fc36b',
  //             '0xd31de46890d4a77baeebddbd77bf73b5c626397b73ee8c69b51efe4c9a5a72fa',
  //           ],
  //         },
  //       })
  //     })

  //     it('all claims work exactly once', async () => {
  //       for (let account in claims) {
  //         const claim = claims[account]
  //         await expect(merkleDistributor.claim(claim.index, account, claim.amount, claim.proof, overrides))
  //           .to.emit(merkleDistributor, 'Claimed')
  //           .withArgs(claim.index, account, claim.amount)
  //         await expect(merkleDistributor.claim(claim.index, account, claim.amount, claim.proof, overrides)).to.be.revertedWith(
  //           'MerkleDistributor: Drop already claimed.'
  //         )
  //       }
  //       expect(await token.balanceOf(merkleDistributor.address)).to.eq(0)
  //     })
  // })
});
