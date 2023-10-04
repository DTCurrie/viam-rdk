<script lang="ts">
import type { commonApi } from '@viamrobotics/sdk';
import Camera from './camera.svelte';
import PCD from '../pcd/index.svelte';
import Collapse from '@/lib/components/collapse.svelte';
import { selectedMap } from '@/lib/camera-state';
import {
  Breadcrumbs,
  IconButton,
  Label,
  Select,
  Switch,
} from '@viamrobotics/prime-core';

export let resources: commonApi.ResourceName.AsObject[];

$: openCameras = {} as Record<string, boolean>;
$: refreshFrequency = {} as Record<string, keyof typeof selectedMap>;
$: triggerRefresh = false;

const setupCamera = (name: string, on: boolean) => {
  if (on && !refreshFrequency[name]) {
    refreshFrequency[name] = 'Live';
  }
};

const handleRefreshInput = (event: Event, name: string) => {
  refreshFrequency[name] = (event.target as HTMLSelectElement)
    .value as keyof typeof selectedMap;
};
</script>

{#each resources as { name } (name)}
  <Collapse>
    <svelte:fragment slot="title">{name}</svelte:fragment>
    <Breadcrumbs
      slot="breadcrumbs"
      crumbs={['camera']}
    />

    <svelte:fragment slot="content">
      <div class="flex flex-col gap-2">
        <Label>
          View {name}
          <Switch
            slot="input"
            aria-label={openCameras[name]
              ? `Hide Camera: ${name}`
              : `View Camera: ${name}`}
            bind:on={openCameras[name]}
            on:toggle={({ detail }) => setupCamera(name, detail)}
          />
        </Label>

        {#if openCameras[name]}
          <div class="flex flex-wrap items-end gap-2">
            <Label>
              Refresh frequency
              <div
                slot="input"
                class="flex gap-2"
              >
                <Select
                  bind:value={refreshFrequency[name]}
                  on:change={(event) => handleRefreshInput(event, name)}
                >
                  {#each Object.keys(selectedMap) as frequency}
                    <option>{frequency}</option>
                  {/each}
                </Select>
                {#if refreshFrequency[name] !== 'Live'}
                  <IconButton
                    icon="refresh"
                    label="Refresh"
                    on:click={() => {
                      triggerRefresh = !triggerRefresh;
                    }}
                  />
                {/if}
              </div>
            </Label>
          </div>
        {/if}

        {#if openCameras[name]}
          <Camera
            cameraName={name}
            showExportScreenshot={true}
            refreshRate={refreshFrequency[name]}
          />
        {/if}

        <PCD cameraName={name} />
      </div>
    </svelte:fragment>
  </Collapse>
{/each}
