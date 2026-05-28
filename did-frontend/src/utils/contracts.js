



export const CONTRACT_ADDRESSES = {
  DID_REGISTRY:          "0xF1B88f2283A503C9F498da1Eb7C788BA8E4e9432",
  CREDENTIAL_REGISTRY:   "0xEb6e008358a0e8B7221bD5244623179505512223",
  IDENTITY_VERIFIER:     "0x81178Bdbeb42aC58CB5a38E8105D2379202E10e1",
};

export const DID_REGISTRY_ABI = [
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "owner", "type": "address" }, { "indexed": false, "name": "did", "type": "string" }], "name": "DIDDeactivated", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "owner", "type": "address" }, { "indexed": false, "name": "did", "type": "string" }], "name": "DIDRegistered", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "owner", "type": "address" }, { "indexed": false, "name": "did", "type": "string" }], "name": "DIDUpdated", "type": "event" },
  { "inputs": [], "name": "deactivateDID", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "_publicKey", "type": "string" }, { "name": "_serviceEndpoint", "type": "string" }], "name": "registerDID", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "_owner", "type": "address" }], "name": "resolveDID", "outputs": [{ "components": [{ "name": "did", "type": "string" }, { "name": "owner", "type": "address" }, { "name": "publicKey", "type": "string" }, { "name": "serviceEndpoint", "type": "string" }, { "name": "createdAt", "type": "uint256" }, { "name": "updatedAt", "type": "uint256" }, { "name": "isActive", "type": "bool" }], "type": "tuple" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_publicKey", "type": "string" }, { "name": "_serviceEndpoint", "type": "string" }], "name": "updateDIDDocument", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
];

export const CREDENTIAL_REGISTRY_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "credentialHash", "type": "bytes32" }, { "indexed": true, "name": "issuer", "type": "address" }, { "indexed": true, "name": "holder", "type": "address" }, { "indexed": false, "name": "credentialType", "type": "string" }], "name": "CredentialIssued", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "credentialHash", "type": "bytes32" }, { "indexed": true, "name": "issuer", "type": "address" }], "name": "CredentialRevoked", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "issuer", "type": "address" }], "name": "IssuerAuthorized", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "issuer", "type": "address" }], "name": "IssuerRevoked", "type": "event" },
  { "inputs": [{ "name": "_issuer", "type": "address" }], "name": "authorizeIssuer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "", "type": "address" }], "name": "authorizedIssuers", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_hash", "type": "bytes32" }], "name": "getCredential", "outputs": [{ "components": [{ "name": "credentialHash", "type": "bytes32" }, { "name": "issuer", "type": "address" }, { "name": "holder", "type": "address" }, { "name": "credentialType", "type": "string" }, { "name": "issuedAt", "type": "uint256" }, { "name": "expiresAt", "type": "uint256" }, { "name": "isRevoked", "type": "bool" }], "type": "tuple" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_holder", "type": "address" }], "name": "getHolderCredentials", "outputs": [{ "name": "", "type": "bytes32[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_hash", "type": "bytes32" }], "name": "isRevoked", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_holder", "type": "address" }, { "name": "_hash", "type": "bytes32" }, { "name": "_type", "type": "string" }, { "name": "_expiresAt", "type": "uint256" }], "name": "issueCredential", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_hash", "type": "bytes32" }], "name": "revokeCredential", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "_issuer", "type": "address" }], "name": "revokeIssuerAuthorization", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "name": "_hash", "type": "bytes32" }], "name": "verifyCredential", "outputs": [{ "name": "valid", "type": "bool" }, { "name": "reason", "type": "string" }], "stateMutability": "view", "type": "function" },
];

export const IDENTITY_VERIFIER_ABI = [
  { "inputs": [{ "name": "_didRegistry", "type": "address" }, { "name": "_credentialRegistry", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" },
  { "anonymous": false, "inputs": [{ "indexed": true, "name": "verifier", "type": "address" }, { "indexed": true, "name": "holder", "type": "address" }, { "indexed": true, "name": "credentialHash", "type": "bytes32" }, { "indexed": false, "name": "result", "type": "bool" }, { "indexed": false, "name": "reason", "type": "string" }], "name": "IdentityVerified", "type": "event" },
  { "inputs": [{ "name": "_credentialHash", "type": "bytes32" }], "name": "checkRevocation", "outputs": [{ "name": "revoked", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "credentialRegistry", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "didRegistry", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getAuditLogCount", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_index", "type": "uint256" }], "name": "getAuditRecord", "outputs": [{ "components": [{ "name": "verifier", "type": "address" }, { "name": "holder", "type": "address" }, { "name": "credentialHash", "type": "bytes32" }, { "name": "result", "type": "bool" }, { "name": "reason", "type": "string" }, { "name": "timestamp", "type": "uint256" }], "type": "tuple" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "name": "_holder", "type": "address" }, { "name": "_credentialHash", "type": "bytes32" }], "name": "verifyIdentity", "outputs": [{ "name": "valid", "type": "bool" }, { "name": "reason", "type": "string" }], "stateMutability": "nonpayable", "type": "function" },
];
