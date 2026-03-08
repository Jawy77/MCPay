const API = process.env.NEXT_PUBLIC_API_URL || 'http://54.221.19.241:4000'

export async function buyTool(tool: string, args: any) {
  const res = await fetch(`${API}/api/buy`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({tool, args, agentAddress:'0x7B3f'}) })
  return res.json()
}

export async function getStore() {
  const res = await fetch(`${API}/api/store`)
  return res.json()
}
