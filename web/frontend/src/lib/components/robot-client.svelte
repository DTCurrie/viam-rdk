<script lang="ts">
import { grpc } from '@improbable-eng/grpc-web';
import { Duration } from 'google-protobuf/google/protobuf/duration_pb';
import { onMount, onDestroy, createEventDispatcher } from 'svelte';
import { type Credentials, ConnectionClosedError } from '@viamrobotics/rpc';
import {
  createRobotClient,
  robotApi,
  commonApi,
  type ServiceError,
} from '@viamrobotics/sdk';
import { notify } from '@viamrobotics/prime';
import { getSessions } from '@/api/robot';
import { getSensors } from '@/api/sensors';
import { useRobotClient } from '@/hooks/robot-client';
import {
  scheduleAsyncInterval,
  type IntervalCanceller,
  Button,
  TextInput,
} from '@viamrobotics/prime-core';
import {
  resourceNameToString,
  filterSubtype,
  stringToResourceName,
} from '@/lib/resource';
import type { Operation } from '@viamrobotics/sdk/dist/gen/robot/v1/robot_pb';
import { displayError, displayErrorOnce } from '../error';
import { createStreamManager } from '../stream-manager';

export let host: string;
export let signalingAddress: string;
export let bakedAuth: { authEntity?: string; creds?: Credentials } = {};
export let supportedAuthTypes: string[] = [];

const {
  robotClient,
  operations,
  sessions,
  sessionsSupported,
  resources,
  sensorNames,
  statuses,
  statusStream,
  streamManager,
  rtt,
  connectionStatus,
  components,
} = useRobotClient();

const dispatch = createEventDispatcher<{
  'connection-error': unknown;
}>();

const relevantSubtypesForStatus = [
  'arm',
  'gantry',
  'board',
  'servo',
  'motor',
  'input_controller',
] as const;

let password = '';
let lastStatusTS: number | null = null;
let resourcesOnce = false;
let cancelInit: IntervalCanceller;
let cancelTick: IntervalCanceller;

const handleCallErrors = (
  list: { resources: boolean; ops: boolean },
  newErrors: unknown
) => {
  const errorsList = document.createElement('ul');
  errorsList.classList.add('list-disc', 'pl-4');

  for (const key of Object.keys(list)) {
    switch (key) {
      case 'resources': {
        errorsList.innerHTML += '<li>Robot Resources</li>';
        break;
      }
      case 'ops': {
        errorsList.innerHTML += '<li>Current Operations</li>';
        break;
      }
    }
  }

  displayErrorOnce(
    new Error(`Error retrieving the following: ${errorsList.outerHTML}`, {
      cause: newErrors,
    }),
    'connection'
  );
};

const loadCurrentOps = async () => {
  const now = Date.now();
  const list = await $robotClient.getOperations();
  const ops: { op: Operation.AsObject; elapsed: number }[] = [];

  $rtt = Math.max(Date.now() - now, 0);

  for (const operation of list ?? []) {
    const op = operation.toObject();
    ops.push({
      op,
      elapsed: op.started ? Date.now() - op.started.seconds * 1000 : -1,
    });
  }

  ops.sort((op1, op2) => {
    if (op1.elapsed === -1 || op2.elapsed === -1) {
      // move op with null start time to the back of the list
      return op2.elapsed - op1.elapsed;
    }

    return op1.elapsed - op2.elapsed;
  });

  return ops;
};

const fetchCurrentSessions = async () => {
  if (!$sessionsSupported) {
    return [];
  }

  try {
    const list = await getSessions($robotClient);
    list.sort((sess1, sess2) => (sess1.id < sess2.id ? -1 : 1));
    return list;
  } catch (error) {
    const serviceError = error as ServiceError;
    if (serviceError.code === grpc.Code.Unimplemented) {
      $sessionsSupported = false;
    }

    return [];
  }
};

