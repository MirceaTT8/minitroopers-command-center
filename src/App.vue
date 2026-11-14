<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useAccountsStore } from '@/stores/accountsStore'

const store = useAccountsStore()
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Top Command Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-4">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <RouterLink to="/" class="flex items-center gap-3 group">
          <div
            class="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/40 flex items-center justify-center text-sky-400 font-black"
          >
            MT
          </div>
          <div>
            <h1 class="text-lg font-extrabold tracking-wide text-sky-400 group-hover:text-sky-300">
              MINI TROOPERS COMMAND CENTER
            </h1>
            <p class="text-xs text-slate-400">
              Multi-Account First Soldier Upgrade Tracker &amp; Raid Status
            </p>
          </div>
        </RouterLink>

        <div class="flex items-center gap-3">
          <span
            v-if="store.usingMockData"
            class="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/10 text-amber-300 border border-amber-500/30"
          >
            Demo Mode (Offline Preview)
          </span>
          <button
            @click="store.fetchAccounts()"
            :disabled="store.loading"
            class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {{ store.loading ? 'Syncing Accounts...' : 'Sync All Accounts' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Active Route View -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
      <RouterView />
    </main>
  </div>
</template>
