import './app.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { clearLabelCache } from './lib/plan/geometry';
import { app, startState } from './lib/state.svelte';

startState();
mount(App, { target: document.body });

/* room labels are measured with the web font; measure again once it is in */
document.fonts?.ready.then(() => {
  clearLabelCache();
  app.fontsLoaded = true;
});

/* installable and offline: the service worker caches the app and updates
   itself in the background the next time you open it online */
registerSW({ immediate: true });
