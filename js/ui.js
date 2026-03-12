/**
 * ui.js - UI helpers, device lists, dropdowns, broadcast handler, and misc controls.
 * All DOM interaction that isn't specific to another module lives here.
 */

import { config, applyStreamConfig } from './config.js';
import {
  initPublisher,
  getMediaStream,
  startBroadcast,
  stopBroadcast,
  isBroadcasting,
  setBroadcasting,
  getMediaManager,
  updateMediaStream,
  onBroadcast,
} from './publisher-core.js';
import {
  setActiveStream,
  getActiveStream,
  startScreenShare,
  startCameraPlusScreen,
  startDualCamera,
  stopScreenShare,
  getIsScreenSharing,
} from './screen-share.js';
import {
  onSetVideoBandwidth,
  onSetVideoCodec,
  onSetVideoFps,
  onSetVideoAspect,
  onSetResolution,
  onToggleSimulcast,
} from './media-controls.js';
import { startStatsPolling, stopStatsPolling, toggleStatsOverlay, resetDeltas } from './stats.js';
import { detectRecording } from './recording.js';
import { getSDPTransform } from './ambisonic.js';

let viewerCount = 0;

/**
 * Populate device dropdowns for microphones and cameras.
 */
async function displayDevices() {
  const mm = getMediaManager();
  if (!mm) return;

  const devices = await mm.getDevices();
  const micList = document.getElementById('micList');
  const camList = document.getElementById('cameraList');

  if (micList) {
    micList.innerHTML = '';
    devices.audioinput.forEach((device, i) => {
      const a = document.createElement('a');
      a.className = 'dropdown-item';
      a.href = '#';
      a.textContent = device.label || `Microphone ${i + 1}`;
      a.dataset.deviceId = device.deviceId;
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const stream = await updateMediaStream('audio', device.deviceId);
          if (stream) {
            setActiveStream(stream);
            const btn = document.getElementById('micBtn');
            if (btn) btn.textContent = device.label || `Mic ${i + 1}`;
          }
        } catch (err) {
          console.error('Failed to switch mic:', err);
        }
      });
      micList.appendChild(a);
    });
  }

  if (camList) {
    camList.innerHTML = '';
    devices.videoinput.forEach((device, i) => {
      const a = document.createElement('a');
      a.className = 'dropdown-item';
      a.href = '#';
      a.textContent = device.label || `Camera ${i + 1}`;
      a.dataset.deviceId = device.deviceId;
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const stream = await updateMediaStream('video', device.deviceId);
          if (stream) {
            setActiveStream(stream);
            const preview = document.getElementById('vidWin');
            if (preview) preview.srcObject = stream;
            const btn = document.getElementById('cameraBtn');
            if (btn) btn.textContent = device.label || `Camera ${i + 1}`;
          }
        } catch (err) {
          console.error('Failed to switch camera:', err);
        }
      });
      camList.appendChild(a);
    });
  }
}

/**
 * Wire up the Apply Stream Config button.
 */
function initStreamConfigUI() {
  const applyBtn = document.getElementById('applyConfig');
  const streamIdInput = document.getElementById('streamId');
  const tokenInput = document.getElementById('publishToken');

  if (applyBtn && streamIdInput && tokenInput) {
    applyBtn.addEventListener('click', async () => {
      applyStreamConfig(streamIdInput.value.trim(), tokenInput.value.trim());
      // Re-detect recording after new config applied
      await detectRecording();
    });
  }

  // Pre-fill inputs from URL config
  if (streamIdInput && config.streamAccountId && config.streamName) {
    streamIdInput.value = `${config.streamAccountId}/${config.streamName}`;
  }
  if (tokenInput && config.publishToken) {
    tokenInput.value = config.publishToken;
  }
}

/**
 * Wire up the Broadcast (Go Live / Stop) button.
 */
function initBroadcastButton() {
  const broadcastBtn = document.getElementById('broadcastBtn');
  if (!broadcastBtn) return;

  broadcastBtn.addEventListener('click', async () => {
    if (isBroadcasting()) {
      // Stop broadcasting
      stopBroadcast();
      setBroadcasting(false);
      broadcastBtn.textContent = 'Go Live';
      broadcastBtn.classList.remove('btn-danger');
      broadcastBtn.classList.add('btn-success');
      stopStatsPolling();
      _updateViewerCount(0);
      console.log('Broadcast stopped.');
    } else {
      // Start broadcasting
      const activeStream = getActiveStream();
      if (!activeStream) {
        console.error('No media stream available.');
        return;
      }

      broadcastBtn.disabled = true;
      broadcastBtn.textContent = 'Connecting...';

      const success = await startBroadcast({
        mediaStream: activeStream,
        codec: config.codec,
        simulcast: config.simulcast,
        bandwidth: config.bandwidth || 2500,
      });

      if (success) {
        broadcastBtn.textContent = 'Stop';
        broadcastBtn.classList.remove('btn-success');
        broadcastBtn.classList.add('btn-danger');
        resetDeltas();
        startStatsPolling();
      } else {
        broadcastBtn.textContent = 'Go Live';
        broadcastBtn.classList.remove('btn-danger');
        broadcastBtn.classList.add('btn-success');
      }
      broadcastBtn.disabled = false;
    }
  });

  // Listen for broadcast events
  onBroadcast((event) => {
    if (event.name === 'viewercount') {
      _updateViewerCount(event.data?.viewercount || 0);
    } else if (event.name === 'publishStop') {
      broadcastBtn.textContent = 'Go Live';
      broadcastBtn.classList.remove('btn-danger');
      broadcastBtn.classList.add('btn-success');
      setBroadcasting(false);
      stopStatsPolling();
      _updateViewerCount(0);
    }
  });
}

