import { StreamClient, RobotClient, CameraClient } from '@viamrobotics/sdk';
import { get, writable, type Readable } from 'svelte/store';

export interface TrackEvent {
  streams: MediaStream[];
}

export interface CameraStream {
  count: Readable<number>;
  stream: Readable<MediaStream>;
  open: () => Promise<void>;
  close: () => Promise<void>;
  add: () => Promise<void>;
  remove: () => Promise<void>;
  setSrc: (element: HTMLImageElement) => Promise<void>;
}

export const createCameraStream = (
  robotClient: RobotClient,
  streamClient: StreamClient,
  name: string,
  onOpen?: () => void,
  onClose?: () => void
): CameraStream => {
  const cameraClient = new CameraClient(robotClient, name);
  const stream = writable(new MediaStream());
  const count = writable(0);

  const open = async () => {
    await streamClient.add(name);

    streamClient.on('track', (event) => {
      const [eventStream] = (event as TrackEvent).streams;
      if (!eventStream) {
        throw new Error('expected event stream to exist');
      }

      // Ignore event if received for the wrong stream, in the case of multiple cameras
      if (eventStream.id !== name) {
        return;
      }

      stream.set(eventStream);
      onOpen?.();
    });
  };

  const close = async () => {
    await streamClient.remove(name);
    onClose?.();
  };

  const add = async () => {
    if (get(count) === 0) {
      await open();
    }

    count.update((current) => current + 1);
  };

  const remove = async () => {
    count.update((current) => current - 1);

    if (get(count) === 0) {
      await close();
    }
  };

  const setSrc = async (element: HTMLImageElement) => {
    const blob = await cameraClient.renderFrame('image/jpeg');
    element.setAttribute('src', URL.createObjectURL(blob));
  };

  return { count, stream, open, close, add, remove, setSrc };
};

export interface StreamManager {
  streamClient: StreamClient;
  getStream: (
    name: string,
    onOpen?: () => void,
    onClose?: () => void
  ) => CameraStream;
  refresh: () => Promise<void>;
  stop: () => Promise<void>;
}

export const createStreamManager = (client: RobotClient) => {
  const streamClient = new StreamClient(client);
  const streams: Record<string, CameraStream> = {};

  const getStream = (
    name: string,
    onOpen?: () => void,
    onClose?: () => void
  ) => {
    const current = streams[name];
    if (current !== undefined) {
      return current;
    }

    const stream = createCameraStream(
      client,
      streamClient,
      name,
      onOpen,
      onClose
    );

    streams[name] = stream;
    return stream;
  };

  const refresh = async () => {
    await Promise.all(
      Object.values(streams)
        .filter(({ count }) => get(count) > 0)
        .map(({ open }) => open)
    );
  };

  const stop = async () => {
    await Promise.all(
      Object.values(streams)
        .filter(({ count }) => get(count) > 0)
        .map(({ close }) => close)
    );
  };

  return { streamClient, getStream, refresh, stop };
};
