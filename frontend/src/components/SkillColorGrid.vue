<template>
  <div class="bg-slate-800 p-5 rounded-xl border border-slate-700">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-bold text-sky-400 uppercase">
        Unlocked Skills &amp; Weapons ({{ skills.length }})
      </h2>
      <span class="text-xs text-slate-400">
        Fields: id, key, name, type, color, description
      </span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div
        v-for="skill in skills"
        :key="skill.key"
        class="p-3.5 rounded-lg border transition-all"
        :class="getColorClasses(skill.color)"
      >
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-bold text-sm">
            {{ skill.name }}
          </span>
          <div class="flex items-center gap-1.5 text-[11px] opacity-90">
            <span class="px-2 py-0.5 rounded bg-black/30 font-semibold">
              {{ skill.type }}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-black/30 font-mono">
              #{{ skill.id }}
            </span>
          </div>
        </div>
        <div class="text-[11px] font-mono opacity-75 mb-1.5">
          key: {{ skill.key }} • color: {{ skill.color }}
        </div>
        <p class="text-xs leading-relaxed opacity-95">
          {{ skill.description }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  skills: {
    type: Array,
    required: true,
  },
})

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