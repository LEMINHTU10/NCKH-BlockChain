import { ethers } from "ethers";

/**
 * MODULE MẬT MÃ TIẾT LỘ CÓ CHỌN LỌC (SELECTIVE DISCLOSURE & SALTED CLAIMS)
 * Chuẩn hóa theo kiến trúc Merkle Claims & Data Minimization
 */

/**
 * Sinh chuỗi Salt ngẫu nhiên 256-bit (32 bytes hex)
 */
export function generateSalt() {
  const randomBytes = ethers.randomBytes(32);
  return ethers.hexlify(randomBytes);
}

/**
 * Tính mã cam kết băm (Claim Hash) cho một thuộc tính
 * format: keccak256("fieldName:fieldValue:salt")
 */
export function computeClaimHash(key, value, salt) {
  const str = `${key}:${String(value ?? "").trim()}:${salt}`;
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

/**
 * Tính toán Root Hash (vcHash) từ danh sách các Claim Hashes đã sắp xếp
 * Sắp xếp bảng chữ cái theo key để đảm bảo tính xác định (Deterministic root)
 */
export function computeCredentialRootHash(claimsWithSalts) {
  const sortedKeys = Object.keys(claimsWithSalts).sort();
  const claimHashes = sortedKeys.map((key) => {
    const item = claimsWithSalts[key];
    return computeClaimHash(key, item.value, item.salt);
  });

  // Nối chuỗi các claim hashes và băm tổng hợp
  const combined = claimHashes.join("");
  return ethers.keccak256(ethers.toUtf8Bytes(combined));
}

/**
 * Tạo một Verifiable Credential có hỗ trợ Salted Claims
 */
export function createSaltedCredential({
  issuerDid,
  holderDid,
  credType,
  claims, // { studentName, studentId, major, gpa, classification, graduationYear, dateOfBirth, nationalId }
  expiresAt = 0,
}) {
  const issuanceDate = new Date().toISOString();
  const claimsWithSalts = {};

  for (const [k, v] of Object.entries(claims)) {
    claimsWithSalts[k] = {
      value: String(v ?? ""),
      salt: generateSalt(),
    };
  }

  const rootHash = computeCredentialRootHash(claimsWithSalts);

  const vc = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    type: ["VerifiableCredential", credType, "SaltedClaimsCredential"],
    issuer: issuerDid,
    issuanceDate,
    expirationDate: expiresAt ? new Date(Number(expiresAt) * 1000).toISOString() : null,
    credentialSubject: {
      id: holderDid,
      saltedClaims: claimsWithSalts,
    },
    credentialHash: rootHash,
  };

  return {
    vc,
    rootHash,
  };
}

/**
 * Sinh Selective Disclosure Presentation (VP)
 * @param {Object} vc - Verifiable Credential gốc (có chứa saltedClaims)
 * @param {Array<string>} disclosedKeys - Danh sách các trường được phép tiết lộ
 * @param {Object} options - { expiresInMinutes, nonce, audience }
 */
export function createSelectivePresentation(vc, disclosedKeys, options = {}) {
  const saltedClaims = vc.credentialSubject?.saltedClaims || {};
  const allKeys = Object.keys(saltedClaims).sort();

  const presentedClaims = {};
  const blindedHashes = {};

  for (const key of allKeys) {
    const claim = saltedClaims[key];
    if (disclosedKeys.includes(key)) {
      // Tiết lộ giá trị thật và muối
      presentedClaims[key] = {
        value: claim.value,
        salt: claim.salt,
        disclosed: true,
      };
    } else {
      // Che giấu: chỉ cung cấp mã băm cam kết (Blind Hash Commitment)
      const claimHash = computeClaimHash(key, claim.value, claim.salt);
      blindedHashes[key] = claimHash;
    }
  }

  const now = Date.now();
  const ttlMinutes = options.expiresInMinutes || 15; // Mặc định 15 phút
  const expirationTimestamp = now + ttlMinutes * 60 * 1000;
  const nonce = options.nonce || ethers.hexlify(ethers.randomBytes(16));
  const audience = options.audience || "PUBLIC_VERIFIER";

  const presentationPayload = {
    vcHash: vc.credentialHash,
    holder: vc.credentialSubject?.id,
    timestamp: now,
    expiresAt: expirationTimestamp,
    nonce,
    audience,
    disclosedKeys: disclosedKeys.sort(),
  };

  return {
    presentationPayload,
    presentedClaims,
    blindedHashes,
    allKeys,
    expirationTimestamp,
    nonce,
    audience,
  };
}

/**
 * Xác minh tính toán học của Selective Disclosure và tái tạo vcHash
 */
export function verifySelectiveDisclosure(presentation) {
  const { presentedClaims = {}, blindedHashes = {}, allKeys = [], vcHash } = presentation;

  const sortedKeys = [...allKeys].sort();
  const reconstructedHashes = [];

  for (const key of sortedKeys) {
    if (presentedClaims[key] && presentedClaims[key].disclosed) {
      // Tính hash từ giá trị và salt được tiết lộ
      const item = presentedClaims[key];
      const h = computeClaimHash(key, item.value, item.salt);
      reconstructedHashes.push(h);
    } else if (blindedHashes[key]) {
      // Sử dụng blind hash đã được cung cấp
      reconstructedHashes.push(blindedHashes[key]);
    } else {
      throw new Error(`Thiếu cam kết băm cho thuộc tính: ${key}`);
    }
  }

  const combined = reconstructedHashes.join("");
  const calculatedRootHash = ethers.keccak256(ethers.toUtf8Bytes(combined));

  const isHashValid = calculatedRootHash.toLowerCase() === vcHash.toLowerCase();

  return {
    isValid: isHashValid,
    calculatedRootHash,
    expectedRootHash: vcHash,
  };
}
