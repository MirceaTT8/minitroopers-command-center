<template>
  <div class="min-h-screen bg-slate-900 text-white p-8">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold text-sky-400">Mini Troopers Command Center</h1>
        <p class="text-slate-400 text-sm">
          Multi-Account First Soldier Upgrade Tracker ({{ store.readyToUpgradeCount }}/{{
            store.accounts.length
          }}
          Ready)
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          @click="store.loadAccounts()"
          :disabled="store.loading || store.syncing"
          class="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer"
        >
          Refresh Cache
        </button>
        <button
          @click="store.syncAccounts()"
          :disabled="store.syncing"
          class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer"
        >
          {{ store.syncing ? 'Syncing Accounts...' : 'Sync All Accounts (--scrape-only)' }}
        </button>
      </div>
    </div>

    <!-- Recruiter Filter Bar -->
    <div
      v-if="recruiterOptions.length > 0"
      class="flex flex-wrap items-center gap-2 mb-6 bg-slate-800/80 p-3 rounded-xl border border-slate-700"
    >
      <span class="text-xs font-bold text-slate-400 uppercase mr-1">Filter by Recruiter:</span>
      <button
        @click="selectedRecruiter = 'ALL'"
        class="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border transition-colors"
        :class="
          selectedRecruiter === 'ALL'
            ? 'bg-sky-600 border-sky-400 text-white'
            : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700'
        "
      >
        All Teams ({{ store.accounts.length }})
      </button>
      <button
        v-for="rec in recruiterOptions"
        :key="rec.name"
        @click="selectedRecruiter = rec.name"
        class="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border transition-colors"
        :class="
          selectedRecruiter === rec.name
            ? 'bg-indigo-600 border-indigo-400 text-white'
            : 'bg-slate-900 border-slate-700 text-indigo-300 hover:bg-slate-700'
        "
      >
        {{ rec.name }} ({{ rec.count }})
      </button>
    </div>

    <div
      v-if="store.error"
      class="bg-red-950/80 border border-red-500 text-red-200 p-4 rounded-lg mb-6 text-sm"
    >
      {{ store.error }}
    </div>

    <div
      v-if="!store.loading && store.accounts.length === 0"
      class="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-300"
    >
      <p class="text-lg font-semibold mb-2">No scraped accounts found in backend/data/raw_html/</p>
      <p class="text-sm text-slate-400">
        Click <strong>Sync All Accounts (--scrape-only)</strong> above or run
        <code>./scripts/run_accounts.sh --scrape-only</code> in your terminal.
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AccountCard
        v-for="account in filteredAccounts"
        :key="account.id"
        :account="account"
        :isUpgrading="store.isAccountUpgrading(account.id)"
        @select="goToAccountDetail"
        @request-upgrade="handleRequestUpgrade"
        @select-upgrade="handleSelectUpgrade"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountsStore } from '../stores/accountsStore'
import AccountCard from '../components/AccountCard.vue'

const router = useRouter()
const store = useAccountsStore()
const selectedRecruiter = ref('ALL')

const recruiterOptions = computed(() => {
  const counts = new Map()
  for (const acc of store.accounts) {
    const key = acc.recruiter || 'Unassigned'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
})

const filteredAccounts = computed(() => {
  if (selectedRecruiter.value === 'ALL') {
    return store.accounts
  }
  return store.accounts.filter(
    (acc) => (acc.recruiter || 'Unassigned') === selectedRecruiter.value
  )
})

function goToAccountDetail(accountId) {
  router.push(`/account/${accountId}`)
}

async function handleRequestUpgrade(accountId) {
  await store.requestUpgradeForAccount(accountId)
}

async function handleSelectUpgrade({ accountId, selectUrl }) {
  await store.chooseUpgradeForAccount(accountId, selectUrl)
}

onMounted(() => {
  store.loadAccounts()
})
</script>