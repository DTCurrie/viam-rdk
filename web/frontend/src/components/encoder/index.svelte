<script lang="ts">
import {
  EncoderClient,
  EncoderPositionType,
  encoderApi,
} from '@viamrobotics/sdk';
import { displayError } from '@/lib/error';
import { scheduleAsyncInterval } from '@viamrobotics/prime-core';
import {
  Breadcrumbs,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeaderCell,
  TableRow,
} from '@viamrobotics/prime-core';
import { useRobotClient, useDisconnect } from '@/hooks/robot-client';
import { createLogger } from '@/lib/logger';
import Collapse from '@/lib/components/collapse.svelte';

export let name: string;

const { robotClient } = useRobotClient();
const log = createLogger(name);

$: client = new EncoderClient($robotClient, name, {
  requestLogger: (req) => log.debug('sdk request', req),
});

let properties: encoderApi.GetPropertiesResponse.AsObject | undefined;
let positionTicks: readonly [number, 0 | 1 | 2] | undefined;
let positionDegrees: readonly [number, 0 | 1 | 2] | undefined;

let cancelInterval: (() => void) | undefined;

const getProperties = async (extra = {}) => {
  const response = await client.getProperties(extra);
  return response;
};

const getPosition = async (
  positionType?: EncoderPositionType | undefined,
  extra = {}
) => {
  const response = await client.getPosition(positionType, extra);
  return response;
};

const getPositionDegrees = async (extra = {}) => {
  return getPosition(2, extra);
};

const resetPosition = async (extra = {}) => {
  await client.resetPosition(extra);
};

const refresh = async () => {
  try {
    const results = await Promise.all([
      getPosition(),
      properties?.angleDegreesSupported ? getPositionDegrees() : undefined,
    ] as const);

    positionTicks = results[0];
    positionDegrees = results[1];
  } catch (error) {
    displayError(error);
  }
};

const handleResetClick = async () => {
  try {
    await resetPosition();
  } catch (error) {
    displayError(error);
  }
};

const handleToggle = async (open: boolean) => {
  if (open) {
    try {
      properties = await getProperties();
      refresh();
      cancelInterval = scheduleAsyncInterval(refresh, 500);
    } catch (error) {
      displayError(error);
    }
  } else {
    cancelInterval?.();
  }
};

useDisconnect(() => cancelInterval?.());
</script>

<Collapse on:toggle={({ detail }) => handleToggle(detail)}>
  <svelte:fragment slot="title">{name}</svelte:fragment>

  <Breadcrumbs
    slot="breadcrumbs"
    crumbs={['encoder']}
  />

  <div
    slot="content"
    class="overflow-auto border border-t-0 border-medium p-4 text-left text-sm"
  >
    <Table>
      <TableBody>
        {#if properties?.ticksCountSupported || (!properties?.ticksCountSupported && !properties?.angleDegreesSupported)}
          <TableRow>
            <TableHeaderCell>Count</TableHeaderCell>
            <TableCell>
              {positionTicks?.[0].toFixed(2)}
            </TableCell>
          </TableRow>
        {/if}

        {#if properties?.angleDegreesSupported || (!properties?.ticksCountSupported && !properties?.angleDegreesSupported)}
          <TableRow>
            <TableHeaderCell>Angle (degrees)</TableHeaderCell>
            <TableCell>
              {positionDegrees?.[0].toFixed(2)}
            </TableCell>
          </TableRow>
        {/if}
      </TableBody>
    </Table>

    <div class="mt-2 flex gap-2">
      <Button
        width="full"
        on:click={handleResetClick}
      >
        Reset
      </Button>
    </div>
  </div>
</Collapse>
