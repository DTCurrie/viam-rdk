<script lang="ts">
import { StreamClient } from '@viamrobotics/sdk';
import { displayError } from '@/lib/error';
import Collapse from '@/lib/components/collapse.svelte';
import { useRobotClient, useDisconnect } from '@/hooks/robot-client';
import { createRequestLogger } from '@/lib/logger';
import { Breadcrumbs, Label, Switch } from '@viamrobotics/prime-core';

export let name: string;

const { robotClient } = useRobotClient();

let audio: HTMLAudioElement;
let isOn = false;

$: streamClient = new StreamClient(
  $robotClient,
  createRequestLogger(name, 'stream request')
);

const handleTrack = (event: unknown) => {
  const [eventStream] = (event as { streams: MediaStream[] }).streams;

  if (!eventStream) {
    throw new Error('expected event stream to exist');
  }

  if (eventStream.id !== name) {
    return;
  }

  audio.srcObject = eventStream;
};

const toggleExpand = async () => {
  isOn = !isOn;

  streamClient.on('track', handleTrack);

  if (isOn) {
    try {
      await streamClient.add(name);
    } catch (error) {
      displayError(error);
    }
  } else {
    try {
      await streamClient.remove(name);
    } catch (error) {
      displayError(error);
    }
  }
};

useDisconnect(() => {
  streamClient.off('track', handleTrack);
});
</script>

<Collapse>
  <svelte:fragment slot="title">{name}</svelte:fragment>
  <Breadcrumbs
    slot="breadcrumbs"
    crumbs={['audio_input']}
  />

  <svelte:fragment slot="content">
    <div class="flex items-center gap-2">
      <Label>
        Listen
        <Switch
          slot="input"
          value={isOn ? 'on' : 'off'}
          on:input={toggleExpand}
        />
      </Label>
    </div>

    {#if isOn}
      <audio
        class="py-2"
        controls
        autoplay
        bind:this={audio}
      />
    {/if}
  </svelte:fragment>
</Collapse>
