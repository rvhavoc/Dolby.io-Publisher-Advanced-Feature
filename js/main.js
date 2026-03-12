/**
 * main.js - Entry point for Dolby.io Publisher Advanced Feature.
 * Wires all modules together. Single DOMContentLoaded handler.
 */

import { initConfigFromURL } from './config.js';
import { initPublisher } from './publisher-core.js';
import { detectRecording, initRecordingControls } from './recording.js';
import { initAmbisonicControls } from './ambisonic.js';
import {
  displayDevices,
  initStreamConfigUI,
  initBroadcastButton,
  initScreenShareButtons,
  initVideoSettingsDropdowns,
  initMuteButtons,
  initStatsButton,
  initSettingsToggle,
  initShareLink,
  initPreview,
} from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dolby.io Publisher Advanced Feature - Initializing...');

  // 1. Parse URL config
  initConfigFromURL();

  // 2. Wire up the stream config form (Apply button, pre-fill inputs)
  initStreamConfigUI();

  // 3. Initialize publisher (single instance, single WebSocket)
  await initPublisher();

  // 4. Get media and show preview
  const stream = await initPreview();
  if (!stream) {
    console.error('No media stream. Check camera/mic permissions.');
  }

  // 5. Populate device dropdowns
  await displayDevices();

  // 6. Detect recording capability from token on load
  await detectRecording();
  initRecordingControls();

  // 7. Initialize Ambisonic / spatial audio controls
  initAmbisonicControls();

  // 8. Wire up all UI controls
  initBroadcastButton();
  initScreenShareButtons();
  initVideoSettingsDropdowns();
  initMuteButtons();
  initStatsButton();
  initSettingsToggle();
  initShareLink();

  // 9. Listen for device changes (hot-plug)
  navigator.mediaDevices.addEventListener('devicechange', () => {
    displayDevices();
  });

  console.log('Initialization complete.');
});
