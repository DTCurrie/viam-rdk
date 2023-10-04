<script lang="ts">
import RemoteControlCards from './components/remote-control-cards.svelte';

const { host, bakedAuth, supportedAuthTypes, webrtcSignalingAddress } = window;
</script>

<RemoteControlCards
  {host}
  {bakedAuth}
  {supportedAuthTypes}
  signalingAddress={webrtcSignalingAddress}
/>