const updateStatus = (grpcStatuses: robotApi.Status[]) => {
  for (const grpcStatus of grpcStatuses) {
    const nameObj = grpcStatus.getName()!.toObject();
    const status = grpcStatus.getStatus()!.toJavaScript();
    const name = resourceNameToString(nameObj);

    $statuses[name] = status;
  }
};

const restartStatusStream = () => {
  if ($statusStream) {
    $statusStream.cancel();
    $statusStream = null;
  }

  let newResources: commonApi.ResourceName.AsObject[] = [];

  // get all relevant resources
  for (const subtype of relevantSubtypesForStatus) {
    newResources = [...newResources, ...filterSubtype($components, subtype)];
  }

  const names = newResources.map((name) => {
    const resourceName = new commonApi.ResourceName();
    resourceName.setNamespace(name.namespace);
    resourceName.setType(name.type);
    resourceName.setSubtype(name.subtype);
    resourceName.setName(name.name);
    return resourceName;
  });

  const streamReq = new robotApi.StreamStatusRequest();
  streamReq.setResourceNamesList(names);
  streamReq.setEvery(new Duration().setNanos(500_000_000));

  $statusStream = $robotClient.robotService.streamStatus(streamReq);
  if ($statusStream !== null) {
    $statusStream.on(
      'data',
      (response: { getStatusList(): robotApi.Status[] }) => {
        updateStatus(response.getStatusList());
        lastStatusTS = Date.now();
      }
    );
    $statusStream.on('status', (newStatus?: { details: unknown }) => {
      if (!ConnectionClosedError.isError(newStatus!.details)) {
        console.error('error streaming robot status', newStatus);
      }
      $statusStream = null;
    });
    $statusStream.on('end', () => {
      console.error('done streaming robot status');
      $statusStream = null;
    });
  }
};

// query metadata service every 0.5s
const queryMetadata = async () => {
  let resourcesChanged = false;
  let shouldRestartStatusStream = !(resourcesOnce && $statusStream);

  const resourcesList = await $robotClient.resourceNames();
  const differences: Set<string> = new Set(
    $resources.map((name) => resourceNameToString(name))
  );

  const resourceSet: Set<string> = new Set(
    resourcesList.map((name) => resourceNameToString(name))
  );

  for (const elem of resourceSet) {
    if (differences.has(elem)) {
      differences.delete(elem);
    } else {
      differences.add(elem);
    }
  }

  if (differences.size > 0) {
    resourcesChanged = true;

    // restart status stream if resource difference includes a resource we care about
    for (const elem of differences) {
      const resource = stringToResourceName(elem);

      if (
        resource.namespace === 'rdk' &&
        resource.type === 'component' &&
        relevantSubtypesForStatus.includes(
          resource.subtype as (typeof relevantSubtypesForStatus)[number]
        )
      ) {
        shouldRestartStatusStream = true;
        break;
      }
    }
  }

  $resources = resourcesList;

  resourcesOnce = true;
  if (resourcesChanged === true) {
    const sensorsName = filterSubtype(resources.current, 'sensors', {
      remote: false,
    })[0]?.name;

    $sensorNames =
      sensorsName === undefined
        ? []
        : await getSensors($robotClient, sensorsName);
  }

  if (shouldRestartStatusStream === true) {
    restartStatusStream();
  }
};

const checkIntervalMillis = 10_000;

const connections = {
  resources: false,
  ops: false,
  sessions: false,
};

const isConnected = () => {
  return (
    connections.resources &&
    connections.ops &&
    // check status on interval if direct grpc
    Date.now() - lastStatusTS! <= checkIntervalMillis
  );
};

