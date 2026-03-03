// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReceiverTemplate
 * @notice Base contract for receiving CRE workflow reports on-chain.
 * @dev Contracts that consume Chainlink CRE workflow reports should inherit this.
 *      The CRE DON calls `onReport()` with the consensus-signed report data.
 *      ShieldVault.sol implements its own receiver logic via the `attest()` function
 *      called by the authorized CRE workflow forwarder.
 */
abstract contract ReceiverTemplate {

    /// @notice Emitted when a CRE report is received and processed
    event ReportReceived(bytes32 indexed reportId, uint256 timestamp);

    /// @notice Process a CRE workflow report
    /// @param reportData ABI-encoded report data from the DON
    /// @dev Override this function to decode and process the report
    function onReport(bytes calldata reportData) external virtual;

    /// @notice Decode attestation parameters from a CRE report
    /// @param reportData Raw report bytes
    /// @return paymentHash keccak256 of x402 payment receipt
    /// @return serviceHash keccak256 of MCP response
    /// @return qualityScore 0-100 quality score
    /// @return mcpServer MCP server address
    /// @return agent Agent wallet address
    /// @return amountPaid USDC amount in 6-decimal wei
    function _decodeAttestation(bytes calldata reportData)
        internal
        pure
        returns (
            bytes32 paymentHash,
            bytes32 serviceHash,
            uint8 qualityScore,
            address mcpServer,
            address agent,
            uint256 amountPaid
        )
    {
        (paymentHash, serviceHash, qualityScore, mcpServer, agent, amountPaid) = abi.decode(
            reportData,
            (bytes32, bytes32, uint8, address, address, uint256)
        );
    }
}
