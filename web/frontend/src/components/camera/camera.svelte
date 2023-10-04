<script lang="ts">
import { onMount } from 'svelte';
import { displayError } from '@/lib/error';
import { CameraClient } from '@viamrobotics/sdk';
import { selectedMap } from '@/lib/camera-state';
import { useRobotClient, useDisconnect } from '@/hooks/robot-client';
import {
  scheduleAsyncInterval,
  type IntervalCanceller,
  Button,
} from '@viamrobotics/prime-core';

export let cameraName: string;
export let showExportScreenshot: boolean;
export let refreshRate: keyof typeof selectedMap | undefined;
export let triggerRefresh = false;

const { robotClient, streamManager } = useRobotClient();
const { stream, setSrc, remove, add } = $streamManager.getStream(
  cameraName,
  () => (videoEl.srcObject = $stream)
);

let imgEl: HTMLImageElement;
let videoEl: HTMLVideoElement;

$: shouldBeLive = refreshRate === 'Live';
$: isLive = false;

let cancelFrameInterval: IntervalCanceller;

const viewCameraFrame = async (time: number) => {
  cancelFrameInterval();
  await setSrc(imgEl);

  if (time > 0) {
    cancelFrameInterval = scheduleAsyncInterval(
      () => setSrc(imgEl),
      Number(time) * 1000
    );
  }
};

const updateCameraRefreshRate = () => {
  if (refreshRate !== 'Live') {
    viewCameraFrame(selectedMap[refreshRate as keyof typeof selectedMap]);
  }
};

const exportScreenshot = async () => {
  try {
    const blob = await new CameraClient($robotClient, cameraName).renderFrame(
      'image/jpeg'
    );

    window.open(URL.createObjectURL(blob), '_blank');
  } catch (error) {
    displayError(error);
    return;
  }
};

onMount(() => {
  videoEl.srcObject = $stream;
});

useDisconnect(async () => {
  if (isLive) {
    await remove();
  }

  isLive = false;
  cancelFrameInterval();
});

// on refreshRate change update camera and manage live connections
$: (async () => {
  if (isLive && !shouldBeLive) {
    isLive = false;
    await remove();
  }

  if (isLive === false && shouldBeLive) {
    isLive = true;
    await add();
  }

  updateCameraRefreshRate();
})();

// Refresh camera when the trigger changes
let lastTriggerRefresh = triggerRefresh;
$: if (lastTriggerRefresh !== triggerRefresh) {
  lastTriggerRefresh = triggerRefresh;
  updateCameraRefreshRate();
}
</script>

<div class="flex flex-col gap-2">
  {#if showExportScreenshot}
    <Button
      cx="mb-4"
      aria-label={`View camera: ${cameraName}`}
      icon="camera-outline"
      on:click={exportScreenshot}
    >
      Export screenshot
    </Button>
  {/if}

  <div class="max-w-screen-md">
    {#if shouldBeLive}
      <video
        bind:this={videoEl}
        muted
        autoplay
        controls={false}
        playsinline
        aria-label={`${cameraName} stream`}
        class="clear-both h-fit transition-all duration-300 ease-in-out"
      />
    {:else}
      <img
        bind:this={imgEl}
        alt="Camera stream"
        aria-label={`${cameraName} stream`}
      />
    {/if}
  </div>
</div>
