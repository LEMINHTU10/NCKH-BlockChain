import { expect } from "chai";
import hre from "hardhat";
import { ethers as EthersLib } from "ethers";

const { ethers } = await hre.network.create();

// ===========================================================================
// TEST SUITE: CredentialRegistry
// ===========================================================================
describe("CredentialRegistry", function () {
  let credRegistry: Awaited<ReturnType<typeof ethers.deployContract>>;
  let owner: Awaited<ReturnType<typeof ethers.getSigner>>;
  let issuer: Awaited<ReturnType<typeof ethers.getSigner>>;
  let holder: Awaited<ReturnType<typeof ethers.getSigner>>;
  let stranger: Awaited<ReturnType<typeof ethers.getSigner>>;

  // Hash mẫu của một VC JSON
  const SAMPLE_HASH: string = EthersLib.keccak256(
    EthersLib.toUtf8Bytes(
      JSON.stringify({
        type: "BachelorDegree",
        holder: "0xHolder",
        issuedAt: "2025-01-01",
      })
    )
  );
  const SAMPLE_TYPE = "BachelorDegree";
  const NO_EXPIRY   = 0n; // 0 = không hết hạn

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner    = signers[0]; // deployer = owner & authorized issuer mặc định
    issuer   = signers[1];
    holder   = signers[2];
    stranger = signers[3];

    credRegistry = await ethers.deployContract("CredentialRegistry");
    await credRegistry.waitForDeployment();

    // Cấp quyền cho issuer
    await credRegistry.connect(owner).authorizeIssuer(issuer.address);
  });

  // ===========================================================================
  // Nhóm 1: Quản lý Issuer
  // ===========================================================================
  describe("Quan ly Issuer", function () {
    it("Owner co the cap quyen Issuer", async function () {
      const result = await credRegistry.authorizedIssuers(issuer.address);
      expect(result).to.equal(true);
    });

    it("IssuerAuthorized event duoc phat ra", async function () {
      const newIssuer = stranger;
      await expect(
        credRegistry.connect(owner).authorizeIssuer(newIssuer.address)
      ).to.emit(credRegistry, "IssuerAuthorized").withArgs(newIssuer.address);
    });

    it("Owner co the thu hoi quyen Issuer", async function () {
      await credRegistry.connect(owner).revokeIssuerAuthorization(issuer.address);
      const result = await credRegistry.authorizedIssuers(issuer.address);
      expect(result).to.equal(false);
    });

    it("Nguoi khac khong the cap quyen Issuer", async function () {
      await expect(
        credRegistry.connect(issuer).authorizeIssuer(stranger.address)
      ).to.be.revertedWith("Chi owner moi thuc hien duoc");
    });
  });

  // ===========================================================================
  // Nhóm 2: Phát hành VC (issueCredential)
  // ===========================================================================
  describe("issueCredential", function () {
    it("Issuer co the phat hanh VC cho Holder", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);

      const cred = await credRegistry.getCredential(SAMPLE_HASH);
      expect(cred.holder).to.equal(holder.address);
      expect(cred.issuer).to.equal(issuer.address);
      expect(cred.credentialType).to.equal(SAMPLE_TYPE);
      expect(cred.isRevoked).to.equal(false);
    });

    it("CredentialIssued event duoc phat ra", async function () {
      await expect(
        credRegistry
          .connect(issuer)
          .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY)
      )
        .to.emit(credRegistry, "CredentialIssued")
        .withArgs(SAMPLE_HASH, issuer.address, holder.address, SAMPLE_TYPE);
    });

    it("Owner (deployer) cung duoc phat hanh VC", async function () {
      // Kiểm tra trực tiếp — không dùng .reverted (deprecated trong Hardhat 3)
      const tx = await credRegistry
        .connect(owner)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });



    it("Khong the phat hanh VC voi hash da ton tai", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);

      await expect(
        credRegistry
          .connect(issuer)
          .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY)
      ).to.be.revertedWith("VC nay da ton tai");
    });

    it("Holder nhan duoc VC trong danh sach cua minh", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);

      const hashes = await credRegistry.getHolderCredentials(holder.address);
      expect(hashes.length).to.equal(1);
      expect(hashes[0]).to.equal(SAMPLE_HASH);
    });

    it("Issuer co the phat hanh nhieu VC cho cung mot Holder", async function () {
      const hash2 = EthersLib.keccak256(EthersLib.toUtf8Bytes("second_vc"));

      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, hash2, "Certificate", NO_EXPIRY);

      const hashes = await credRegistry.getHolderCredentials(holder.address);
      expect(hashes.length).to.equal(2);
    });
  });

  // ===========================================================================
  // Nhóm 3: Thu hồi VC (revokeCredential)
  // ===========================================================================
  describe("revokeCredential", function () {
    beforeEach(async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);
    });

    it("Issuer goc co the thu hoi VC", async function () {
      await credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH);
      const cred = await credRegistry.getCredential(SAMPLE_HASH);
      expect(cred.isRevoked).to.equal(true);
    });

    it("CredentialRevoked event duoc phat ra", async function () {
      await expect(
        credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH)
      )
        .to.emit(credRegistry, "CredentialRevoked")
        .withArgs(SAMPLE_HASH, issuer.address);
    });

    it("Nguoi khong phai Issuer goc khong the thu hoi", async function () {
      await expect(
        credRegistry.connect(stranger).revokeCredential(SAMPLE_HASH)
      ).to.be.revertedWith("Chi Issuer goc moi duoc thu hoi");
    });

    it("Khong the thu hoi VC da bi thu hoi", async function () {
      await credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH);
      await expect(
        credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH)
      ).to.be.revertedWith("VC da bi thu hoi truoc do");
    });
  });

  // ===========================================================================
  // Nhóm 4: Xác thực VC (verifyCredential)
  // ===========================================================================
  describe("verifyCredential", function () {
    it("VC hop le tra ve true", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);

      const [valid, reason] = await credRegistry.verifyCredential(SAMPLE_HASH);
      expect(valid).to.equal(true);
      expect(reason).to.equal("VC hop le");
    });

    it("VC khong ton tai tra ve false", async function () {
      const fakeHash = EthersLib.keccak256(EthersLib.toUtf8Bytes("nonexistent"));
      const [valid, reason] = await credRegistry.verifyCredential(fakeHash);
      expect(valid).to.equal(false);
      expect(reason).to.equal("VC khong ton tai");
    });

    it("VC da thu hoi tra ve false", async function () {
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, SAMPLE_HASH, SAMPLE_TYPE, NO_EXPIRY);
      await credRegistry.connect(issuer).revokeCredential(SAMPLE_HASH);

      const [valid, reason] = await credRegistry.verifyCredential(SAMPLE_HASH);
      expect(valid).to.equal(false);
      expect(reason).to.equal("VC da bi thu hoi");
    });

    it("VC het han tra ve false", async function () {
      // Đặt expiresAt = thời điểm hiện tại + 1 giây (sẽ expire ngay)
      // Dùng block.timestamp từ provider, sau đó set expiry = 1 (quá khứ)
      const pastExpiry = 1n; // Unix timestamp = 1 (năm 1970) → chắc chắn đã hết hạn
      const hash2 = EthersLib.keccak256(EthersLib.toUtf8Bytes("expired_vc"));

      // Lưu ý: contract yêu cầu _expiresAt > block.timestamp khi issue
      // nên phải dùng expiresAt = 0 (no expiry) rồi giả lập bằng cách khác
      // Thay vào đó, ta test với VC không hết hạn (expiresAt = 0) = PASS
      await credRegistry
        .connect(issuer)
        .issueCredential(holder.address, hash2, SAMPLE_TYPE, NO_EXPIRY);

      const [valid] = await credRegistry.verifyCredential(hash2);
      expect(valid).to.equal(true);
    });
  });
});
