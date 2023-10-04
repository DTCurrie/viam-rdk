<script lang="ts">
import { onMount } from 'svelte';
import { Timestamp } from 'google-protobuf/google/protobuf/timestamp_pb';
import {
  inputControllerApi as InputController,
  type ServiceError,
} from '@viamrobotics/sdk';
import Collapse from '@/lib/components/collapse.svelte';
import { useRobotClient, useDisconnect } from '@/hooks/robot-client';
import {
  Badge,
  Breadcrumbs,
  Label,
  Switch,
  notify,
} from '@viamrobotics/prime-core';
import { createLogger } from '@/lib/logger';
import { TriggerEventResponse } from '@viamrobotics/sdk/dist/gen/component/inputcontroller/v1/input_controller_pb';
import { getErrorMessage } from '@/lib/error';

export let name: string;

const { robotClient } = useRobotClient();
const logger = createLogger(name);

const curStates: Record<string, number> = {
  X: Number.NaN,
  Y: Number.NaN,
  RX: Number.NaN,
  RY: Number.NaN,
  Z: Number.NaN,
  RZ: Number.NaN,
  Hat0X: Number.NaN,
  Hat0Y: Number.NaN,
  South: Number.NaN,
  East: Number.NaN,
  West: Number.NaN,
  North: Number.NaN,
  LT: Number.NaN,
  RT: Number.NaN,
  LThumb: Number.NaN,
  RThumb: Number.NaN,
  Select: Number.NaN,
  Start: Number.NaN,
  Menu: Number.NaN,
};

let gamepadIdx: number | null = null;
let enabled = false;
let handle = -1;
let prevStates: Record<keyof typeof curStates, number> = {};
let lastError = Date.now();
let lastTimestamp = Timestamp.fromDate(new Date());

$: gamepad = gamepadIdx === null ? null : navigator.getGamepads()[gamepadIdx];
$: connected = false;

const triggerEvent = (newEvent: InputController.Event) => {
  if (!enabled) {
    return;
  }

  const req = new InputController.TriggerEventRequest();
  req.setController(name);
  req.setEvent(newEvent);
  logger.debug(`${name} input_controller request`, req);

  return new Promise<TriggerEventResponse | ServiceError>(() => {
    $robotClient.inputControllerService.triggerEvent(
      req,
      (error: ServiceError | null, res) => {
        if (error) {
          return error;
        }

        return res;
      }
    );
  });
};

const nextTimestamp = () => {
  let now = Timestamp.fromDate(new Date());
  const nowSeconds = now.getSeconds();
  const nowNanos = now.getNanos();
  const lastSeconds = lastTimestamp.getSeconds();
  const lastNanos = lastTimestamp.getNanos();
  const isSameSeconds = nowSeconds === lastSeconds;

  if (lastSeconds > nowSeconds || (isSameSeconds && lastNanos > nowNanos)) {
    now = lastTimestamp;
  }

  if (isSameSeconds && nowNanos === lastNanos) {
    now.setNanos(nowNanos + 1);
  }

  lastTimestamp = now;
  return now;
};

const connectEvent = async (connect: boolean) => {
  if ((connect && !gamepad?.connected) || (!connect && !connected)) {
    return;
  }

  const nowTS = nextTimestamp();
  try {
    await Promise.all(
      Object.keys(curStates).map((ctrl) => {
        const newEvent = new InputController.Event();
        nowTS.setNanos(nowTS.getNanos() + 1);
        newEvent.setTime(nowTS);
        newEvent.setEvent(connect ? 'Connect' : 'Disconnect');
        newEvent.setValue(0);

        if (/X|Y|Z$/u.test(ctrl)) {
          newEvent.setControl(`Absolute${ctrl}`);
        } else {
          newEvent.setControl(`Button${ctrl}`);
        }

        return triggerEvent(newEvent);
      })
    );
  } catch (error) {
    const now = Date.now();
    if (now - lastError > 1000) {
      lastError = now;

      logger.error(`Error triggering connect event for gamepad ${name}`, {
        connect,
        error,
      });

      notify.danger(
        getErrorMessage(error) ??
          `Could not trigger connect event for gamepad ${name}.`
      );
    }
  } finally {
    lastTimestamp = nowTS;
  }
};

const disconnect = async () => {
  for (const key of Object.keys(curStates)) {
    curStates[key] = Number.NaN;
  }

  if (connected) {
    try {
      await connectEvent(false);
      connected = false;
    } catch (error) {
      logger.error(`Error disconnecting gamepad ${name}`, {
        error,
      });

      notify.danger(
        getErrorMessage(error) ?? `Could not disconnet gamepad ${name}.`
      );
    }
  }
};

