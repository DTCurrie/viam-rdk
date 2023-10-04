<!-- 
  @component
  This component allows us to render a Collapse with its slotted
  children, due to limitations with rendering slots using
  `@testing-library`.
  See:
  - https://sveltesociety.dev/recipes/testing-and-debugging/unit-testing-svelte-component
  - https://github.com/testing-library/svelte-testing-library/issues/48
 -->

<script lang="ts">
import { Badge, Breadcrumbs } from '@viamrobotics/prime-core';
import Collapse from '../collapse.svelte';
</script>

<Collapse>
  <svelte:fragment slot="title">Test Collapse</svelte:fragment>
  <Breadcrumbs
    slot="breadcrumbs"
    crumbs={['Howdy', 'Hey']}
  />
  <Badge
    slot="addon"
    label="Busy"
  />
  <div
    slot="content"
    class="border-light border border-t-0 p-4 text-sm"
  >
    This is the content.
  </div>
</Collapse>
