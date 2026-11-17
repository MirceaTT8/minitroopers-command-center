import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchAllAccounts,
  fetchAccountById,
  triggerAccountsSync,
  requestSoldierUpgrade,
  selectSoldierUpgrade,
} from '../services/api'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const syncing = ref(false)
  const upgradingAccountIds = ref({})
  const error = ref('')

  const readyToUpgradeCount = computed(() =>
    accounts.value.filter(
      (acc) =>
        acc.firstSoldier &&
        ((acc.firstSoldier.upgradeCost > 0 &&
          acc.credits >= acc.firstSoldier.upgradeCost) ||
          (acc.firstSoldier.availableUpgrades &&
            acc.firstSoldier.availableUpgrades.length > 0))
    ).length
  )

  function replaceAccountInList(updatedAccount) {
    if (!updatedAccount) return
    const idx = accounts.value.findIndex(
      (acc) => acc.id.toLowerCase() === updatedAccount.id.toLowerCase()
    )
    if (idx !== -1) {
      accounts.value[idx] = updatedAccount
    } else {
      accounts.value.push(updatedAccount)
    }
  }

  async function loadAccounts() {
    loading.value = true
    error.value = ''
    try {
      accounts.value = await fetchAllAccounts()
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function syncAccounts() {
    syncing.value = true
    error.value = ''
    try {
      const result = await triggerAccountsSync()
      accounts.value = result.accounts || []
    } catch (err) {
      error.value = err.message
    } finally {
      syncing.value = false
    }
  }

  async function getAccount(accountId) {
    const existing = accounts.value.find(
      (acc) => acc.id.toLowerCase() === accountId.toLowerCase()
    )
    if (existing) return existing

    try {
      const fetched = await fetchAccountById(accountId)
      replaceAccountInList(fetched)
      return fetched
    } catch (err) {
      error.value = err.message
      return null
    }
  }

  async function requestUpgradeForAccount(accountId) {
    const key = accountId.toLowerCase()
    upgradingAccountIds.value[key] = true
    error.value = ''
    try {
      const result = await requestSoldierUpgrade(accountId)
      if (result.account) {
        replaceAccountInList(result.account)
      }
      return result.account
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      upgradingAccountIds.value[key] = false
    }
  }

  async function chooseUpgradeForAccount(accountId, selectUrl) {
    const key = accountId.toLowerCase()
    upgradingAccountIds.value[key] = true
    error.value = ''
    try {
      const result = await selectSoldierUpgrade(accountId, selectUrl)
      if (result.account) {
        replaceAccountInList(result.account)
      }
      return result.account
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      upgradingAccountIds.value[key] = false
    }
  }

  function isAccountUpgrading(accountId) {
    return Boolean(upgradingAccountIds.value[accountId?.toLowerCase()])
  }

  return {
    accounts,
    loading,
    syncing,
    upgradingAccountIds,
    error,
    readyToUpgradeCount,
    loadAccounts,
    syncAccounts,
    getAccount,
    requestUpgradeForAccount,
    chooseUpgradeForAccount,
    isAccountUpgrading,
  }
})