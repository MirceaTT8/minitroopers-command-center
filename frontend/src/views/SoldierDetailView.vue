<template>
  <div v-if="account && soldier" class="min-h-screen bg-slate-900 text-white p-8">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
      <div class="flex items-center gap-4">
        <button
          @click="$router.push('/')"
          class="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-sm font-bold cursor-pointer"
        >
          &lt;- Back to List
        </button>
        <h1 class="text-2xl font-bold text-sky-400">
          {{ account.name }} — {{ soldier.name }}'s Stats Sheet (Lvl {{ soldier.level ?? '?' }})
        </h1>
      </div>

      <button
        @click="handleRequestUpgrade"
        :disabled="isUpgrading"
        class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-xs text-white cursor-pointer border border-emerald-400"
      >
        {{
          isUpgrading
            ? 'Requesting /t/0 Upgrade...'
            : soldier.availableUpgrades?.length
              ? 'Refresh Pending Skill Choices (/t/0)'
              : `Request Upgrade on /t/0 (${soldier.upgradeCost} T)`
        }}
      </button>
    </div>

    <div
      v-if="store.error"
      class="bg-red-950/80 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm"
    >
      {{ store.error }}
    </div>

    <div
      class="p-3 rounded-lg border mb-6 font-bold text-sm"
      :class="
        soldier.availableUpgrades?.length
          ? 'bg-amber-950 border-amber-400 text-amber-200'
          : canUpgrade
            ? 'bg-green-950 border-green-500 text-green-300'
            : 'bg-red-950 border-red-500 text-red-300'
      "
    >
      <span v-if="soldier.availableUpgrades?.length">
        [LEVEL {{ soldier.level }} SKILL SELECTION PENDING] {{ soldier.name }} has advanced to Level
        {{ soldier.level }}! Choose 1 of the {{ soldier.availableUpgrades.length }} skills below
        (Current Credits: {{ account.credits }} T | Next Level Upgrade Cost: {{ soldier.upgradeCost }} T).
      </span>
      <span v-else-if="canUpgrade">
        [UPGRADE AVAILABLE] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T | Remaining after upgrade:
        {{ account.credits - soldier.upgradeCost }} T
      </span>
      <span v-else>
        [INSUFFICIENT FUNDS] Credits: {{ account.credits }} T | Upgrade Cost:
        {{ soldier.upgradeCost }} T (Short by
        {{ Math.max(0, soldier.upgradeCost - account.credits) }} T)
      </span>
    </div>

    <div class="mb-6">
      <UpgradeChoicesBox
        :account="account"
        :soldier="soldier"
        :canUpgrade="canUpgrade"
        :isUpgrading="isUpgrading"
        @request-upgrade="handleRequestUpgrade"
        @select-upgrade="handleSelectUpgrade"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SoldierStatsPanel :account="account" :soldier="soldier" />
      <div class="lg:col-span-2">
        <SkillColorGrid :skills="soldier.skills" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAccountsStore } from '../stores/accountsStore'
import SoldierStatsPanel from '../components/SoldierStatsPanel.vue'
import SkillColorGrid from '../components/SkillColorGrid.vue'
import UpgradeChoicesBox from '../components/UpgradeChoicesBox.vue'

const route = useRoute()
const store = useAccountsStore()
const account = ref(null)

const soldier = computed(() => account.value?.firstSoldier || null)
const isUpgrading = computed(() =>
  store.isAccountUpgrading(route.params.accountId)
)
const canUpgrade = computed(() => {
  if (!account.value || !soldier.value) return false
  return (
    (soldier.value.upgradeCost > 0 &&
      account.value.credits >= soldier.value.upgradeCost) ||
    (soldier.value.availableUpgrades &&
      soldier.value.availableUpgrades.length > 0)
  )
})

async function handleRequestUpgrade() {
  const updated = await store.requestUpgradeForAccount(route.params.accountId)
  if (updated) {
    account.value = updated
  }
}

async function handleSelectUpgrade(selectUrl) {
  const updated = await store.chooseUpgradeForAccount(
    route.params.accountId,
    selectUrl
  )
  if (updated) {
    account.value = updated
  }
}

onMounted(async () => {
  await store.loadAccounts()
  account.value = await store.getAccount(route.params.accountId)
})
</script>