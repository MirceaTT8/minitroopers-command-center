import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import SoldierDetailView from '../views/SoldierDetailView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/account/:accountId',
      name: 'soldier-detail',
      component: SoldierDetailView,
    },
  ],
})

export default router