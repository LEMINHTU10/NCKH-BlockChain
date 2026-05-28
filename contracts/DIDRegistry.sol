
pragma solidity ^0.8.20;


contract DIDRegistry {

    
    struct DIDDocument {
        string did;             
        address owner;          
        string publicKey;       
        string serviceEndpoint; 
        uint256 createdAt;      
        uint256 updatedAt;      
        bool isActive;          
    }

    
    mapping(address => DIDDocument) private didDocuments;
    mapping(string => address) private didToAddress;

    
    event DIDRegistered(address indexed owner, string did);
    event DIDUpdated(address indexed owner, string did);
    event DIDDeactivated(address indexed owner, string did);

    
    modifier onlyOwner() {
        require(didDocuments[msg.sender].owner == msg.sender, "Khong phai chu so huu DID");
        _;
    }

    
    function registerDID(string memory _publicKey, string memory _serviceEndpoint) public {
        require(!didDocuments[msg.sender].isActive, "DID da ton tai va dang hoat dong");

        
        string memory newDid = string(abi.encodePacked("did:ethr:", toAsciiString(msg.sender)));

        DIDDocument memory newDoc = DIDDocument({
            did: newDid,
            owner: msg.sender,
            publicKey: _publicKey,
            serviceEndpoint: _serviceEndpoint,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            isActive: true
        });

        didDocuments[msg.sender] = newDoc;
        didToAddress[newDid] = msg.sender;

        emit DIDRegistered(msg.sender, newDid);
    }

    
    function updateDIDDocument(string memory _publicKey, string memory _serviceEndpoint) public onlyOwner {
        require(didDocuments[msg.sender].isActive, "DID da bi vo hieu hoa");

        didDocuments[msg.sender].publicKey = _publicKey;
        didDocuments[msg.sender].serviceEndpoint = _serviceEndpoint;
        didDocuments[msg.sender].updatedAt = block.timestamp;

        emit DIDUpdated(msg.sender, didDocuments[msg.sender].did);
    }

    
    function deactivateDID() public onlyOwner {
        require(didDocuments[msg.sender].isActive, "DID da bi vo hieu hoa tu truoc");
        
        didDocuments[msg.sender].isActive = false;
        didDocuments[msg.sender].updatedAt = block.timestamp;

        emit DIDDeactivated(msg.sender, didDocuments[msg.sender].did);
    }

    
    function resolveDID(address _owner) public view returns (DIDDocument memory) {
        return didDocuments[_owner];
    }

    
    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(abi.encodePacked("0x", s));
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}