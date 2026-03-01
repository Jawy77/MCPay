// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ShieldVault
 * @notice CRE-verified attestation storage for autonomous agent payments via x402.
 * @dev Stores proof that an agent paid for an MCP service AND received valid delivery.
 *      Written to by Chainlink CRE workflow after DON consensus validates the exchange.
 *
 * CHAINLINK INTEGRATION:
 * - CRE Workflow calls attest() after verifying payment + service delivery
 * - DON consensus ensures attestation is trustworthy (not single-server trust)
 * - Agents can read attestations to verify MCP server reputation before paying
 */
contract ShieldVault {

    // =========================================================================
    // STRUCTS
    // =========================================================================

    /// @notice Proof of a verified agent-to-MCP exchange
    struct Attestation {
        bytes32 paymentHash;       // keccak256 of x402 payment receipt
        bytes32 serviceHash;       // keccak256 of MCP response
        uint8   qualityScore;      // 0-100 quality score from CRE validation
        address mcpServer;         // MCP server that provided the service
        address agent;             // Agent wallet that paid
        uint256 amountPaid;        // USDC amount in wei (6 decimals)
        uint256 timestamp;         // block.timestamp of attestation
        bool    disputed;          // Whether agent flagged this as bad
    }

    /// @notice Spending policy set by agent owner
    struct SpendingPolicy {
        uint256 maxPerCall;        // Max USDC per single MCP call (wei, 6 decimals)
        uint256 maxDaily;          // Max USDC per 24h rolling window (wei, 6 decimals)
        uint256 dailySpent;        // Amount spent in current window
        uint256 windowStart;       // Start of current 24h window
        bool    isActive;          // Whether policy is enforced
    }

    // =========================================================================
    // STATE
    // =========================================================================

    /// @notice All attestations indexed by ID
    mapping(uint256 => Attestation) public attestations;
    uint256 public attestationCount;

    /// @notice Agent attestation history: agent => attestation IDs
    mapping(address => uint256[]) public agentAttestations;

    /// @notice MCP server attestation history: mcpServer => attestation IDs
    mapping(address => uint256[]) public mcpAttestations;

    /// @notice Spending policies per agent
    mapping(address => SpendingPolicy) public spendingPolicies;

    /// @notice Authorized CRE workflow address (set at deploy, updated by owner)
    address public creWorkflow;

    /// @notice Contract owner (deployer)
    address public owner;

    // =========================================================================
    // EVENTS
    // =========================================================================

    /// @notice Emitted when CRE workflow writes a new attestation
    event AttestationCreated(
        uint256 indexed attestationId,
        address indexed agent,
        address indexed mcpServer,
        uint8   qualityScore,
        uint256 amountPaid
    );

    /// @notice Emitted when agent disputes an attestation
    event DisputeRaised(
        uint256 indexed attestationId,
        address indexed agent,
        address indexed mcpServer,
        string  reason
    );

    /// @notice Emitted when agent updates spending policy
    event PolicyUpdated(
        address indexed agent,
        uint256 maxPerCall,
        uint256 maxDaily
    );

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ShieldVault: not owner");
        _;
    }

    modifier onlyCRE() {
        require(msg.sender == creWorkflow, "ShieldVault: not CRE workflow");
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /// @param _creWorkflow Address of the authorized CRE workflow forwarder
    constructor(address _creWorkflow) {
        owner = msg.sender;
        creWorkflow = _creWorkflow;
    }

    // =========================================================================
    // CRE WORKFLOW FUNCTIONS (called by Chainlink DON)
    // =========================================================================

    /// @notice Store a verified attestation. Called by CRE workflow after DON consensus.
    /// @param _paymentHash  keccak256 of x402 payment receipt
    /// @param _serviceHash  keccak256 of MCP server response
    /// @param _qualityScore Quality score 0-100 from CRE validation logic
    /// @param _mcpServer    Address of the MCP server
    /// @param _agent        Address of the agent wallet
    /// @param _amountPaid   USDC amount paid (6 decimal wei)
    function attest(
        bytes32 _paymentHash,
        bytes32 _serviceHash,
        uint8   _qualityScore,
        address _mcpServer,
        address _agent,
        uint256 _amountPaid
    ) external onlyCRE {
        require(_qualityScore <= 100, "ShieldVault: score > 100");
        require(_agent != address(0), "ShieldVault: zero agent");
        require(_mcpServer != address(0), "ShieldVault: zero mcp");

        uint256 id = attestationCount++;

        attestations[id] = Attestation({
            paymentHash: _paymentHash,
            serviceHash: _serviceHash,
            qualityScore: _qualityScore,
            mcpServer: _mcpServer,
            agent: _agent,
            amountPaid: _amountPaid,
            timestamp: block.timestamp,
            disputed: false
        });

        agentAttestations[_agent].push(id);
        mcpAttestations[_mcpServer].push(id);

        // Update daily spending tracker
        SpendingPolicy storage policy = spendingPolicies[_agent];
        if (policy.isActive) {
            _updateDailySpending(policy, _amountPaid);
        }

        emit AttestationCreated(id, _agent, _mcpServer, _qualityScore, _amountPaid);
    }

    // =========================================================================
    // AGENT FUNCTIONS
    // =========================================================================

    /// @notice Agent disputes a bad attestation (service not delivered properly)
    /// @param _attestationId ID of the attestation to dispute
    /// @param _reason Human-readable reason for the dispute
    function dispute(uint256 _attestationId, string calldata _reason) external {
        Attestation storage a = attestations[_attestationId];
        require(a.agent == msg.sender, "ShieldVault: not your attestation");
        require(!a.disputed, "ShieldVault: already disputed");

        a.disputed = true;

        emit DisputeRaised(_attestationId, a.agent, a.mcpServer, _reason);
    }

    /// @notice Agent sets spending policy for CRE pre-flight checks
    /// @param _maxPerCall Maximum USDC per single call (6 decimal wei)
    /// @param _maxDaily   Maximum USDC per 24h window (6 decimal wei)
    function setPolicy(uint256 _maxPerCall, uint256 _maxDaily) external {
        require(_maxPerCall > 0, "ShieldVault: zero maxPerCall");
        require(_maxDaily >= _maxPerCall, "ShieldVault: daily < perCall");

        spendingPolicies[msg.sender] = SpendingPolicy({
            maxPerCall: _maxPerCall,
            maxDaily: _maxDaily,
            dailySpent: 0,
            windowStart: block.timestamp,
            isActive: true
        });

        emit PolicyUpdated(msg.sender, _maxPerCall, _maxDaily);
    }

    // =========================================================================
    // READ FUNCTIONS (used by CRE pre-flight + SDK)
    // =========================================================================

    /// @notice Check if a payment is within agent's spending policy
    /// @param _agent  Agent wallet address
    /// @param _amount Proposed payment amount (6 decimal USDC wei)
    /// @return allowed Whether the payment is within policy limits
    /// @return reason  Human-readable reason if not allowed
    function checkPolicy(address _agent, uint256 _amount) 
        external view returns (bool allowed, string memory reason) 
    {
        SpendingPolicy storage policy = spendingPolicies[_agent];
        
        if (!policy.isActive) {
            return (true, "no policy set");
        }

        if (_amount > policy.maxPerCall) {
            return (false, "exceeds max per call");
        }

        uint256 effectiveSpent = policy.dailySpent;
        if (block.timestamp > policy.windowStart + 24 hours) {
            effectiveSpent = 0; // Window expired, reset
        }

        if (effectiveSpent + _amount > policy.maxDaily) {
            return (false, "exceeds daily limit");
        }

        return (true, "within policy");
    }

    /// @notice Get latest attestation for an agent
    function getLatestAttestation(address _agent) 
        external view returns (Attestation memory) 
    {
        uint256[] storage ids = agentAttestations[_agent];
        require(ids.length > 0, "ShieldVault: no attestations");
        return attestations[ids[ids.length - 1]];
    }

    /// @notice Get MCP server reputation (average quality score)
    function getMcpReputation(address _mcpServer) 
        external view returns (uint256 avgScore, uint256 totalCalls, uint256 disputes) 
    {
        uint256[] storage ids = mcpAttestations[_mcpServer];
        totalCalls = ids.length;
        if (totalCalls == 0) return (0, 0, 0);

        uint256 totalScore = 0;
        for (uint256 i = 0; i < totalCalls; i++) {
            Attestation storage a = attestations[ids[i]];
            totalScore += a.qualityScore;
            if (a.disputed) disputes++;
        }
        avgScore = totalScore / totalCalls;
    }

    /// @notice Get number of attestations for an agent
    function getAgentAttestationCount(address _agent) external view returns (uint256) {
        return agentAttestations[_agent].length;
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    /// @notice Update CRE workflow address
    function setCreWorkflow(address _creWorkflow) external onlyOwner {
        creWorkflow = _creWorkflow;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _updateDailySpending(SpendingPolicy storage policy, uint256 amount) internal {
        if (block.timestamp > policy.windowStart + 24 hours) {
            policy.dailySpent = amount;
            policy.windowStart = block.timestamp;
        } else {
            policy.dailySpent += amount;
        }
    }
}
