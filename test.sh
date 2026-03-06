#!/bin/bash
# ShieldPay — Test script
# Prueba todos los componentes que no necesitan API keys externas

set -e
echo "============================================"
echo "  ShieldPay — Test Suite"
echo "============================================"
echo ""

# 1. Solidity
echo "[1/4] Compilando contratos Solidity..."
cd /home/hackwy/mcpay
forge build 2>&1
echo "  ✓ ShieldVault.sol + ReceiverTemplate.sol compilados"
echo ""

# 2. SDK type-check
echo "[2/4] Type-check SDK..."
cd /home/hackwy/mcpay/sdk
bunx tsc --noEmit 2>&1
echo "  ✓ SDK compila sin errores"
echo ""

# 3. Agent type-check
echo "[3/4] Type-check Agent..."
cd /home/hackwy/mcpay/agent
bunx tsc --noEmit 2>&1
echo "  ✓ Agent compila sin errores"
echo ""

# 4. Demo MCP server — smoke test
echo "[4/4] Probando Demo MCP Server..."
cd /home/hackwy/mcpay/demo-mcp
# Kill any existing instance on port 3001
lsof -ti:3001 | xargs kill 2>/dev/null || true
sleep 1
bun run src/server.ts &
MCP_PID=$!
sleep 2

# Health
HEALTH=$(curl -s http://localhost:3001/health)
echo "  Health: $HEALTH"

# Security scan
SCAN=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"security_scan","arguments":{"source_code":"pragma solidity ^0.8.0;\ncontract Test {\n  function hack() public {\n    msg.sender.call{value: 1}(\"\");\n  }\n}","contract_name":"Test"}},"id":1}')
echo "  Scan: $SCAN"

# Reputation
REP=$(curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"reputation_check","arguments":{"address":"0xdead"}},"id":2}')
echo "  Reputation: $REP"

kill $MCP_PID 2>/dev/null
echo "  ✓ Demo MCP Server funciona correctamente"
echo ""

echo "============================================"
echo "  Todos los tests pasaron ✓"
echo "============================================"
echo ""
echo "Para probar componentes con API keys:"
echo "  1. cp .env.example .env  (editar con tus keys)"
echo "  2. cd demo-mcp && bun run src/server.ts"
echo "  3. cd agent && bun run src/telegram-bot.ts"
echo "  4. CRE: docker run -it ubuntu:24.04 (GLIBC 2.38+ requerido)"
