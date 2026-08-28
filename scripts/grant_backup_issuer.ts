import { network } from "hardhat";

async function main() {
  const CREDENTIAL_REGISTRY = "0x64841DEb1F215A615780946584DC89007Ab38A5F";
  const BACKUP_ISSUER = "0x70CCE7f09E31eB297A6b56b527Dd18b9948DB9eD";

  const { ethers } = await network.create();
  const [owner] = await ethers.getSigners();
  console.log("Owner (Deployer):", owner.address);

  const abi = [
    "function authorizeIssuer(address _issuer) external",
    "function authorizedIssuers(address) external view returns (bool)"
  ];
  const credRegistry = new ethers.Contract(CREDENTIAL_REGISTRY, abi, owner);

  const before = await credRegistry.authorizedIssuers(BACKUP_ISSUER);
  console.log("Truoc khi cap quyen:", before);

  if (!before) {
    const tx = await credRegistry.authorizeIssuer(BACKUP_ISSUER);
    await tx.wait();
    console.log("Cap quyen thanh cong! Tx:", tx.hash);
  } else {
    console.log("Vi nay da co quyen roi!");
  }

  const after = await credRegistry.authorizedIssuers(BACKUP_ISSUER);
  console.log("Ket qua sau:", after ? "CO QUYEN ISSUER" : "CHUA CO QUYEN");
}

main().catch(console.error);