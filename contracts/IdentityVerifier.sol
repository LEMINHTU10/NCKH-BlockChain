// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./CredentialRegistry.sol";

/**
 * @title IdentityVerifier
 * @dev Hợp đồng tổng hợp: cung cấp điểm vào duy nhất để Verifier
 *      xác thực toàn bộ danh tính của một Holder.
 *
 * Quy trình xác thực (verifyIdentity):
 *  1. Kiểm tra DID của Holder còn active trên DIDRegistry
 *  2. Kiểm tra VC hợp lệ trên CredentialRegistry (tồn tại, chưa thu hồi, chưa hết hạn)
 *  3. Ghi audit log mỗi lần xác thực
 */
contract IdentityVerifier {

    DIDRegistry       public didRegistry;
    CredentialRegistry public credentialRegistry;

    // ====================== Audit Log ======================
    struct AuditRecord {
        address verifier;       // Ai xác thực
        address holder;         // Ai được xác thực
        bytes32 credentialHash; // VC nào được kiểm tra
        bool    result;         // Kết quả: hợp lệ hay không
        string  reason;         // Lý do (nếu không hợp lệ)
        uint256 timestamp;      // Thời điểm xác thực
    }

    AuditRecord[] private auditLog;

    // ====================== Events ======================
    event IdentityVerified(
        address indexed verifier,
        address indexed holder,
        bytes32 indexed credentialHash,
        bool    result,
        string  reason
    );

    // ====================== Constructor ======================
    constructor(address _didRegistry, address _credentialRegistry) {
        require(_didRegistry != address(0),        "DIDRegistry address khong hop le");
        require(_credentialRegistry != address(0), "CredentialRegistry address khong hop le");

        didRegistry        = DIDRegistry(_didRegistry);
        credentialRegistry = CredentialRegistry(_credentialRegistry);
    }

    // ====================== Core Functions ======================

    /**
     * @dev Xác thực danh tính đầy đủ của Holder
     * @param _holder          Địa chỉ ví của Holder (sinh viên)
     * @param _credentialHash  Hash của VC muốn xác thực
     * @return valid  true nếu danh tính hợp lệ
     * @return reason Lý do chi tiết
     */
    function verifyIdentity(address _holder, bytes32 _credentialHash)
        external
        returns (bool valid, string memory reason)
    {
        // Bước 1: Kiểm tra DID còn active
        DIDRegistry.DIDDocument memory didDoc = didRegistry.resolveDID(_holder);

        if (!didDoc.isActive || didDoc.owner == address(0)) {
            reason = "DID khong ton tai hoac da bi vo hieu hoa";
            _recordAudit(_holder, _credentialHash, false, reason);
            return (false, reason);
        }

        // Bước 2: Kiểm tra VC hợp lệ
        (bool vcValid, string memory vcReason) = credentialRegistry.verifyCredential(_credentialHash);

        if (!vcValid) {
            _recordAudit(_holder, _credentialHash, false, vcReason);
            return (false, vcReason);
        }

        // Bước 3: Xác nhận VC thuộc về đúng Holder
        CredentialRegistry.Credential memory cred = credentialRegistry.getCredential(_credentialHash);
        if (cred.holder != _holder) {
            reason = "VC nay khong thuoc ve Holder nay";
            _recordAudit(_holder, _credentialHash, false, reason);
            return (false, reason);
        }

        // Tất cả kiểm tra thành công
        reason = "Danh tinh hop le";
        _recordAudit(_holder, _credentialHash, true, reason);
        return (true, reason);
    }

    /**
     * @dev Kiểm tra nhanh trạng thái thu hồi của một VC (không ghi audit log)
     */
    function checkRevocation(bytes32 _credentialHash) external view returns (bool revoked) {
        return credentialRegistry.isRevoked(_credentialHash);
    }

    // ====================== Audit Log Functions ======================

    /**
     * @dev Ghi một bản ghi audit (internal)
     */
    function _recordAudit(
        address _holder,
        bytes32 _credentialHash,
        bool    _result,
        string memory _reason
    ) internal {
        auditLog.push(AuditRecord({
            verifier:       msg.sender,
            holder:         _holder,
            credentialHash: _credentialHash,
            result:         _result,
            reason:         _reason,
            timestamp:      block.timestamp
        }));

        emit IdentityVerified(msg.sender, _holder, _credentialHash, _result, _reason);
    }

    /**
     * @dev Lấy tổng số bản ghi audit
     */
    function getAuditLogCount() external view returns (uint256) {
        return auditLog.length;
    }

    /**
     * @dev Lấy một bản ghi audit theo index
     */
    function getAuditRecord(uint256 _index) external view returns (AuditRecord memory) {
        require(_index < auditLog.length, "Index vuot qua gioi han");
        return auditLog[_index];
    }
}