const tick = async () => {
  const newErrors: unknown[] = [];

  try {
    await queryMetadata();
    connections.resources = true;
  } catch (error) {
    if (ConnectionClosedError.isError(error)) {
      connections.resources = false;
    } else {
      newErrors.push(error);
    }
  }

  if (connections.resources) {
    try {
      $operations = await loadCurrentOps();
      connections.ops = true;
    } catch (error) {
      if (ConnectionClosedError.isError(error)) {
        connections.ops = false;
      } else {
        newErrors.push(error);
      }
    }
  }

  if (connections.ops) {
    try {
      $sessions = await fetchCurrentSessions();
      connections.sessions = true;
    } catch (error) {
      if (ConnectionClosedError.isError(error)) {
        connections.sessions = false;
      } else {
        newErrors.push(error);
      }
    }
  }

  if (isConnected()) {
    $connectionStatus = 'connected';
    return;
  }

  if (newErrors.length > 0) {
    handleCallErrors(connections, newErrors);
  }

  $connectionStatus = 'reconnecting';

  try {
    console.debug('reconnecting');

    // reset status/stream state
    if ($statusStream) {
      $statusStream.cancel();
      $statusStream = null;
    }
    resourcesOnce = false;

    await $robotClient.connect();

    const now = Date.now();

    $rtt = Math.max(Date.now() - now, 0);

    lastStatusTS = Date.now();
    console.debug('reconnected');
    $streamManager.refresh();
  } catch (error) {
    if (ConnectionClosedError.isError(error)) {
      console.error('failed to reconnect; retrying');
    } else {
      console.error('failed to reconnect; retrying:', error);
    }
  }
};

const stop = () => {
  cancelInit?.();
  cancelTick?.();
  $statusStream?.cancel();
  $statusStream = null;
};

const start = () => {
  stop();
  lastStatusTS = Date.now();
  tick();
  cancelTick = scheduleAsyncInterval(tick, 500);
};

const connect = async (creds?: Credentials) => {
  $connectionStatus = 'connecting';

  await $robotClient.connect(bakedAuth.authEntity, creds ?? bakedAuth.creds);

  $streamManager = createStreamManager($robotClient);
  $connectionStatus = 'connected';

  start();
};

const login = async (authType: string) => {
  const creds = { type: authType, payload: password };

  try {
    await connect(creds);
  } catch (error) {
    notify.danger(`failed to connect: ${(error as ServiceError).message}`);
    $connectionStatus = 'idle';
  }
};

const init = async (useLocal?: boolean) => {
  $connectionStatus = 'connecting';

  try {
    const { protocol, hostname, port } = location;
    const url = `${protocol}//${useLocal ? hostname : host}${
      port ? `:${port}` : ''
    }`;

    $robotClient = await createRobotClient({
      host: url,
      signalingAddress,
      iceServers: [{ urls: 'stun:global.stun.twilio.com:3478' }],
    });

    await connect();
  } catch (error) {
    if (useLocal) {
      dispatch('connection-error', error);
      displayError(error);
    }

    cancelInit = scheduleAsyncInterval(() => init(true), 5000);
  }
};

const handleUnload = () => {
  stop();
  $streamManager.stop();
  $robotClient.disconnect();
  cancelInit?.();
  cancelTick?.();
};

onMount(() => {
  window.addEventListener('beforeunload', handleUnload);

  if (supportedAuthTypes.length === 0) {
    init();
  }
});

onDestroy(() => {
  handleUnload();
  window.removeEventListener('beforeunload', handleUnload);
  $connectionStatus = 'idle';
});
</script>

{#if $connectionStatus === 'connecting'}
  <slot name="connecting" />
{:else if $connectionStatus === 'reconnecting'}
  <slot name="reconnecting" />
{/if}

{#if $connectionStatus === 'connected' || $connectionStatus === 'reconnecting'}
  <slot />
{:else}
  {#each supportedAuthTypes as authType (authType)}
    <div class="px-4 py-3">
      <span>{authType}: </span>
      <div class="w-96">
        <form on:submit|preventDefault={() => login(authType)}>
          <TextInput
            type="password"
            disabled={$connectionStatus === 'connecting'}
            autocomplete="off"
            bind:value={password}
          />
          <Button
            type="submit"
            disabled={$connectionStatus === 'connecting'}
            on:click={$connectionStatus === 'connecting'
              ? undefined
              : () => login(authType)}
          >
            Login
          </Button>
        </form>
      </div>
    </div>
  {/each}
{/if}