/**
 * Update viewer count display.
 */
function _updateViewerCount(count) {
  viewerCount = count;
  const el = document.getElementById('viewerCount');
  if (el) el.textContent = count > 0 ? `${count} viewer${count !== 1 ? 's' : ''}` : '';
}

/**
 * Wire up screen share buttons.
 */
function initScreenShareButtons() {
  const screenOnlyBtn = document.getElementById('screenShareBtn');
  const compositeBtn = document.getElementById('screenCompositeBtn');
  const camScreenBtn = document.getElementById('camScreenBtn');
  const dualCamBtn = document.getElementById('dualCamBtn');
  const stopShareBtn = document.getElementById('stopShareBtn');

  if (screenOnlyBtn) {
    screenOnlyBtn.addEventListener('click', () => startScreenShare('screenOnly'));
  }
  if (compositeBtn) {
    compositeBtn.addEventListener('click', () => startScreenShare('composite'));
  }
  if (camScreenBtn) {
    camScreenBtn.addEventListener('click', () => startCameraPlusScreen());
  }
  if (dualCamBtn) {
    dualCamBtn.addEventListener('click', () => startDualCamera());
  }
  if (stopShareBtn) {
    stopShareBtn.addEventListener('click', () => stopScreenShare());
  }
}

/**
 * Wire up video settings dropdowns (bitrate, codec, fps, aspect, resolution, simulcast).
 */
function initVideoSettingsDropdowns() {
  // Bitrate
  const bitrateDropdown = document.getElementById('bitrateDropdown');
  const bitrateBtn = document.getElementById('bitrateBtn');
  if (bitrateDropdown && bitrateBtn) {
    bitrateDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.rate) onSetVideoBandwidth(e, bitrateBtn);
    });
  }

  // Codec
  const codecDropdown = document.getElementById('codecDropdown');
  const codecBtn = document.getElementById('codecBtn');
  if (codecDropdown && codecBtn) {
    codecDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.codec) onSetVideoCodec(e, codecBtn);
    });
  }

  // FPS
  const fpsDropdown = document.getElementById('fpsDropdown');
  const fpsBtn = document.getElementById('fpsBtn');
  if (fpsDropdown && fpsBtn) {
    fpsDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.fps) onSetVideoFps(e, fpsBtn);
    });
  }

  // Aspect Ratio
  const aspectDropdown = document.getElementById('aspectDropdown');
  const aspectBtn = document.getElementById('aspectBtn');
  if (aspectDropdown && aspectBtn) {
    aspectDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.aspect) onSetVideoAspect(e, aspectBtn);
    });
  }

  // Resolution
  const resDropdown = document.getElementById('resolutionDropdown');
  const resBtn = document.getElementById('resolutionBtn');
  if (resDropdown && resBtn) {
    resDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.resolution) onSetResolution(e, resBtn);
    });
  }

  // Simulcast
  const simDropdown = document.getElementById('simulcastDropdown');
  if (simDropdown) {
    simDropdown.addEventListener('click', (e) => {
      if (e.target.dataset.simulcast !== undefined) onToggleSimulcast(e);
    });
  }
}

/**
 * Wire up mute buttons.
 */
function initMuteButtons() {
  const muteAudioBtn = document.getElementById('muteAudioBtn');
  const muteVideoBtn = document.getElementById('muteVideoBtn');
  const mm = getMediaManager();

  if (muteAudioBtn) {
    let audioMuted = false;
    muteAudioBtn.addEventListener('click', () => {
      audioMuted = !audioMuted;
      mm?.muteAudio(audioMuted);
      muteAudioBtn.textContent = audioMuted ? 'Unmute Mic' : 'Mute Mic';
      muteAudioBtn.classList.toggle('btn-warning', audioMuted);
    });
  }

  if (muteVideoBtn) {
    let videoMuted = false;
    muteVideoBtn.addEventListener('click', () => {
      videoMuted = !videoMuted;
      mm?.muteVideo(videoMuted);
      muteVideoBtn.textContent = videoMuted ? 'Unmute Cam' : 'Mute Cam';
      muteVideoBtn.classList.toggle('btn-warning', videoMuted);
    });
  }
}

/**
 * Wire up stats toggle button.
 */
function initStatsButton() {
  const statsBtn = document.getElementById('statsBtn');
  if (statsBtn) {
    statsBtn.addEventListener('click', () => {
      toggleStatsOverlay();
      statsBtn.classList.toggle('active');
    });
  }
}

/**
 * Wire up the settings cog toggle.
 */
function initSettingsToggle() {
  const cogBtn = document.getElementById('cogBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  if (cogBtn && settingsPanel) {
    cogBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });
  }
}

/**
 * Copy share link to clipboard.
 */
function initShareLink() {
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        const orig = shareBtn.textContent;
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = orig; }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    });
  }
}

/**
 * Initialize the video preview element.
 */
async function initPreview() {
  const preview = document.getElementById('vidWin');
  if (!preview) return null;

  try {
    const stream = await getMediaStream();
    preview.srcObject = stream;
    preview.muted = true;
    await preview.play().catch(() => {});
    setActiveStream(stream);
    return stream;
  } catch (err) {
    console.error('Failed to init preview:', err);
    return null;
  }
}

export {
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
};
