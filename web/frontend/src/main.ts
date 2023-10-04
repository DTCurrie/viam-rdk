import '@viamrobotics/prime-core';
import './tailwind.css';
import App from './app.svelte';

export { version } from '../package.json';

export default new App({
  target: document.querySelector('#app')!,
});
