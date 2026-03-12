/**
 * ambisonic.js - Ambisonic / multiopus audio support.
 * Configures multi-channel Opus encoding for spatial audio (Ambisonics).
 * Handles SDP munging for multiopus channel mapping and speaker layouts.
 */

import { getPublisher, getMediaManager, isBroadcasting } from './publisher-core.js';
import { config } from './config.js';

/**
 * Ambisonic order definitions.
 * First-order Ambisonics (FOA) = 4 channels (W, Y, Z, X)
 * Second-order (SOA) = 9 channels
 * Third-order (TOA) = 16 channels
 */
const AMBISONIC_ORDERS = {
  foa: {
    label: 'First Order (4ch)',
    channels: 4,
    channelMapping: '0,1,2,3',
    coupledStreams: 2,
    streams: 2,
  },
  soa: {
    label: 'Second Order (9ch)',
    channels: 9,
    channelMapping: '0,1,2,3,4,5,6,7,8',
    coupledStreams: 4,
    streams: 5,
  },
  toa: {
    label: 'Third Order (16ch)',
    channels: 16,
    channelMapping: '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15',
    coupledStreams: 8,
    streams: 8,
  },
  stereo: {
    label: 'Stereo (2ch)',
    channels: 2,
    channelMapping: '0,1',
    coupledStreams: 1,
    streams: 1,
  },
  surround51: {
    label: '5.1 Surround (6ch)',
    channels: 6,
    channelMapping: '0,4,1,2,3,5',
    coupledStreams: 2,
    streams: 4,
  },
};

let activeAmbisonicOrder = null;

/**
 * Munge SDP to enable multiopus for Ambisonic/multi-channel audio.
 * Inserts the multiopus fmtp parameters into the SDP offer.
 *
 * @param {string} sdp - The original SDP string
 * @param {string} order - Key from AMBISONIC_ORDERS (e.g., 'foa', 'soa', 'toa')
 * @returns {string} Modified SDP with multiopus parameters
 */
function mungeSDPForMultiopus(sdp, order) {
  const ambiConfig = AMBISONIC_ORDERS[order];
  if (!ambiConfig) {
    console.warn(`Unknown Ambisonic order: ${order}`);
    return sdp;
  }

  // Find the opus payload type in the SDP
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
  if (!opusMatch) {
    console.warn('No opus codec found in SDP.');
    return sdp;
  }

  const opusPT = opusMatch[1];

  // Update the rtpmap to reflect multi-channel
  sdp = sdp.replace(
    new RegExp(`a=rtpmap:${opusPT} opus/48000/2`),
    `a=rtpmap:${opusPT} multiopus/48000/${ambiConfig.channels}`
  );

  // Build the multiopus fmtp line
  const fmtpLine = `a=fmtp:${opusPT} minptime=10;useinbandfec=1;` +
    `channel_mapping=${ambiConfig.channelMapping};` +
    `num_streams=${ambiConfig.streams};` +
    `coupled_streams=${ambiConfig.coupledStreams}`;

  // Replace existing fmtp for opus or add new one
  const existingFmtp = new RegExp(`a=fmtp:${opusPT}[^\\r\\n]*`);
  if (existingFmtp.test(sdp)) {
    sdp = sdp.replace(existingFmtp, fmtpLine);
  } else {
    // Insert after the rtpmap line
    sdp = sdp.replace(
      new RegExp(`(a=rtpmap:${opusPT} multiopus/48000/${ambiConfig.channels})`),
      `$1\r\n${fmtpLine}`
    );
  }

  console.log(`SDP munged for ${ambiConfig.label} (${ambiConfig.channels} channels)`);
  return sdp;
}

/**
 * Apply Ambisonic audio configuration.
 * This patches the publisher's SDP transform to inject multiopus parameters.
 *
 * @param {string} order - Ambisonic order key ('foa', 'soa', 'toa', 'stereo', 'surround51')
 */
function setAmbisonicOrder(order) {
  if (!AMBISONIC_ORDERS[order]) {
    console.error(`Invalid Ambisonic order: ${order}`);
    return;
  }

  activeAmbisonicOrder = order;
  const ambiConfig = AMBISONIC_ORDERS[order];
  console.log(`Ambisonic order set to: ${ambiConfig.label}`);

  // Update audio constraints to request correct channel count
  const mm = getMediaManager();
  if (mm) {
    mm.constraints.audio = {
      ...(typeof mm.constraints.audio === 'object' ? mm.constraints.audio : {}),
      channelCount: { ideal: ambiConfig.channels },
      sampleRate: 48000,
      echoCancellation: false,   // Disable for Ambisonic capture
      noiseSuppression: false,
      autoGainControl: false,
    };
  }

  // Update the UI
  const ambiBtn = document.getElementById('ambisonicBtn');
  if (ambiBtn) {
    ambiBtn.textContent = ambiConfig.label;
  }
}

/**
 * Get the SDP transform function for the current Ambisonic configuration.
 * Returns null if no Ambisonic order is set.
 */
function getSDPTransform() {
  if (!activeAmbisonicOrder) return null;

  return (sdp) => {
    return mungeSDPForMultiopus(sdp, activeAmbisonicOrder);
  };
}

/**
 * Get the current active Ambisonic order.
 */
function getActiveAmbisonicOrder() {
  return activeAmbisonicOrder;
}

/**
 * Get list of available Ambisonic configurations for UI dropdown.
 */
function getAmbisonicOptions() {
  return Object.entries(AMBISONIC_ORDERS).map(([key, val]) => ({
    key,
    label: val.label,
    channels: val.channels,
  }));
}

/**
 * Reset to standard stereo audio (disable Ambisonic).
 */
function resetToStereo() {
  activeAmbisonicOrder = null;

  const mm = getMediaManager();
  if (mm) {
    mm.constraints.audio = {
      echoCancellation: true,
      channelCount: { ideal: 2 },
      sampleRate: 48000,
    };
  }

  const ambiBtn = document.getElementById('ambisonicBtn');
  if (ambiBtn) {
    ambiBtn.textContent = 'Spatial Audio';
  }

  console.log('Reset to standard stereo audio.');
}

/**
 * Initialize Ambisonic UI controls.
 */
function initAmbisonicControls() {
  const ambiDropdown = document.getElementById('ambisonicDropdown');
  if (!ambiDropdown) return;

  // Populate dropdown with Ambisonic options
  const options = getAmbisonicOptions();
  ambiDropdown.innerHTML = '';

  // Add "Off" option
  const offItem = document.createElement('a');
  offItem.className = 'dropdown-item';
  offItem.href = '#';
  offItem.textContent = 'Off (Stereo)';
  offItem.addEventListener('click', (e) => {
    e.preventDefault();
    resetToStereo();
  });
  ambiDropdown.appendChild(offItem);

  // Add Ambisonic order options
  options.forEach(opt => {
    const item = document.createElement('a');
    item.className = 'dropdown-item';
    item.href = '#';
    item.textContent = opt.label;
    item.dataset.order = opt.key;
    item.addEventListener('click', (e) => {
      e.preventDefault();
      setAmbisonicOrder(opt.key);
    });
    ambiDropdown.appendChild(item);
  });
}

export {
  AMBISONIC_ORDERS,
  mungeSDPForMultiopus,
  setAmbisonicOrder,
  getSDPTransform,
  getActiveAmbisonicOrder,
  getAmbisonicOptions,
  resetToStereo,
  initAmbisonicControls,
};
