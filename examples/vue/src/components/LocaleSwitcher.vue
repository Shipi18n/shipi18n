<script setup>
import { useI18n } from 'vue-i18n'
import { loadLocale, LOCALES } from '../i18n'

const { locale } = useI18n()
</script>

<template>
  <div class="locale-switcher">
    <label for="locale-select">{{ $t('nav.language') }}</label>
    <select id="locale-select" :value="locale" @change="loadLocale($event.target.value)">
      <option v-for="l in LOCALES" :key="l.code" :value="l.code">
        {{ l.flag }} {{ l.name }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.locale-switcher {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1rem;
}
label { font-weight: 500; color: #555; }
select {
  padding: 0.4rem 0.8rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
}
select:hover { border-color: #4a90d9; }
</style>
