<!-- frontend/src/components/UpgradeChoicesBox.vue -->
<template>
  <div class="bg-slate-800 p-5 rounded-xl border border-blue-500">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-sm font-bold text-blue-400 uppercase">
          Upgrade Selection (First Soldier — /t/0)
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">
          Send an upgrade request on /t/0 to reveal {{ soldier.name }}'s rolled upgrade options.
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="soldier.availableUpgrades?.length"
          @click="loadAiAdvice"
          :disabled="loadingAdvice"
          class="bg-sky-700 hover:bg-sky-600 disabled:opacity-50 px-3 py-2 rounded-lg font-bold text-xs text-white cursor-pointer border border-sky-400"
        >
          {{ loadingAdvice ? 'Asking LLM...' : 'Re-Run LLM Advisor' }}
        </button>

        <button
          @click="$emit('request-upgrade')"
          :disabled="isUpgrading"
          class="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-xs text-white cursor-pointer border border-emerald-400"
        >
          {{
            isUpgrading
              ? 'Sending /t/0 Upgrade Request...'
              : soldier.availableUpgrades?.length
                ? 'Re-Fetch Upgrade Options (/t/0)'
                : `Request Upgrade on /t/0 (${soldier.upgradeCost} T)`
          }}
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!soldier.availableUpgrades || soldier.availableUpgrades.length === 0"
      class="bg-slate-900/80 border border-slate-700 rounded-lg p-5 text-center text-slate-300 mb-4"
    >
      <p class="text-sm font-semibold">
        No upgrade options loaded yet for {{ soldier.name }}.
      </p>
      <p class="text-xs text-slate-400 mt-1">
        Click <strong>Request Upgrade on /t/0</strong> above to trigger the level-up request and automatically ask the LLM advisor.
      </p>
    </div>

    <!-- Revealed Upgrade Options Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div
        v-for="opt in soldier.availableUpgrades"
        :key="opt.key"
        class="p-4 rounded-lg border flex flex-col justify-between transition-all"
        :class="[
          getColorClasses(opt.color),
          isRecommended(opt) ? 'ring-2 ring-sky-300 scale-[1.01]' : ''
        ]"
      >
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-bold uppercase px-2 py-0.5 rounded bg-black/30">
              {{ opt.type }} ({{ opt.color }})
            </span>
            <span
              v-if="isRecommended(opt)"
              class="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-sky-500 text-slate-950"
            >
              LLM Pick
            </span>
            <span v-else class="text-xs font-mono px-1.5 py-0.5 rounded bg-black/30">
              #{{ opt.id }}
            </span>
          </div>

          <div class="text-lg font-bold mt-2 mb-1">{{ opt.name }}</div>
          <div class="text-[11px] font-mono opacity-80 mb-2">
            key: {{ opt.key }}
          </div>
          <p class="text-xs leading-relaxed opacity-95 mb-3">
            {{ opt.description }}
          </p>

          <p
            v-if="getOptionNote(opt)"
            class="text-[11px] bg-black/35 rounded p-2 mb-3 border border-white/15"
          >
            <strong>{{ getOptionNote(opt).verdict }}:</strong> {{ getOptionNote(opt).reason }}
          </p>
        </div>

        <button
          v-if="opt.selectUrl"
          @click="$emit('select-upgrade', opt.selectUrl)"
          :disabled="isUpgrading"
          class="w-full bg-black/40 hover:bg-black/60 border border-white/30 py-2 rounded text-xs font-bold cursor-pointer"
        >
          Confirm &amp; Equip {{ opt.name }}
        </button>
      </div>
    </div>

    <!-- Live LLM Strategy Advisor Panel -->
    <div class="bg-blue-950/60 p-4 rounded-lg border border-sky-400">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="text-xs font-bold text-sky-400 uppercase">
          AI Strategy Advisor
          <span v-if="advice?.source === 'llm'" class="text-emerald-300 ml-1">
            ({{ advice.model }})
          </span>
          <span v-else-if="advice?.source === 'fallback-rules'" class="text-amber-300 ml-1">
            (Local Strategy Rules Fallback)
          </span>
        </div>

        <span
          v-if="advice?.recommendedSkill"
          class="px-2.5 py-0.5 rounded text-xs font-bold bg-sky-500 text-slate-950"
        >
          Recommended: {{ advice.recommendedSkill }} ({{ advice.confidence }}%)
        </span>
      </div>

      <p v-if="loadingAdvice" class="text-xs text-sky-200 animate-pulse">
        Evaluating {{ soldier.name }}'s build and Recruiter {{ account.recruiter || 'Unassigned' }}'s army pool via LLM...
      </p>

      <p v-else-if="adviceError" class="text-xs text-red-300">
        {{ adviceError }}
      </p>

      <div v-else-if="advice && advice.source !== 'none'" class="space-y-2 text-xs text-slate-200">
        <p class="leading-relaxed">{{ advice.summary }}</p>

        <div
          v-if="advice.collectiveMetrics"
          class="flex flex-wrap gap-2 pt-1 text-[11px] text-sky-200"
        >
          <span class="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Archetype: {{ advice.archetype }}
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Saboteurs: {{ advice.collectiveMetrics.saboteurs }} ({{ advice.collectiveMetrics.globalSabotagePower }} disarm)
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Scouts: {{ advice.collectiveMetrics.scouts }}/4
          </span>
          <span class="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700">
            Comms: {{ advice.collectiveMetrics.globalCommsPoints }} pts
          </span>
        </div>

        <p v-if="advice.aiConfigTip" class="text-[11px] text-amber-200">
          <strong>AI Dropdown Tip:</strong> {{ advice.aiConfigTip }}
        </p>
      </div>

      <p v-else class="text-xs text-slate-300 leading-relaxed">
        Waiting for upgrade choices on /t/0. Once revealed, the LLM will automatically analyze Recruiter
        <strong>{{ account.recruiter || 'Unassigned' }}</strong>'s recruits and {{ soldier.name }}'s build.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { fetchAiUpgradeAdvice } from '../services/api'

const props = defineProps({
  account: { type: Object, required: true },
  soldier: { type: Object, required: true },
  canUpgrade: { type: Boolean, required: true },
  isUpgrading: { type: Boolean, default: false },
})

defineEmits(['request-upgrade', 'select-upgrade'])

const advice = ref(null)
const loadingAdvice = ref(false)
const adviceError = ref('')

async function loadAiAdvice() {
  if (!props.soldier?.availableUpgrades?.length) {
    advice.value = null
    return
  }
  loadingAdvice.value = true
  adviceError.value = ''
  try {
    advice.value = await fetchAiUpgradeAdvice(props.account.id)
  } catch (err) {
    adviceError.value = err.message
  } finally {
    loadingAdvice.value = false
  }
}

// Automatically call the LLM every time upgrade options appear or change
watch(
  () => (props.soldier?.availableUpgrades || []).map((u) => u.key).join(','),
  (newKeys) => {
    if (newKeys) {
      loadAiAdvice()
    } else {
      advice.value = null
    }
  },
  { immediate: true }
)

function isRecommended(opt) {
  if (!advice.value) return false
  return (
    advice.value.recommendedKey === opt.key ||
    advice.value.recommendedSkill?.toLowerCase() === opt.name?.toLowerCase()
  )
}

function getOptionNote(opt) {
  return advice.value?.optionAnalysis?.find(
    (item) =>
      item.key === opt.key ||
      item.name?.toLowerCase() === opt.name?.toLowerCase()
  )
}

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