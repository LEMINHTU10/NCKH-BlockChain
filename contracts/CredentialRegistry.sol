
pragma solidity ^0.8.20;


contract CredentialRegistry {

    
    struct Credential {
        bytes32 credentialHash;   
        address issuer;           
        address holder;           
        string  credentialType;   
        uint256 issuedAt;         
        uint256 expiresAt;        
        bool    isRevoked;        
    }

    
    mapping(address => bool) public authorizedIssuers;

    
    mapping(bytes32 => Credential) private credentials;

    
    mapping(address => bytes32[]) private holderCredentials;

    
    address public owner;

    
    event IssuerAuthorized(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event CredentialIssued(
        bytes32 indexed credentialHash,
        address indexed issuer,
        address indexed holder,
        string credentialType
    );
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer);

    
    modifier onlyOwner() {
        require(msg.sender == owner, "Chi owner moi thuc hien duoc");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Issuer chua duoc cap phep");
        _;
    }

    
    constructor() {
        owner = msg.sender;
        
        authorizedIssuers[msg.sender] = true;
    }

    

    
    function authorizeIssuer(address _issuer) external onlyOwner {
        require(_issuer != address(0), "Dia chi khong hop le");
        authorizedIssuers[_issuer] = true;
        emit IssuerAuthorized(_issuer);
    }

    
    function revokeIssuerAuthorization(address _issuer) external onlyOwner {
        authorizedIssuers[_issuer] = false;
        emit IssuerRevoked(_issuer);
    }

    

    
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

    
    function revokeCredential(bytes32 _hash) external {
        Credential storage cred = credentials[_hash];
        require(cred.issuer != address(0), "VC khong ton tai");
        require(cred.issuer == msg.sender, "Chi Issuer goc moi duoc thu hoi");
        require(!cred.isRevoked, "VC da bi thu hoi truoc do");

        cred.isRevoked = true;
        emit CredentialRevoked(_hash, msg.sender);
    }

    

    
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

    
    function getCredential(bytes32 _hash)
        external
        view
        returns (Credential memory)
    {
        require(credentials[_hash].issuer != address(0), "VC khong ton tai");
        return credentials[_hash];
    }

    
    function getHolderCredentials(address _holder)
        external
        view
        returns (bytes32[] memory)
    {
        return holderCredentials[_holder];
    }

    
    function isRevoked(bytes32 _hash) external view returns (bool) {
        return credentials[_hash].isRevoked;
    }
}
