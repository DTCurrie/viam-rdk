import type { DialConf } from '@viamrobotics/sdk';
import RemoteControlCards from './components/remote-control-cards.svelte';
import type { RCOverrides } from '@/types/overrides';

export const createRcApp = (
  target: HTMLElement,
  props: DialConf & {
    signalingAddress: string;
    overrides?: RCOverrides;
  }
) => new RemoteControlCards({ target, props });
