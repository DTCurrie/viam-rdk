<!--
@component
  
An element that Toggles visibility of content.

```svelte
    <Collapse>
      <svelte:fragment slot="heading">Motor 1</svelte:fragment>
      <Breadcrumbs slot='title' crumbs={['Robot', 'Motor']}></Breadcrumbs>
      <Badge slot='information' label='Inactive'></Badge>
      <div slot='content' "text-sm p-4 border border-t-0 border-light">
        Motor one was concieved and executed at Bell Labs in 1972 under the 
        guidance of lead director Dennis Richie and Superviser Wallace Breen.
      </div>
    </Collapse>
```
-->
<svelte:options immutable />

<script lang="ts">
import cx from 'classnames';
import { createEventDispatcher } from 'svelte';
import { Icon } from '@viamrobotics/prime-core';

/** Whether the collapse is in the open position. */
export let open = false;

/** Additional CSS classes to pass to the collapse button. */
let extraClasses: cx.Argument = '';
export { extraClasses as cx };

const dispatch = createEventDispatcher<{
  /** Fires when the collapse is toggled */
  toggle: boolean;
}>();

const handleClick = () => {
  open = !open;
  dispatch('toggle', open);
};
</script>

<div class="relative w-full">
  <button
    aria-label="Toggle Content"
    class={cx(
      'border-light text-default flex w-full cursor-pointer items-center justify-between border bg-white px-4 py-2',
      extraClasses
    )}
    on:click={handleClick}
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      {#if $$slots.title}
        <h2 class="m-0 text-sm"><slot name="title" /></h2>
      {/if}

      <slot name="breadcrumbs" />
    </div>

    <div class="flex h-full items-center gap-3">
      <slot name="addon" />

      <div
        class={cx('transition-transform duration-200', {
          'rotate-0': !open,
          'rotate-180': open,
        })}
      >
        <Icon name="chevron-down" />
      </div>
    </div>
  </button>

  {#if open}
    <div class="border border-t-0 border-medium p-4 text-sm">
      <slot name="content" />
    </div>
  {/if}
</div>
