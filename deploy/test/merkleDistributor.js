module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin, feeRecipient } = namedAccounts;
  const testERC20 = await deployments.get("TestERC20");
  const ZERO_BYTES32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  const deployResult = await deploy("MerkleDistributor", {
    from: admin,
    contract: "MerkleDistributor",
    args: [testERC20.address, feeRecipient, ZERO_BYTES32],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract MerkleDistributor deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`
    );
  }
};
module.exports.tags = ["MerkleDistributor"];
module.exports.dependencies = ["TestERC20"];
