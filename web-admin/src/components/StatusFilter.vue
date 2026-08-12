<template>
  <div class="status-filter">
    <span v-if="label" class="sf-label">{{ label }}</span>
    <el-radio-group :model-value="modelValue" @update:model-value="onChange">
      <el-radio-button v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</el-radio-button>
    </el-radio-group>
  </div>
</template>

<script setup>
defineProps({
  options: { type: Array, required: true },
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

function onChange(value) {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.status-filter { display: flex; align-items: center; gap: 8px; }
.sf-label { color: var(--el-text-color-secondary); font-size: 13px; white-space: nowrap; }
</style>