module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const namedAccounts = await getNamedAccounts();
  const { admin } = namedAccounts;
  const initialSupply = 1000000000000;
  const deployResult = await deploy("TestMintableToken", {
    from: admin,
    contract: "TestMintableToken",
    args: ["TestToken", "TST", initialSupply],
  });
  if (deployResult.newlyDeployed) {
    log(
      `contract TestToken deployed at ${deployResult.address} using ${deployResult.receipt.gasUsed} gas`
    );
  }
};
module.exports.tags = ["TestMintableToken"];