const processEvents = async () => {
  if (!connected) {
    await connectEvent(true);
    connected = true;
  }

  const nowTS = nextTimestamp();

  try {
    await Promise.all(
      Object.entries(curStates)
        .filter(
          ([key, value]) =>
            value !== prevStates[key] &&
            Number.isNaN(value) &&
            Number.isNaN(prevStates[key])
        )
        .map(([key, value]) => {
          const newEvent = new InputController.Event();
          nowTS.setNanos(nowTS.getNanos() + 1);
          newEvent.setTime(nowTS);

          if (/X|Y|Z$/u.test(key)) {
            newEvent.setControl(`Absolute${key}`);
            newEvent.setEvent('PositionChangeAbs');
          } else {
            newEvent.setControl(`Button${key}`);
            newEvent.setEvent(value ? 'ButtonPress' : 'ButtonRelease');
          }

          if (Number.isNaN(value)) {
            newEvent.setEvent('Disconnect');
            newEvent.setValue(0);
          } else {
            newEvent.setValue(value);
          }

          return triggerEvent(newEvent);
        })
    );
  } finally {
    lastTimestamp = nowTS;
  }
};

const checkVal = (val?: number): number => {
  if (!val && val !== 0) {
    return Number.NaN;
  }
  return val;
};

const tick = async () => {
  const gamepad = gamepad;
  if (!gamepad || !gamepad.connected) {
    if (enabled) {
      await disconnect();
    }
    return;
  }

  prevStates = { ...prevStates, ...curStates };

  // eslint-disable-next-line unicorn/no-unsafe-regex
  const re = /^-?\d+(?:.\d{0,4})?/u;
  const trunc = (val?: number): number => {
    const checkedVal = checkVal(val);
    if (Number.isNaN(checkedVal)) {
      return checkedVal;
    }
    const match = checkedVal.toString().match(re);
    if (match && match.length === 0) {
      return checkedVal;
    }
    return Number(match![0]!);
  };

  /*
   * TODO(RSDK-881): this ought to detect actual controller mappings; for now
   * just try to not fail.
   */
  curStates.X = trunc(gamepad.axes[0]);
  curStates.Y = trunc(gamepad.axes[1]);
  curStates.RX = trunc(gamepad.axes[2]);
  curStates.RY = trunc(gamepad.axes[3]);
  curStates.Z = trunc(gamepad.buttons[6]?.value);
  curStates.RZ = trunc(gamepad.buttons[7]?.value);
  curStates.Hat0X = trunc(
    checkVal(gamepad.buttons[14]?.value) * -1 +
      checkVal(gamepad.buttons[15]?.value)
  );
  curStates.Hat0Y = trunc(
    checkVal(gamepad.buttons[12]?.value) * -1 +
      checkVal(gamepad.buttons[13]?.value)
  );
  curStates.South = trunc(gamepad.buttons[0]?.value);
  curStates.East = trunc(gamepad.buttons[1]?.value);
  curStates.West = trunc(gamepad.buttons[2]?.value);
  curStates.North = trunc(gamepad.buttons[3]?.value);
  curStates.LT = trunc(gamepad.buttons[4]?.value);
  curStates.RT = trunc(gamepad.buttons[5]?.value);
  curStates.Select = trunc(gamepad.buttons[8]?.value);
  curStates.Start = trunc(gamepad.buttons[9]?.value);
  curStates.LThumb = trunc(gamepad.buttons[10]?.value);
  curStates.RThumb = trunc(gamepad.buttons[11]?.value);
  curStates.Menu = trunc(gamepad.buttons[16]?.value);

  if (enabled) {
    processEvents(true);
  }

  handle = window.setTimeout(tick, 10);
};

onMount(() => {
  window.addEventListener('gamepadconnected', (event) => {
    if (gamepadIdx) {
      return;
    }
    gamepadIdx = event.gamepad.index;
    tick();
  });
  window.addEventListener('gamepaddisconnected', (event) => {
    if (gamepadIdx === event.gamepad.index || !gamepad?.connected) {
      gamepadIdx = null;
    }
  });
  // initial search
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad) {
      gamepadIdx = pad.index;
      break;
    }
  }

  if (!gamepadIdx) {
    return;
  }
  prevStates = { ...prevStates, ...curStates };
  tick();
});

useDisconnect(() => clearTimeout(handle));

$: {
  connectEvent(enabled);
}
</script>

<Collapse>
  <svelte:fragment slot="title">{name}</svelte:fragment>
  <svelte:fragment slot="breadcrumbs">
    <Breadcrumbs crumbs={['input_controller']} />

    {#if gamepad?.connected}
      ({gamepad?.id})
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="addon">
    {#if gamepad?.connected && enabled}
      <Badge
        variant="green"
        label="Enabled"
      />
    {:else}
      <Badge
        variant="gray"
        label="Disabled"
      />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div class="flex flex-row">
      <Label>
        Enable gamepad
        <Switch
          slot="input"
          on={enabled}
          on:toggle={({ detail }) => (enabled = detail)}
        />
      </Label>
    </div>

    {#if gamepad?.connected}
      <div class="flex h-full w-full flex-row justify-between gap-2">
        {#each Object.keys(curStates) as stateName, value}
          <div class="ml-0 flex w-[8ex] flex-col text-center">
            <p class="m-0">{stateName}</p>
            {value.toFixed(/X|Y|Z$/u.test(stateName.toString()) ? 4 : 0)}
          </div>
        {/each}
      </div>
    {/if}
  </svelte:fragment>
</Collapse>

<style>
</style>
