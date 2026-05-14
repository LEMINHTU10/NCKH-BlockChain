// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CredentialRegistry
 * @dev Quản lý việc phát hành, thu hồi và xác thực Verifiable Credential (VC).
 * Chỉ lưu hash của VC lên on-chain, nội dung VC lưu off-chain.
 */
contract CredentialRegistry {

    // Cấu trúc lưu thông tin một Verifiable Credential
    struct Credential {
        bytes32 credentialHash;   // Keccak256 hash của VC JSON
        address issuer;           // Địa chỉ Issuer (trường/khoa)
        address holder;           // Địa chỉ Holder (sinh viên)
        string  credentialType;   // VD: "BachelorDegree", "Certificate"
        uint256 issuedAt;         // Timestamp phát hành
        uint256 expiresAt;        // 0 = không hết hạn
        bool    isRevoked;        // Đã bị thu hồi chưa?
    }

    // Danh sách các Issuer được phép phát hành VC
    mapping(address => bool) public authorizedIssuers;

    // Hash => Credential
    mapping(bytes32 => Credential) private credentials;

    // Holder => danh sách hash các VC của họ
    mapping(address => bytes32[]) private holderCredentials;

    // Owner của contract (để quản lý Issuer)
    address public owner;

    // ====================== Events ======================
    event IssuerAuthorized(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event CredentialIssued(
        bytes32 indexed credentialHash,
        address indexed issuer,
        address indexed holder,
        string credentialType
    );
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer);

    // ====================== Modifiers ======================
    modifier onlyOwner() {
        require(msg.sender == owner, "Chi owner moi thuc hien duoc");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Issuer chua duoc cap phep");
        _;
    }

    // ====================== Constructor ======================
    constructor() {
        owner = msg.sender;
        // Owner cũng là Issuer mặc định
        authorizedIssuers[msg.sender] = true;
    }

    // ====================== Issuer Management ======================

    /**
     * @dev Owner cấp quyền Issuer cho một địa chỉ
     */
    function authorizeIssuer(address _issuer) external onlyOwner {
        require(_issuer != address(0), "Dia chi khong hop le");
        authorizedIssuers[_issuer] = true;
        emit IssuerAuthorized(_issuer);
    }

    /**
     * @dev Owner thu hồi quyền Issuer
     */
    function revokeIssuerAuthorization(address _issuer) external onlyOwner {
        authorizedIssuers[_issuer] = false;
        emit IssuerRevoked(_issuer);
    }

    // ====================== Core Functions ======================

    /**
     * @dev Issuer phát hành một VC mới
     * @param _holder   Địa chỉ ví của sinh viên (Holder)
     * @param _hash     Keccak256 hash của nội dung VC JSON
     * @param _type     Loại VC (VD: "BachelorDegree")
     * @param _expiresAt Thời điểm hết hạn (Unix timestamp), 0 = không hết hạn
     */
    function issueCredential(
        address _holder,
        bytes32 _hash,
        string calldata _type,
        uint256 _expiresAt
    ) external {
        require(_holder != address(0), "Dia chi holder khong hop le");
        require(_hash != bytes32(0), "Hash khong hop le");
        require(credentials[_hash].issuer == address(0), "VC nay da ton tai");
        require(
            _expiresAt == 0 || _expiresAt > block.timestamp,
            "Thoi gian het han khong hop le"
        );

        credentials[_hash] = Credential({
            credentialHash: _hash,
            issuer:         msg.sender,
            holder:         _holder,
            credentialType: _type,
            issuedAt:       block.timestamp,
            expiresAt:      _expiresAt,
            isRevoked:      false
        });

        holderCredentials[_holder].push(_hash);

        emit CredentialIssued(_hash, msg.sender, _holder, _type);
    }

    /**
     * @dev Issuer thu hồi VC (chỉ Issuer gốc mới được thu hồi)
     * @param _hash Hash của VC cần thu hồi
     */
    function revokeCredential(bytes32 _hash) external {
        Credential storage cred = credentials[_hash];
        require(cred.issuer != address(0), "VC khong ton tai");
        require(cred.issuer == msg.sender, "Chi Issuer goc moi duoc thu hoi");
        require(!cred.isRevoked, "VC da bi thu hoi truoc do");

        cred.isRevoked = true;
        emit CredentialRevoked(_hash, msg.sender);
    }

    // ====================== View / Query Functions ======================

    /**
     * @dev Xác thực một VC: kiểm tra tồn tại, chưa bị thu hồi, chưa hết hạn
     * @return valid true nếu VC hợp lệ
     * @return reason Lý do nếu không hợp lệ
     */
    function verifyCredential(bytes32 _hash)
        external
        view
        returns (bool valid, string memory reason)
    {
        Credential storage cred = credentials[_hash];

        if (cred.issuer == address(0)) {
            return (false, "VC khong ton tai");
        }
        if (cred.isRevoked) {
            return (false, "VC da bi thu hoi");
        }
        if (cred.expiresAt != 0 && block.timestamp > cred.expiresAt) {
            return (false, "VC da het han");
        }

        return (true, "VC hop le");
    }

    /**
     * @dev Lấy thông tin đầy đủ của một VC theo hash
     */
    function getCredential(bytes32 _hash)
        external
        view
        returns (Credential memory)
    {
        require(credentials[_hash].issuer != address(0), "VC khong ton tai");
        return credentials[_hash];
    }

    /**
     * @dev Lấy danh sách tất cả hash VC của một Holder
     */
    function getHolderCredentials(address _holder)
        external
        view
        returns (bytes32[] memory)
    {
        return holderCredentials[_holder];
    }

    /**
     * @dev Kiểm tra nhanh trạng thái thu hồi
     */
    function isRevoked(bytes32 _hash) external view returns (bool) {
        return credentials[_hash].isRevoked;
    }
}
