<script lang="ts">
import { Button } from '@viamrobotics/prime-core';

export let title: string | undefined = undefined;
export let label: string;
export let value: number;
export let increment: (field: string, by: number) => Promise<void>;
</script>

<div class="flex gap-1">
  <h4 class="self-center justify-self-end min-w-[4rem] text-right pr-2">
    {title ? `${title} ${label}` : label}
  </h4>
  <Button on:click={() => increment(label, -10)}>-10</Button>
  <Button on:click={() => increment(label, -1)}>-1</Button>
  <p class="place-self-center min-w-[5rem] text-xs flex place-content-center">
    {value.toFixed(2)}
  </p>
  <Button on:click={() => increment(label, 1)}>+1</Button>
  <Button on:click={() => increment(label, 10)}>+10</Button>
</div>
