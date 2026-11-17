import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchAllAccounts, fetchAccountById, triggerAccountsSync } from '../services/api'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const syncing = ref(false)
  const error = ref('')

  const readyToUpgradeCount = computed(() =>
    accounts.value.filter(
      (acc) =>
        acc.firstSoldier &&
        acc.firstSoldier.upgradeCost > 0 &&
        acc.credits >= acc.firstSoldier.upgradeCost
    ).length
  )

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
      return await fetchAccountById(accountId)
    } catch (err) {
      error.value = err.message
      return null
    }
  }

  return {
    accounts,
    loading,
    syncing,
    error,
    readyToUpgradeCount,
    loadAccounts,
    syncAccounts,
    getAccount,
  }
})