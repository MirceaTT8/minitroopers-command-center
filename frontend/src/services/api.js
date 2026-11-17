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

export async function requestSoldierUpgrade(accountId) {
  const response = await fetch(
    `/api/account/${encodeURIComponent(accountId)}/request-upgrade`,
    {
      method: 'POST',
    }
  )
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.details || data.error || 'Upgrade request failed')
  }
  return data
}

export async function selectSoldierUpgrade(accountId, selectUrl) {
  const response = await fetch(
    `/api/account/${encodeURIComponent(accountId)}/select-upgrade`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectUrl }),
    }
  )
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.details || data.error || 'Selecting upgrade failed')
  }
  return data
}