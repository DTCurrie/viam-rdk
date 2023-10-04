<script lang="ts">
/* eslint-disable require-atomic-updates */

import * as THREE from 'three';
import { onMount, onDestroy } from 'svelte';

import {
  SlamClient,
  type ServiceError,
  MotionClient,
  commonApi,
  type Pose,
  type ResourceName,
} from '@viamrobotics/sdk';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import { filterSubtype } from '@/lib/resource';
import {
  notify,
  scheduleAsyncInterval,
  scheduleInterval,
  type IntervalCanceller,
} from '@viamrobotics/prime-core';
import { components } from '@/stores/resources';
import {
  Breadcrumbs,
  Button,
  IconButton,
  Label,
  Select,
  SliderInput,
  Switch,
  TextInput,
} from '@viamrobotics/prime-core';
import PCD from '@/components/pcd/pcd-view.svelte';
import Slam2D from './2d/index.svelte';
import { useRobotClient, useDisconnect } from '@/hooks/robot-client';
import type { SLAMOverrides } from '@/types/overrides';
import { createRequestLogger, createLogger } from '@/lib/logger';
import Collapse from '@/lib/components/collapse.svelte';
import { getErrorMessage } from '@/lib/error';

export let name: string;
export let overrides: SLAMOverrides | undefined;

const { robotClient, operations } = useRobotClient();
const logger = createLogger(name);

const refreshErrorMessage = 'Error refreshing map. The map shown may be stale.';

let cancel2dRefresh: IntervalCanceller;
let cancel3dRefresh: IntervalCanceller;
let cancelDurationInterval: IntervalCanceller;

let refreshErrorMessage2d: string | undefined;
let refreshErrorMessage3d: string | undefined;
let refresh2dRate = 'manual';
let refresh3dRate = 'manual';
let pointcloud: Uint8Array | undefined;
let pose: commonApi.Pose.AsObject | undefined;
let lastTimestamp = new Date();
let show2d = false;
let show3d = false;
let showAxes = true;
let destination: THREE.Vector2 | undefined;
let labelUnits = 'm';
let hasActiveSession = false;
let sessionId = '';
let mappingSessionEnded = false;
let sessionDuration = 0;
let newMapName = '';
let mapNameError = '';

$: motionClient = new MotionClient(
  $robotClient,
  name,
  createRequestLogger(name, 'motion request')
);

$: slamClient = new SlamClient(
  $robotClient,
  name,
  createRequestLogger(name, 'slam request')
);

$: loaded2d = pointcloud !== undefined && pose !== undefined;
$: moveClicked = $operations.find(({ op }) => op.method.includes('MoveOnMap'));
$: unitScale = labelUnits === 'm' ? 1 : 1000;

// get all resources which are bases
$: bases = filterSubtype($components, 'base');

// allowMove is only true if we have a base, there exists a destination and there is no in-flight MoveOnMap req
$: allowMove = bases.length === 1 && destination && !moveClicked;

const deleteDestinationMarker = () => (destination = undefined);

const startDurationTimer = (start: number) =>
  (cancelDurationInterval = scheduleInterval(() => {
    sessionDuration = Date.now() - start;
  }, 400));

const localizationMode = (mapTimestamp: Date | undefined) => {
  if (mapTimestamp === undefined) {
    return false;
  }

  return mapTimestamp === lastTimestamp;
};

const refresh2d = async () => {
  try {
    let nextPose;
    const mapTimestamp = await slamClient.getLatestMapInfo();

    /*
     * The map timestamp is compared to the last timestamp
     * to see if a change has been made to the pointcloud map.
     * A new call to getPointCloudMap is made if an update has occured.
     */
    if (overrides?.isCloudSlam && overrides?.getMappingSessionPCD) {
      const { map, pose } = await overrides.getMappingSessionPCD(sessionId);
      nextPose = pose;
      pointcloud = map;
    } else if (localizationMode(mapTimestamp)) {
      const { pose } = await slamClient.getPosition();
      nextPose = pose;
    } else {
      const map = await slamClient.getPointCloudMap();
      const { pose } = await slamClient.getPosition();
      pointcloud = map;
      nextPose = pose;
    }

    /*
     * The pose is returned in millimeters, but we need
     * to convert to meters to display on the frontend.
     */
    if (nextPose) {
      nextPose.x /= 1000;
      nextPose.y /= 1000;
      nextPose.z /= 1000;
    }

    pose = nextPose;

    if (mapTimestamp) {
      lastTimestamp = mapTimestamp;
    }
  } catch (error) {
    refreshErrorMessage2d = `${refreshErrorMessage} ${
      getErrorMessage(error) ?? error
    }`;
  }
};

