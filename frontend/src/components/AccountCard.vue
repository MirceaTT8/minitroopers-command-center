<template>
  <div
    @click="$emit('select', account.id)"
    class="bg-slate-800 p-5 rounded-xl shadow-lg border cursor-pointer transition-all hover:scale-[1.01] flex flex-col justify-between"
    :class="
      hasUpgradeOptions
        ? 'border-amber-400'
        : isReady
          ? 'border-green-500'
          : 'border-slate-700'
    "
  >
    <div>
      <div class="flex justify-between items-start gap-2 mb-3">
        <div>
          <h2 class="text-xl font-bold text-yellow-400 leading-tight">{{ account.name }}</h2>
          <div class="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              v-if="account.recruiter"
              class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-500/60"
            >
              Recruiter: {{ account.recruiter }}
            </span>
            <span
              v-else
              class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-400 border border-slate-700"
            >
              Recruiter: Unassigned
            </span>
          </div>
        </div>

        <div class="flex flex-col items-end text-xs text-slate-400 shrink-0">
          <span>Power: <strong class="text-white">{{ account.power }}</strong></span>
          <span v-if="account.raidPhase" class="text-yellow-400/90 font-semibold mt-0.5">
            Raid Phase {{ account.raidPhase }}
          </span>
        </div>
      </div>

      <div class="p-4 bg-slate-900 rounded-lg border border-slate-700 flex items-center gap-4">
        <img
          v-if="account.firstSoldier.avatarUrl"
          :src="account.firstSoldier.avatarUrl"
          :alt="account.firstSoldier.name"
          class="w-14 h-14 rounded bg-slate-800 border border-slate-600 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-300 truncate">
            1st Soldier:
            <span class="text-white">
              {{ account.firstSoldier.name }} (Lvl {{ account.firstSoldier.level ?? '?' }})
            </span>
          </p>
          <p class="text-sm text-slate-400 mt-1">
            Credits: <span class="text-white font-bold">{{ account.credits }} T</span> |
            Next Cost: <span class="text-white font-bold">{{ account.firstSoldier.upgradeCost }} T</span>
          </p>
          <p class="text-xs text-slate-500 mt-1">
            Unlocked Skills:
            <span class="text-slate-300 font-semibold">{{ account.firstSoldier.skills.length }}</span>
          </p>
        </div>
      </div>

      <!-- Request Upgrade Button Directly on Every Soldier Card -->
      <div class="mt-3">
        <button
          @click.stop="$emit('request-upgrade', account.id)"
          :disabled="isUpgrading"
          class="w-full py-2 px-3 rounded-lg font-bold text-xs transition-colors cursor-pointer border"
          :class="
            hasUpgradeOptions
              ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-white'
              : isReady
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white'
                : 'bg-blue-700 hover:bg-blue-600 border-blue-500 text-white disabled:opacity-50'
          "
        >
          {{
            isUpgrading
              ? 'Requesting /t/0 Upgrade...'
              : hasUpgradeOptions
                ? 'Refresh Pending Skill Choices (/t/0)'
                : `Request Upgrade on /t/0 (${account.firstSoldier.upgradeCost} T)`
          }}
        </button>
      </div>

      <!-- Inline Upgrade Options Display once Requested -->
      <div
        v-if="hasUpgradeOptions"
        @click.stop
        class="mt-3 p-3 bg-slate-900/95 rounded-lg border border-amber-400/80"
      >
        <div class="text-[11px] font-bold text-amber-300 uppercase mb-2">
          Choose New Skill for {{ account.firstSoldier.name }} (Lvl {{ account.firstSoldier.level }})
        </div>
        <div class="space-y-2">
          <div
            v-for="opt in account.firstSoldier.availableUpgrades"
            :key="opt.key"
            class="p-2.5 rounded border text-xs"
            :class="getColorClasses(opt.color)"
          >
            <div class="flex items-center justify-between font-bold">
              <span>{{ opt.name }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                {{ opt.type }} • {{ opt.color }} • #{{ opt.id }}
              </span>
            </div>
            <div class="text-[10px] font-mono opacity-75 mt-0.5">
              key: {{ opt.key }}
            </div>
            <p class="text-[11px] mt-1 opacity-95 leading-snug">
              {{ opt.description }}
            </p>
            <button
              v-if="opt.selectUrl"
              @click.stop="$emit('select-upgrade', { accountId: account.id, selectUrl: opt.selectUrl })"
              :disabled="isUpgrading"
              class="mt-2 w-full bg-black/40 hover:bg-black/60 border border-white/30 py-1.5 rounded text-[11px] font-bold cursor-pointer"
            >
              Teach {{ opt.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between pt-2 border-t border-slate-700/60">
      <UpgradeBadge
        :credits="account.credits"
        :upgradeCost="account.firstSoldier.upgradeCost"
        :pendingCount="account.firstSoldier.availableUpgrades?.length || 0"
      />
      <span class="text-xs font-bold text-sky-400">Inspect Soldier -&gt;</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UpgradeBadge from './UpgradeBadge.vue'

const props = defineProps({
  account: {
    type: Object,
    required: true,
  },
  isUpgrading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['select', 'request-upgrade', 'select-upgrade'])

const isReady = computed(
  () =>
    props.account.firstSoldier.upgradeCost > 0 &&
    props.account.credits >= props.account.firstSoldier.upgradeCost
)

const hasUpgradeOptions = computed(
  () =>
    Array.isArray(props.account.firstSoldier?.availableUpgrades) &&
    props.account.firstSoldier.availableUpgrades.length > 0
)

const COLOR_STYLE_MAP = {
  Gray: 'bg-zinc-700/80 border-zinc-400 text-zinc-200',
  Red: 'bg-red-900/75 border-red-500 text-red-200',
  Orange: 'bg-orange-900/75 border-orange-500 text-orange-200',
  Yellow: 'bg-yellow-900/75 border-yellow-400 text-yellow-200',
  Green: 'bg-emerald-900/75 border-emerald-500 text-emerald-200',
  Cyan: 'bg-cyan-900/75 border-cyan-400 text-cyan-200',
  Blue: 'bg-blue-900/75 border-blue-500 text-blue-200',
  Purple: 'bg-purple-900/75 border-purple-500 text-purple-200',
}

function getColorClasses(color) {
  return COLOR_STYLE_MAP[color] || COLOR_STYLE_MAP.Gray
}
</script>