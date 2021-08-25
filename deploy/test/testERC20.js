module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const initialSupply = 1000000000000;
  const deployResult = await deploy("TestERC20", {
    from: admin,
    contract: "TestERC20",
    args: ["TestToken", "TST", initialSupply],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract TestToken deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`
    );
  }
};
module.exports.tags = ["TestERC20"];
