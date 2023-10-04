<script
  lang="ts"
  context="module"
>
// TODO: Export this interface from the TS-SDK so it can be used here
export interface JointPositions {
  valuesList: number[];
}

const DEFAULT_POSE: Pose = {
  x: 0,
  y: 0,
  z: 0,
  oX: 0,
  oY: 0,
  oZ: 0,
  theta: 0,
};
</script>

<script lang="ts">
import { ArmClient, type Pose } from '@viamrobotics/sdk';
import round from 'lodash/round';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
import { displayError } from '@/lib/error';
import Collapse from '@/lib/components/collapse.svelte';
import { useRobotClient } from '@/hooks/robot-client';
import {
  scheduleAsyncInterval,
  type IntervalCanceller,
  Breadcrumbs,
  Button,
  IconButton,
  Label,
  NumericInput,
} from '@viamrobotics/prime-core';
import { createRequestLogger, createLogger } from '@/lib/logger';
import IncrementControls from './increment-controls.svelte';

export let name: string;

const { robotClient } = useRobotClient();
const logger = createLogger(name);

let cancelStatus: IntervalCanceller;

$: isEditing = false;
$: isMoving = false;
$: endPosition = {} as Pose;
$: jointPositions = { valuesList: [] } as JointPositions;

$: endPositionPieces = Object.entries(endPosition).map(([position, value]) => [
  position,
  round(value, 2),
]) as [keyof Pose, number][];

$: jointPositionPieces = jointPositions.valuesList.map((value, joint) => ({
  joint,
  value: round(value ?? 0, 2),
})) ?? [{ joint: 0, value: 100 }];

$: editedEndPositions = [] as {
  position: keyof Pose;
  value: number;
}[];

$: editedJointPieces = [] as { joint: number; value: number }[];

const armClient = new ArmClient(
  $robotClient,
  name,
  createRequestLogger(name, 'arm request')
);

const stop = async (event: Event) => {
  event.stopPropagation();

  try {
    await armClient.stop();
  } catch (error) {
    displayError(error);
  }
};

const moveToPosition = async () => {
  const pieces = [...editedEndPositions];
  const next: Pose = { ...DEFAULT_POSE };

  for (const { position, value } of pieces) {
    next[position] = Number(value);
  }

  try {
    await armClient.moveToPosition(next);
    endPosition = next;
  } catch (error) {
    displayError(error);
  }

  isEditing = false;
};

const moveToJointPositions = async () => {
  const next = [...jointPositions.valuesList];
  const pieces = [...editedJointPieces];

  for (const { joint, value } of pieces) {
    next[joint] = value;
  }

  try {
    await armClient.moveToJointPositions(next);
    jointPositions = { valuesList: next };
  } catch (error) {
    displayError(error);
  }

  isEditing = false;
};

const incrementPosition = async (field: string, amount: number) => {
  const key = field as keyof Pose;
  const next: Pose = { ...DEFAULT_POSE };
  const adjustedAmount =
    key[0] === 'o' || key[0] === 'O' ? amount / 100 : amount;

  for (const [position, value] of endPositionPieces) {
    next[position] = Number(value);
  }

  next[key] += adjustedAmount;

  try {
    await armClient.moveToPosition(next);
    endPosition = next;
  } catch (error) {
    displayError(error);
  }
};

const incrementJointPosition = async (field: string, amount: number) => {
  const next = [...jointPositions.valuesList];
  next[Number(field)] += amount;

  try {
    await armClient.moveToJointPositions(next);
    jointPositions = { valuesList: next };
  } catch (error) {
    displayError(error);
  }
};

const moveJointPositionsToHome = async () => {
  const next = [...jointPositions.valuesList];

  for (let i = 0; i < next.length; i += 1) {
    next[i] = 0;
  }

  try {
    await armClient.moveToJointPositions(next);
    jointPositions = { valuesList: next };
  } catch (error) {
    displayError(error);
  }
};

const armModifyAll = () => (isEditing = true);
const armCopyPosition = () => copyToClipboard(JSON.stringify(endPosition));

const armCopyJoints = () => {
  const jointMap: Record<string, number> = {};
  for (const { joint, value } of jointPositionPieces) {
    jointMap[joint] = value;
  }

  copyToClipboard(JSON.stringify(jointMap));
};

const getStatus = async () => {
  try {
    isMoving = await armClient.isMoving();
    endPosition = await armClient.getEndPosition();
    jointPositions = (await armClient.getJointPositions()).toObject();
  } catch (error) {
    logger.error(`error getting ${name}'s arm status`, error);
  }
};

const handleToggle = async ({ detail }: CustomEvent<boolean>) => {
  if (detail) {
    await getStatus();
    cancelStatus = scheduleAsyncInterval(getStatus, 1000);
  } else {
    cancelStatus();
  }
};
</script>

<Collapse on:toggle={handleToggle}>
  <svelte:fragment slot="title">{name}</svelte:fragment>
  <Breadcrumbs
    slot="breadcrumbs"
    crumbs={['arm']}
  />

  <Button
    slot="addon"
    variant="danger"
    icon="stop-circle-outline"
    on:click={stop}
  >
    Stop
  </Button>

  <svelte:fragment slot="content">
    <div class="flex flex-col items-center lg:flex-row justify-evenly">
      <div class="flex flex-col gap-1 pb-1">
        <h3 class="mb-2 font-bold flex items-center gap-2">
          End position (mms)
          <IconButton
            label="Copy to clipboard"
            icon="content-copy"
            on:click={armCopyPosition}
          />
        </h3>

        {#if isEditing}
          {#each editedEndPositions as { position, value } (position)}
            <Label position="left">
              <span class="w-12">{position}</span>
              <NumericInput
                slot="input"
                bind:value
              />
            </Label>
          {/each}
          <Button
            icon="play-circle-outline"
            on:click={moveToPosition}
          >
            Go
          </Button>
        {:else}
          {#each endPositionPieces as [piece, value] (piece)}
            <IncrementControls
              label={piece}
              {value}
              increment={incrementPosition}
            />
          {/each}
        {/if}
      </div>

      <div class="flex flex-col gap-1 pb-1">
        <h3 class="mb-2 font-bold flex items-center gap-2">
          Joints (degrees)
          <IconButton
            label="Copy to clipboard"
            icon="content-copy"
            on:click={armCopyJoints}
          />
        </h3>

        {#if isEditing}
          {#each editedJointPieces as { joint, value } (joint)}
            <Label position="left">
              <span class="w-12">Joint {joint}</span>
              <NumericInput
                slot="input"
                bind:value
              />
            </Label>
          {/each}
          <Button
            icon="play-circle-outline"
            on:click={moveToJointPositions}
          >
            Go
          </Button>
        {:else}
          {#each jointPositionPieces as { joint, value } (joint)}
            <IncrementControls
              title="Joint"
              label={`${joint}`}
              {value}
              increment={incrementJointPosition}
            />
          {/each}
        {/if}
      </div>
    </div>
    {#if isEditing}
      <Button
        on:click={() => {
          isEditing = false;
        }}
      >
        Cancel
      </Button>
    {:else}
      <Button on:click={armModifyAll}>Modify all</Button>
      <Button on:click={moveJointPositionsToHome}>Go home</Button>
    {/if}
  </svelte:fragment>
</Collapse>