const refresh3d = async () => {
  try {
    if (overrides?.isCloudSlam && overrides?.getMappingSessionPCD) {
      const { map } = await overrides.getMappingSessionPCD(sessionId);
      pointcloud = map;
    } else {
      const mapTimestamp = await slamClient.getLatestMapInfo();

      /*
       * The map timestamp is compared to the last timestamp
       * to see if a change has been made to the pointcloud map.
       * A new call to getPointCloudMap is made if an update has occured.
       */
      if (!localizationMode(mapTimestamp)) {
        pointcloud = await slamClient.getPointCloudMap();
      }
      if (mapTimestamp) {
        lastTimestamp = mapTimestamp;
      }
    }
  } catch (error) {
    refreshErrorMessage3d = `${refreshErrorMessage} ${
      getErrorMessage(error) ?? error
    }`;
  }
};

const updateSLAM2dRefreshFrequency = () => {
  cancel2dRefresh?.();
  refresh2d();

  refreshErrorMessage2d = undefined;

  if (refresh2dRate !== 'manual') {
    cancel2dRefresh = scheduleAsyncInterval(
      refresh2d,
      Number.parseFloat(refresh2dRate) * 1000
    );
  }
};

const updateSLAM3dRefreshFrequency = () => {
  cancel3dRefresh?.();
  refresh3d();

  refreshErrorMessage3d = undefined;

  if (refresh3dRate !== 'manual') {
    cancel3dRefresh = scheduleAsyncInterval(
      refresh3d,
      Number.parseFloat(refresh3dRate) * 1000
    );
  }
};

const toggle3dExpand = () => {
  show3d = !show3d;
  if (!show3d) {
    refresh3dRate = 'manual';
    return;
  }
  updateSLAM3dRefreshFrequency();
};

const toggle2dExpand = () => {
  show2d = !show2d;
  if (!show2d) {
    refresh2dRate = 'manual';
    return;
  }
  updateSLAM2dRefreshFrequency();
};

const refresh2dMap = () => {
  refresh2dRate = 'manual';
  updateSLAM2dRefreshFrequency();
};

const refresh3dMap = () => {
  refresh2dRate = 'manual';
  updateSLAM3dRefreshFrequency();
};

const handle2dRenderClick = (event: CustomEvent) => {
  destination = event.detail;
};

const handleUpdateDestX = (event: Event) => {
  destination ??= new THREE.Vector2();
  destination.x =
    Number.parseFloat((event.target as HTMLInputElement).value) *
    (labelUnits === 'mm' ? 0.001 : 1);
};

const handleUpdateDestY = (event: Event) => {
  destination ??= new THREE.Vector2();
  destination.y =
    Number.parseFloat((event.target as HTMLInputElement).value) *
    (labelUnits === 'mm' ? 0.001 : 1);
};

const baseCopyPosition = () => {
  copyToClipboard(
    JSON.stringify({
      x: pose?.x,
      y: pose?.y,
      z: pose?.z,
      ox: 0,
      oy: 0,
      oz: 1,
      th: pose?.theta,
    })
  );
};

const toggleAxes = () => {
  showAxes = !showAxes;
};

const getPosition = async () => {
  const { pose } = await slamClient.getPosition();
  return pose;
};

const moveOnMap = async (resourceName: string, x: number, y: number) => {
  // set pose in frame
  const lastPose = await getPosition();
  if (!lastPose) {
    logger.warn('no last pose returned from get position');
    return;
  }

  const destination: Pose = {
    ...lastPose,
    x: x * 1000,
    y: y * 1000,
    z: 0,
  };

  const componentName: ResourceName = {
    namespace: 'rdk',
    type: 'component',
    subtype: 'base',
    name: resourceName,
  };

  const slamServiceName: ResourceName = {
    namespace: 'rdk',
    type: 'service',
    subtype: 'slam',
    name,
  };

  // set extra as position-only constraint
  const extra = {
    motion_profile: 'position_only',
  };

  return motionClient.moveOnMap(
    destination,
    componentName,
    slamServiceName,
    extra
  );
};

