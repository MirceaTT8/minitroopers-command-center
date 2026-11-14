<script setup>
import { computed } from 'vue'
import skillsDictionary from '@/constants/skillsDictionary.json'

const props = defineProps({
  skills: {
    type: Array,
    required: true,
  },
})

const GROUPS_CONFIG = [
  {
    sortOrder: 1,
    title: '1. RED — Weapons & Munitions',
    titleClass: 'text-red-300',
    badgeClass: 'bg-red-600/90 border-red-300/80 text-white',
  },
  {
    sortOrder: 2,
    title: '2. BLUE / PURPLE — Role & Specialization',
    titleClass: 'text-purple-300',
    badgeClass: 'bg-purple-600/90 border-purple-300/80 text-white',
  },
  {
    sortOrder: 3,
    title: '3. YELLOW / ORANGE — Active Combat & Tactical Skills',
    titleClass: 'text-amber-300',
    badgeClass: 'bg-amber-600/90 border-amber-200/80 text-white',
  },
  {
    sortOrder: 4,
    title: '4. GREEN / DARK — Passives & Survival',
    titleClass: 'text-emerald-300',
    badgeClass: 'bg-emerald-700/90 border-emerald-300/80 text-white',
  },
]

const orderedGroups = computed(() => {
  const normalized = props.skills.map((skillItem) => {
    const skillName = typeof skillItem === 'string' ? skillItem : skillItem.name
    const dictEntry = skillsDictionary[skillName] || {
      type: 'Passive',
      color: 'Green',
      sortOrder: 4,
    }
    return {
      name: skillName,
      ...dictEntry,
    }
  })

  return GROUPS_CONFIG.map((group) => ({
    ...group,
    items: normalized.filter((item) => item.sortOrder === group.sortOrder),
  }))
})
</script>

<template>
  <div class="bg-slate-900 p-5 rounded-xl border border-slate-800">
    <h2 class="text-xs font-extrabold tracking-wider text-sky-400 uppercase mb-4">
      Ordered Skills &amp; Weapons (By Type &amp; Color)
    </h2>

    <div class="space-y-4">
      <div v-for="group in orderedGroups" :key="group.sortOrder">
        <h3 class="text-xs font-bold mb-2" :class="group.titleClass">
          {{ group.title }}
        </h3>

        <div v-if="group.items.length > 0" class="flex flex-wrap gap-2.5">
          <span
            v-for="skill in group.items"
            :key="skill.name"
            class="px-3.5 py-1.5 rounded-md text-xs font-extrabold border shadow-sm"
            :class="group.badgeClass"
          >
            {{ skill.name }}
          </span>
        </div>
        <p v-else class="text-xs text-slate-500 italic">None unlocked in this category yet.</p>
      </div>
    </div>
  </div>
</template>
