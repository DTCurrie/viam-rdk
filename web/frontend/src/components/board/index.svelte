<script lang="ts">
import cx from 'classnames';
import { displayError } from '@/lib/error';
import { BoardClient } from '@viamrobotics/sdk';
import Collapse from '@/lib/components/collapse.svelte';
import { useRobotClient } from '@/hooks/robot-client';
import { createLogger, createRequestLogger } from '@/lib/logger';
import {
  Breadcrumbs,
  scheduleAsyncInterval,
  type IntervalCanceller,
  Label,
  NumericInput,
  Button,
  Select,
} from '@viamrobotics/prime-core';

export let name: string;

const { robotClient } = useRobotClient();
const logger = createLogger(name);

const boardClient = new BoardClient(
  $robotClient,
  name,
  createRequestLogger(name, 'board request')
);

let pinInput: HTMLInputElement;
let pwmInput: HTMLInputElement;
let frequencyInput: HTMLInputElement;
let cancelStatus: IntervalCanceller;

$: pin = '';
$: pwm = -1;
$: frequency = -1;

$: state = '';
$: currentPwm = '-';
$: currentFrequency = '-';

$: analogEntries = [] as [string, number][];
$: digitalInterruptEntries = [] as [string, number][];

$: isNoPin = pin === '';

const clearMessages = () => {
  state = '';
  currentPwm = '-';
  currentFrequency = '-';
};

const setPin = async () => {
  clearMessages();
  pin = pinInput?.value ?? '';
  await getPinStatus();
};

const getPinStatus = async () => {
  if (!pin) {
    return;
  }

  try {
    const isHigh = await boardClient.getGPIO(pin);
    state = isHigh ? 'high' : 'low';

    const dutyCyclePct = await boardClient.getPWM(pin);
    currentPwm = `${dutyCyclePct * 100}%`;

    const frequencyHz = await boardClient.getPWMFrequency(pin);
    currentFrequency = `${frequencyHz}Hz`;
  } catch (error) {
    displayError(error);
  }
};

const setGpio = async () => {
  try {
    await boardClient.setGPIO(pin, state === 'high');
  } catch (error) {
    displayError(error);
  }
};

const setPwm = async () => {
  try {
    await boardClient.setPWM(pin, pwm / 100);
  } catch (error) {
    displayError(error);
  }
};

const setFrequency = async () => {
  try {
    await boardClient.setPWMFrequency(pin, frequency);
  } catch (error) {
    displayError(error);
  }
};

const getStatus = async () => {
  try {
    const { analogs, digitalInterrupts } = await boardClient.getStatus();
    analogEntries = Object.entries(analogs).sort(([a], [b]) =>
      a > b ? 1 : -1
    );

    digitalInterruptEntries = Object.entries(digitalInterrupts).sort(
      ([a], [b]) => (a > b ? 1 : -1)
    );

    await getPinStatus();
  } catch (error) {
    logger.error(`error getting ${name}'s board status`, error);
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
    crumbs={['board']}
  />

  <div slot="content">
    <div class="flex flex-col lg:flex-row gap-2">
      <div class="flex flex-col gap-2 w-full">
        <div class="w-full">
          <h3 class="mb-2 font-bold text-lg">Analogs</h3>
          {#if analogEntries.length > 0}
            <ul>
              {#each analogEntries as [analogName, analog] (analogName)}
                <li><span class="font-bold">{analogName}: </span>{analog}</li>
              {/each}
            </ul>
          {:else}
            <p>No analogs configured.</p>
          {/if}
        </div>

        <div class="w-full">
          <h3 class="mb-2 font-bold text-lg">Digital interrupts</h3>
          {#if analogEntries.length > 0}
            <ul>
              {#each digitalInterruptEntries as [interruptName, interrupt] (interruptName)}
                <li>
                  <span class="font-bold">{interruptName}: </span>{interrupt}
                </li>
              {/each}
            </ul>
          {:else}
            <p>No digital interrupts configured.</p>
          {/if}
        </div>
      </div>

      <div class="w-full">
        <h3 class="mb-2 font-bold text-lg">GPIO</h3>
        <div class="flex flex-col gap-2">
          <form
            class="flex flex-row gap-2 items-end"
            on:submit|preventDefault={setPin}
          >
            <Label
              required
              cx="w-full"
            >
              Pin
              <NumericInput
                slot="input"
                type="integer"
                required
                bind:input={pinInput}
              />
            </Label>
            <Button
              type="submit"
              cx="h-7.5 w-40"
            >
              Get Pin Status
            </Button>
          </form>

          <form on:submit|preventDefault={setGpio}>
            <Label
              cx={cx('flex gap-2 w-full', {
                'text-disabled': isNoPin,
              })}
              disabled={isNoPin}
            >
              State: {state}
              <div
                slot="input"
                class="flex gap-2 w-full"
              >
                <Select
                  placeholde="Pin state"
                  disabled={isNoPin}
                  bind:value={state}
                >
                  <option>low</option>
                  <option>high</option>
                </Select>
                <Button
                  type="submit"
                  cx="w-40"
                  disabled={isNoPin}
                >
                  Set state
                </Button>
              </div>
            </Label>
          </form>

          <form on:submit|preventDefault={setPwm}>
            <Label
              cx={cx('flex gap-2 w-full', {
                'text-disabled': isNoPin,
              })}
              disabled={isNoPin}
            >
              PWM duty cycle: {currentPwm}
              <div
                slot="input"
                class="flex gap-2"
              >
                <NumericInput
                  type="number"
                  disabled={isNoPin}
                  bind:input={pwmInput}
                  on:change={() =>
                    (pwm = parseFloat(pwmInput?.value)
                      ? parseFloat(pwmInput?.value)
                      : -1)}
                />
                <Button
                  type="submit"
                  cx="w-40"
                  disabled={isNoPin}
                >
                  Set duty cycle
                </Button>
              </div>
            </Label>
          </form>

          <form on:submit|preventDefault={setFrequency}>
            <Label
              cx={cx('flex gap-2 w-full', {
                'text-disabled': isNoPin,
              })}
              disabled={isNoPin}
            >
              PWM frequency: {currentFrequency}
              <div
                slot="input"
                class="flex gap-2"
              >
                <NumericInput
                  type="number"
                  disabled={isNoPin}
                  bind:input={frequencyInput}
                  on:change={() =>
                    (frequency = parseFloat(frequencyInput?.value)
                      ? parseFloat(frequencyInput?.value)
                      : -1)}
                />
                <Button
                  type="submit"
                  cx="w-40"
                  disabled={isNoPin}
                >
                  Set frequency
                </Button>
              </div>
            </Label>
          </form>
        </div>
      </div>
    </div>
  </div>
</Collapse>
