export async function fetchAllAccounts() {
  const response = await fetch('/api/accounts')
  if (!response.ok) {
    throw new Error(`Failed to load accounts (HTTP ${response.status})`)
  }
  return response.json()
}

export async function fetchAccountById(accountId) {
  const response = await fetch(`/api/account/${encodeURIComponent(accountId)}`)
  if (!response.ok) {
    throw new Error(`Failed to load account '${accountId}' (HTTP ${response.status})`)
  }
  return response.json()
}

export async function triggerAccountsSync() {
  const response = await fetch('/api/accounts/sync', {
    method: 'POST',
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.details || data.error || 'Sync failed')
  }
  return data
}