const stopMoveOnMap = async () => {
  const match = $operations.find(({ op }) => op.method.includes('MoveOnMap'));

  if (!match) {
    throw new Error('Operation not found!');
  }

  return $robotClient.cancelOperation(match.op.id);
};

const handleMoveClick = async () => {
  try {
    await moveOnMap(bases[0]!.name, destination!.x, destination!.y);
  } catch (error) {
    notify.danger((error as ServiceError).message);
  }
};

const handleStopMoveClick = async () => {
  try {
    await stopMoveOnMap();
  } catch (error) {
    notify.danger((error as ServiceError).message);
  }
};

const toggleExpand = (open: boolean) => {
  if (open) {
    toggle2dExpand();
  } else {
    cancel2dRefresh?.();
    cancel3dRefresh?.();
  }
};

const startMappingIntervals = (start: number) => {
  updateSLAM2dRefreshFrequency();
  if (show3d) {
    updateSLAM3dRefreshFrequency();
  }
  startDurationTimer(start);
};

const handleStartMapping = async () => {
  if (overrides) {
    // if input error do not start mapping
    if (mapNameError) {
      return;
    }

    // error may not be present if user has not yet typed in input
    const mapName = overrides.mappingDetails.name || newMapName;
    if (!mapName) {
      mapNameError = 'Please enter a name for this map';
      return;
    }

    hasActiveSession = true;
    sessionId = await overrides.startMappingSession(mapName);
    startMappingIntervals(Date.now());
  }
};

const clearRefresh = () => {
  cancel2dRefresh?.();
  cancel3dRefresh?.();
};

const handleEndMapping = () => {
  hasActiveSession = false;
  mappingSessionEnded = true;
  clearRefresh();
  cancelDurationInterval();
};

const formatDisplayTime = (time: number) => `${time < 10 ? `0${time}` : time}`;

const formatDuration = (milliseconds: number) => {
  let seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return `${formatDisplayTime(hours)}:${formatDisplayTime(
    minutes
  )}:${formatDisplayTime(seconds)}`;
};

const handleViewMap = () => {
  overrides?.viewMap(sessionId);
};

const handleMapNameChange = (event: Event) => {
  newMapName = (event.target as HTMLInputElement).value;
  mapNameError = overrides?.validateMapName(newMapName) || '';
};

useDisconnect(clearRefresh);

onMount(async () => {
  if (overrides && overrides.isCloudSlam) {
    const activeSession = await overrides.getActiveMappingSession();

    if (activeSession) {
      hasActiveSession = true;
      sessionId = activeSession.id;
      const startMilliseconds =
        (activeSession.timeCloudRunJobStarted?.seconds || 0) * 1000;
      startMappingIntervals(startMilliseconds);
    }
  }
});

onDestroy(() => {
  cancelDurationInterval();
});
</script>

