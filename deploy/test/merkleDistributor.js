module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin, feeRecipient } = namedAccounts;
  const TestERC20 = await deployments.get("TestMintableToken");
  const ZERO_BYTES32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  const deployResult = await deploy("MerkleDistributor", {
    from: admin,
    contract: "MerkleDistributor",
    args: [TestERC20.address, feeRecipient, ZERO_BYTES32],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract MerkleDistributor deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`
    );
    // set our minter address to the new distributor for all tests. 
    accounts = await ethers.getSigners();
    token = new ethers.Contract(TestERC20.address, TestERC20.abi, accounts[0]);
    await token.setMinterAddress(deployResult.address)
  }
};
module.exports.tags = ["MerkleDistributor"];
module.exports.dependencies = ["TestMintableToken"];