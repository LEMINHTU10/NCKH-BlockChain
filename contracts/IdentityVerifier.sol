
pragma solidity ^0.8.20;

import "./DIDRegistry.sol";
import "./CredentialRegistry.sol";


contract IdentityVerifier {

    DIDRegistry       public didRegistry;
    CredentialRegistry public credentialRegistry;

    
    struct AuditRecord {
        address verifier;       
        address holder;         
        bytes32 credentialHash; 
        bool    result;         
        string  reason;         
        uint256 timestamp;      
    }

    AuditRecord[] private auditLog;

    
    event IdentityVerified(
        address indexed verifier,
        address indexed holder,
        bytes32 indexed credentialHash,
        bool    result,
        string  reason
    );

    
    constructor(address _didRegistry, address _credentialRegistry) {
        require(_didRegistry != address(0),        "DIDRegistry address khong hop le");
        require(_credentialRegistry != address(0), "CredentialRegistry address khong hop le");

        didRegistry        = DIDRegistry(_didRegistry);
        credentialRegistry = CredentialRegistry(_credentialRegistry);
    }

    

    
    function verifyIdentity(address _holder, bytes32 _credentialHash)
        external
        returns (bool valid, string memory reason)
    {
        
        DIDRegistry.DIDDocument memory didDoc = didRegistry.resolveDID(_holder);

        if (!didDoc.isActive || didDoc.owner == address(0)) {
            reason = "DID khong ton tai hoac da bi vo hieu hoa";
            _recordAudit(_holder, _credentialHash, false, reason);
            return (false, reason);
        }

        
        (bool vcValid, string memory vcReason) = credentialRegistry.verifyCredential(_credentialHash);

        if (!vcValid) {
            _recordAudit(_holder, _credentialHash, false, vcReason);
            return (false, vcReason);
        }

        
        CredentialRegistry.Credential memory cred = credentialRegistry.getCredential(_credentialHash);
        if (cred.holder != _holder) {
            reason = "VC nay khong thuoc ve Holder nay";
            _recordAudit(_holder, _credentialHash, false, reason);
            return (false, reason);
        }

        
        reason = "Danh tinh hop le";
        _recordAudit(_holder, _credentialHash, true, reason);
        return (true, reason);
    }

    
    function checkRevocation(bytes32 _credentialHash) external view returns (bool revoked) {
        return credentialRegistry.isRevoked(_credentialHash);
    }

    

    
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

    
    function getAuditLogCount() external view returns (uint256) {
        return auditLog.length;
    }

    
    function getAuditRecord(uint256 _index) external view returns (AuditRecord memory) {
        require(_index < auditLog.length, "Index vuot qua gioi han");
        return auditLog[_index];
    }
}
