// Hardhat deploy script for LiteMiner V3 on LitVM LiteForge (chain 4441).
// Run: `npx hardhat run scripts/deploy-v3.ts --network liteforge`
import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1) RewardToken
  const RewardToken = await ethers.getContractFactory("RewardToken");
  const token = await RewardToken.deploy();
  await token.waitForDeployment();
  console.log("RewardToken:", await token.getAddress());

  // 2) TreasuryVault
  const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
  const treasury = await TreasuryVault.deploy();
  await treasury.waitForDeployment();
  console.log("TreasuryVault:", await treasury.getAddress());

  // 3) RiskEngine
  const RiskEngine = await ethers.getContractFactory("RiskEngine");
  const risk = await RiskEngine.deploy();
  await risk.waitForDeployment();
  console.log("RiskEngine:", await risk.getAddress());

  // 4) EmissionOracle
  const EmissionOracle = await ethers.getContractFactory("EmissionOracle");
  const oracle = await EmissionOracle.deploy();
  await oracle.waitForDeployment();
  console.log("EmissionOracle:", await oracle.getAddress());

  // 5) V3MiningCore behind UUPS proxy
  const Core = await ethers.getContractFactory("V3MiningCore");
  const core = await upgrades.deployProxy(
    Core,
    [
      await token.getAddress(),
      await treasury.getAddress(),
      await risk.getAddress(),
      await oracle.getAddress(),
    ],
    { kind: "uups" },
  );
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("V3MiningCore (proxy):", coreAddr);

  // 6) Wire permissions
  console.log("Wiring permissions…");
  await (await token.setMinter(coreAddr)).wait();
  await (await treasury.setCore(coreAddr)).wait();
  await (await risk.setCore(coreAddr)).wait();
  await (await oracle.setCore(coreAddr)).wait();

  console.log("\nAdd these to .env / src/lib/contract.ts:");
  console.log("VITE_CORE_ADDRESS=" + coreAddr);
  console.log("VITE_TOKEN_ADDRESS=" + (await token.getAddress()));
  console.log("VITE_TREASURY_ADDRESS=" + (await treasury.getAddress()));
  console.log("VITE_RISK_ADDRESS=" + (await risk.getAddress()));
  console.log("VITE_ORACLE_ADDRESS=" + (await oracle.getAddress()));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
