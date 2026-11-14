<script setup>
import { onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accountsStore'
import AccountCard from '@/components/AccountCard.vue'

const store = useAccountsStore()

onMounted(() => {
  if (store.accounts.length === 0) {
    store.fetchAccounts()
  }
})
</script>

<template>
  <div>
    <!-- Summary Metrics Bar -->
    <div
      class="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3.5 mb-6 flex flex-wrap items-center justify-between gap-4 text-sm"
    >
      <div class="font-bold text-slate-200">
        Total Accounts: <span class="text-white">{{ store.totalAccounts }}</span>
      </div>
      <div class="font-bold text-green-400">
        Upgrades Ready (1st Soldier): <span>{{ store.upgradesReadyCount }}</span>
      </div>
      <div class="font-bold text-yellow-400">
        Recruiter Raid Phase: <span>Phase {{ store.currentRaidPhase }}</span>
      </div>
    </div>

    <!-- Account Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AccountCard v-for="account in store.accounts" :key="account.id" :account="account" />
    </div>
  </div>
</template>
