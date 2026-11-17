import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchAccountsFromApi } from '@/services/api'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const usingMockData = ref(false)

  const totalAccounts = computed(() => accounts.value.length)

  const upgradesReadyCount = computed(
    () => accounts.value.filter((acc) => acc.credits >= acc.firstSoldier.upgradeCost).length,
  )

  const currentRaidPhase = computed(() => accounts.value[0]?.raidPhase ?? 'Unknown')

  async function fetchAccounts() {
    loading.value = true
    try {
      const result = await fetchAccountsFromApi()
      accounts.value = result.data
      usingMockData.value = result.isMock
    } finally {
      loading.value = false
    }
  }

  function getAccountById(id) {
    return accounts.value.find((acc) => acc.id === id)
  }

  return {
    accounts,
    loading,
    usingMockData,
    totalAccounts,
    upgradesReadyCount,
    currentRaidPhase,
    fetchAccounts,
    getAccountById,
  }
})