<Collapse on:toggle={({ detail }) => toggleExpand(detail)}>
  <svelte:fragment slot="title">{name}</svelte:fragment>

  <Breadcrumbs
    slot="breadcrumbs"
    crumbs={['slam']}
  />

  <Button
    slot="addon"
    variant="danger"
    icon="stop-circle-outline"
    disabled={!moveClicked}
    on:click={handleStopMoveClick}
    on:keydown={handleStopMoveClick}
  >
    Stop
  </Button>

  <svelte:fragment slot="content">
    <div class="flex min-w-fit flex-col gap-4 p-4 pr-0">
      <div class="pb-4 flex flex-col gap-6">
        {#if overrides?.isCloudSlam && overrides?.mappingDetails}
          <header class="flex flex-col text-xs justify-between gap-3">
            <div class="flex flex-col">
              <span class="font-bold text-gray-800">Mapping mode</span>
              <span class="capitalize text-subtle-2"
                >{overrides.mappingDetails.mode}</span
              >
            </div>
            <div class="flex gap-8">
              {#if overrides.mappingDetails.name}
                <div class="flex flex-col">
                  <span class="font-bold text-gray-800">Map name</span>
                  <span class="capitalize text-subtle-2"
                    >{overrides.mappingDetails.name}</span
                  >
                </div>
              {/if}
              {#if overrides.mappingDetails.version}
                <div class="flex flex-col">
                  <span class="font-bold text-gray-800">Version</span>
                  <span class="capitalize text-subtle-2"
                    >{overrides.mappingDetails.version}</span
                  >
                </div>
              {/if}
            </div>
            {#if !overrides.mappingDetails.name}
              <Label
                >Map name
                <TextInput
                  value={newMapName}
                  state={mapNameError ? 'error' : ''}
                  message={mapNameError}
                  on:input={handleMapNameChange}
                />
              </Label>
            {/if}
          </header>
        {/if}
        <div class="flex items-end gap-2 min-w-fit">
          <div class="relative">
            <Label>Refresh frequency</Label>
            <Select
              bind:value={refresh2dRate}
              on:input={updateSLAM2dRefreshFrequency}
            >
              <option value="manual"> Manual refresh </option>
              <option value="30"> Every 30 seconds </option>
              <option value="10"> Every 10 seconds </option>
              <option value="5"> Every 5 seconds </option>
              <option value="1"> Every second </option>
            </Select>
          </div>
          <Button
            icon="refresh"
            on:click={refresh2dMap}
            on:keydown={refresh2dMap}
          >
            Refresh
          </Button>
        </div>
        {#if overrides && overrides.isCloudSlam}
          <div class="flex">
            {#if hasActiveSession || mappingSessionEnded}
              <div class="flex justify-between w-full items-center">
                <div class="flex items-center text-xs gap-1">
                  <div
                    class="border-success-border bg-success-bg text-success-fg px-2 py-1 rounded-full"
                    class:border-medium={mappingSessionEnded}
                    class:bg-3={mappingSessionEnded}
                    class:text-default={mappingSessionEnded}
                  >
                    <span>{mappingSessionEnded ? 'Saved' : 'Running'}</span>
                  </div>
                  <span class="text-subtle-2">
                    {formatDuration(sessionDuration)}
                  </span>
                </div>
                {#if hasActiveSession}
                  <Button on:click={handleEndMapping}>End session</Button>
                {/if}
                {#if mappingSessionEnded}
                  <Button
                    icon="open-in-new"
                    on:click={handleViewMap}
                  >
                    View map
                  </Button>
                {/if}
              </div>
            {:else}
              <Button
                on:click={handleStartMapping}
                variant="dark"
              >
                Start session
              </Button>
            {/if}
          </div>
        {:else}
          <div>
            <hr class="my-4 border-t border-medium" />
            <div class="flex gap-2 mb-1">
              <p class="font-bold text-gray-800">End position</p>
              <button
                class="text-xs hover:underline"
                on:click={() => (labelUnits = labelUnits === 'mm' ? 'm' : 'mm')}
              >
                ({labelUnits})
              </button>
            </div>
            <div class="flex flex-row items-end gap-2 pb-2">
              <Label>
                x
                <SliderInput
                  value={Number(
                    destination ? (destination.x * unitScale).toFixed(5) : ''
                  )}
                  step={labelUnits === 'mm' ? 10 : 1}
                  on:input={(event) => handleUpdateDestX(event)}
                />
              </Label>
              <Label>
                y
                <SliderInput
                  value={Number(
                    destination ? (destination.y * unitScale).toFixed(5) : ''
                  )}
                  step={labelUnits === 'mm' ? 10 : 1}
                  on:input={(event) => handleUpdateDestY(event)}
                />
              </Label>

              <Button
                cx="pt-1 fill-white"
                variant="success"
                icon="play-circle-outline"
                disabled={allowMove}
                on:click={handleMoveClick}
                on:keydown={handleMoveClick}
              >
                Move
              </Button>
              <IconButton
                label="Delete destination marker"
                variant="danger"
                icon="trash-can-outline"
                on:click={deleteDestinationMarker}
                on:keydown={deleteDestinationMarker}
              />
            </div>
          </div>
        {/if}
        <Label cx="pt-2">
          Show grid
          <Switch
            value={showAxes ? 'on' : 'off'}
            on:input={toggleAxes}
          />
        </Label>
      </div>
    </div>
    <div class="gap-4x border-border-1 w-full justify-start sm:border-l">
      {#if refreshErrorMessage2d && show2d}
        <div class="border-l-4 border-red-500 bg-gray-100 px-4 py-3">
          {refreshErrorMessage2d}
        </div>
      {/if}

      {#if loaded2d && show2d}
        <div>
          <div class="flex flex-row pl-5 py-2 border-b border-b-light">
            <div class="flex flex-col gap-0.5">
              <div class="flex gap-2">
                <p class="text-xs">Current position</p>
                <Button
                  variant="ghost"
                  on:click={() =>
                    (labelUnits = labelUnits === 'mm' ? 'm' : 'mm')}
                >
                  ({labelUnits})
                </Button>
              </div>

              {#if pose}
                <div class="flex flex-row items-center">
                  <p class="items-end pr-1.5 text-xs text-gray-500">x</p>
                  <p>{(pose.x * unitScale).toFixed(1)}</p>

                  <p class="pl-6 pr-1.5 text-xs text-gray-500">y</p>
                  <p>{(pose.y * unitScale).toFixed(1)}</p>

                  <p class="pl-6 pr-1.5 text-xs text-gray-500">z</p>
                  <p>{(pose.z * unitScale).toFixed(1)}</p>
                </div>
              {/if}
            </div>
            <div class="flex flex-col gap-0.5 pl-10">
              <p class="text-xs">Current orientation</p>

              {#if pose}
                <div class="flex flex-row items-center">
                  <p class="pr-1.5 text-xs text-gray-500">o<sub>x</sub></p>
                  <p>{pose.oX.toFixed(1)}</p>

                  <p class="pl-6 pr-1.5 text-xs text-gray-500">o<sub>y</sub></p>
                  <p>{pose.oY.toFixed(1)}</p>

                  <p class="pl-6 pr-1.5 text-xs text-gray-500">o<sub>z</sub></p>
                  <p>{pose.oZ.toFixed(1)}</p>

                  <p class="pl-6 pr-1.5 text-xs text-gray-500">&theta;</p>
                  <p>{pose.theta.toFixed(1)}</p>
                </div>
              {/if}
            </div>

            <IconButton
              label="Copy pose to clipboard"
              class="pl-4 pt-2"
              icon="content-copy"
              on:click={baseCopyPosition}
              on:keydown={baseCopyPosition}
            ></IconButton>
          </div>

          <Slam2D
            {pointcloud}
            {pose}
            {destination}
            helpers={showAxes}
            on:click={handle2dRenderClick}
          />
        </div>
      {/if}
    </div>

    <Label>
      View SLAM map (3D)
      <Switch
        slot="input"
        on={show3d}
        on:input={toggle3dExpand}
      />
    </Label>

    {#if refreshErrorMessage3d && show3d}
      <div class="border-l-4 border-red-500 bg-gray-100 px-4 py-3">
        {refreshErrorMessage3d}
      </div>
    {/if}

    {#if show3d}
      <div class="flex items-end gap-2">
        <div class="w-56 mt-3">
          <p class="mb-1 text-xs text-gray-500"></p>
          <div class="relative">
            <Label>
              Refresh frequency
              <Select
                slot="input"
                bind:value={refresh3dRate}
                on:change={updateSLAM3dRefreshFrequency}
              >
                <option value="manual"> Manual refresh </option>
                <option value="30"> Every 30 seconds </option>
                <option value="10"> Every 10 seconds </option>
                <option value="5"> Every 5 seconds </option>
                <option value="1"> Every second </option>
              </Select>
            </Label>
          </div>
        </div>

        <Button
          icon="refresh"
          on:click={refresh3dMap}
          on:keydown={refresh3dMap}
        >
          Refresh
        </Button>
      </div>

      <PCD {pointcloud} />
    {/if}
  </svelte:fragment>
</Collapse>
