<script setup lang="ts">
/** A thin vertical grip on a pane's right edge; the parent's useResizable owns the width. */
defineEmits<{ start: [e: PointerEvent] }>()
</script>

<template>
  <div
    class="group relative w-0 shrink-0"
    data-test="resize-handle"
    @pointerdown="$emit('start', $event)"
  >
    <div
      class="absolute inset-y-0 -left-1 w-2 cursor-col-resize group-hover:bg-blue-300/50 dark:group-hover:bg-blue-500/40"
      title="drag to resize"
    />
  </div>
</template>
