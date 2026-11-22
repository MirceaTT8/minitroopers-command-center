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
      <div class="flex flex-wrap items-center gap-3">
        <button
          @click="store.loadAccounts()"
          :disabled="store.loading || store.syncing || store.autoUpgrading || store.autoConfiguring"
          class="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer"
        >
          Refresh Cache
        </button>
        <button
          @click="store.syncAccounts()"
          :disabled="store.syncing || store.autoUpgrading || store.autoConfiguring"
          class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer"
        >
          {{ store.syncing ? 'Syncing Accounts...' : 'Sync All Accounts (--scrape-only)' }}
        </button>

        <!-- Auto-Configure All AI Dropdowns Button -->
        <button
          @click="handleAutoConfigAll"
          :disabled="
            store.syncing ||
            store.loading ||
            store.autoUpgrading ||
            store.autoConfiguring ||
            filteredAccounts.length === 0
          "
          class="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer border border-purple-400"
        >
          {{
            store.autoConfiguring
              ? 'Auto-Configuring AI...'
              : selectedRecruiter === 'ALL'
                ? 'Auto-Configure All AI'
                : `Auto-Configure ${selectedRecruiter} AI`
          }}
        </button>

        <!-- Auto-Upgrade All (AI) / Stop Button -->
        <button
          v-if="!store.autoUpgrading"
          @click="handleAutoUpgradeAll"
          :disabled="store.syncing || store.loading || store.autoConfiguring"
          class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer border border-emerald-400"
        >
          {{
            selectedRecruiter === 'ALL'
              ? 'Auto-Upgrade All (AI)'
              : `Auto-Upgrade ${selectedRecruiter} (AI)`
          }}
        </button>
        <button
          v-else
          @click="store.stopAutoUpgrade()"
          :disabled="store.autoUpgradeStopRequested"
          class="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-sm cursor-pointer border border-red-400"
        >
          {{ store.autoUpgradeStopRequested ? 'Stopping After Current...' : 'Stop Auto-Upgrade' }}
        </button>
      </div>
    </div>

    <!-- Auto-Upgrade Live Progress & Log Console -->
    <div
      v-if="store.autoUpgrading || store.autoUpgradeLogs.length > 0"
      class="mb-6 bg-slate-950/90 border rounded-xl p-4"
      :class="
        store.autoUpgrading
          ? 'border-emerald-400'
          : store.autoUpgradeProgress.phase === 'stopped'
            ? 'border-amber-400'
            : 'border-sky-500/70'
      "
    >
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <span
            class="font-bold uppercase tracking-wide"
            :class="store.autoUpgrading ? 'text-emerald-400 animate-pulse' : 'text-sky-400'"
          >
            {{
              store.autoUpgradeProgress.phase === 'syncing'
                ? 'Syncing All Accounts...'
                : store.autoUpgradeProgress.phase === 'upgrading'
                  ? `Auto-Upgrading: ${store.autoUpgradeProgress.currentAccountId} (Upgrade ${store.autoUpgradeProgress.currentTrooperStep}/5)`
                  : store.autoUpgradeProgress.phase === 'stopped'
                    ? 'Auto-Upgrade Stopped'
                    : 'Auto-Upgrade Complete'
            }}
          </span>

          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Accounts: {{ store.autoUpgradeProgress.processedAccounts }}/{{ store.autoUpgradeProgress.totalAccounts }}
          </span>
          <span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700">
            Upgrades Applied: {{ store.autoUpgradeProgress.totalUpgradesApplied }}
          </span>
          <span
            v-if="store.autoUpgradeProgress.skippedAccounts.length > 0"
            class="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-700"
          >
            Skipped: {{ store.autoUpgradeProgress.skippedAccounts.join(', ') }}
          </span>
        </div>

        <button
          v-if="!store.autoUpgrading"
          @click="store.clearAutoUpgradeLogs()"
          class="text-xs text-slate-400 hover:text-white underline cursor-pointer"
        >
          Clear Log
        </button>
      </div>

      <div class="max-h-52 overflow-y-auto space-y-1 font-mono text-xs bg-slate-900/90 p-3 rounded-lg border border-slate-800">
        <div
          v-for="entry in store.autoUpgradeLogs"
          :key="entry.id"
          :class="{
            'text-emerald-300': entry.level === 'success',
            'text-amber-300': entry.level === 'warn',
            'text-red-300': entry.level === 'error',
            'text-slate-300': entry.level === 'info',
          }"
        >
          <span class="text-slate-500 mr-2">[{{ entry.time }}]</span>
          <span>{{ entry.message }}</span>
        </div>
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
        :disabled="store.autoUpgrading || store.autoConfiguring"
        class="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border transition-colors disabled:opacity-50"
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
        :disabled="store.autoUpgrading || store.autoConfiguring"
        class="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer border transition-colors disabled:opacity-50"
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
      v-if="store.autoConfigMessage"
      class="bg-purple-950/80 border border-purple-400 text-purple-200 p-4 rounded-lg mb-6 text-sm"
    >
      {{ store.autoConfigMessage }}
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
        :isUpgrading="store.isAccountUpgrading(account.id) || store.autoUpgrading || store.autoConfiguring"
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
  if (store.autoUpgrading || store.autoConfiguring) return
  router.push(`/account/${accountId}`)
}

async function handleRequestUpgrade(accountId) {
  await store.requestUpgradeForAccount(accountId)
}

async function handleSelectUpgrade({ accountId, selectUrl }) {
  await store.chooseUpgradeForAccount(accountId, selectUrl)
}

async function handleAutoConfigAll() {
  const scopeLabel =
    selectedRecruiter.value === 'ALL'
      ? `ALL ${store.accounts.length} tracked accounts`
      : `all ${filteredAccounts.value.length} accounts under Recruiter "${selectedRecruiter.value}"`

  const confirmed = window.confirm(
    `Auto-configure AI dropdowns (Weapon, Target, Victim, Style, Priority) for ${scopeLabel}?`
  )
  if (!confirmed) return

  const ids =
    selectedRecruiter.value === 'ALL'
      ? null
      : filteredAccounts.value.map((acc) => acc.id)

  await store.autoConfigureAll(ids)
}

async function handleAutoUpgradeAll() {
  const scopeLabel =
    selectedRecruiter.value === 'ALL'
      ? 'ALL tracked accounts'
      : `all accounts under Recruiter "${selectedRecruiter.value}"`

  const confirmed = window.confirm(
    `Start AI Auto-Upgrade for ${scopeLabel}?\n\n` +
      `• Runs Sync All Accounts (--scrape-only) first\n` +
      `• Upgrades each First Soldier (/t/0) in a loop using Gemini LLM\n` +
      `• Hard cap: 5 upgrades per trooper\n` +
      `• Skips and leaves alone any trooper if Gemini fails`
  )

  if (!confirmed) return
  await store.autoUpgradeAllAccounts(selectedRecruiter.value)
}

onMounted(() => {
  store.loadAccounts()
})
</script>