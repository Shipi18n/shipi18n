<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LocaleSwitcher from './components/LocaleSwitcher.vue'

const { t } = useI18n()
const itemCount = ref(3)
</script>

<template>
  <div class="app">
    <header>
      <h1>{{ t('app.title') }}</h1>
      <p class="subtitle">{{ t('app.description') }}</p>
      <LocaleSwitcher />
    </header>

    <main>
      <section class="card">
        <!-- Named interpolation: {name} survives translation -->
        <h2>{{ t('greeting', { name: 'Ada' }) }}</h2>
        <p>{{ t('messages.welcome') }}</p>

        <!-- Pluralisation: vue-i18n picks items_one / items_other -->
        <p>{{ t('items', itemCount, { count: itemCount }) }}</p>
        <p class="muted">{{ t('items', 1, { count: 1 }) }}</p>

        <div class="counter">
          <button type="button" @click="itemCount = Math.max(0, itemCount - 1)">−</button>
          <span>{{ itemCount }}</span>
          <button type="button" @click="itemCount++">+</button>
        </div>

        <div class="actions">
          <button type="button" class="primary">{{ t('buttons.save') }}</button>
          <button type="button">{{ t('buttons.cancel') }}</button>
        </div>
      </section>

      <section class="card">
        <h3>{{ t('nav.settings') }}</h3>
        <p class="error">{{ t('errors.required') }}</p>
        <p class="error">{{ t('errors.invalid_email') }}</p>
      </section>

      <footer>
        <p class="muted">{{ t('footer') }}</p>
        <a href="https://github.com/Shipi18n/shipi18n" target="_blank" rel="noopener noreferrer">
          github.com/Shipi18n/shipi18n
        </a>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.app { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
header { text-align: center; margin-bottom: 2rem; }
h1 { margin: 0 0 .25rem; }
.subtitle { color: #666; margin: 0; }

.card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: .75rem;
  padding: 1.5rem; margin-bottom: 1.25rem;
}
.card h2, .card h3 { margin-top: 0; }
.muted { color: #6b7280; font-size: .9rem; }
.error { color: #b91c1c; margin: .25rem 0; }

.counter { display: flex; align-items: center; gap: .75rem; margin: 1rem 0; }
.counter button {
  width: 2rem; height: 2rem; border: 1px solid #ddd; border-radius: .375rem;
  background: #fff; cursor: pointer; font-size: 1rem;
}

.actions { display: flex; gap: .5rem; }
.actions button {
  padding: .5rem 1rem; border: 1px solid #ddd; border-radius: .5rem;
  background: #fff; cursor: pointer; font: inherit;
}
.actions .primary { background: #4a90d9; border-color: #4a90d9; color: #fff; }

footer { text-align: center; margin-top: 2rem; }
footer a { color: #4a90d9; }
</style>
