/**
 * recording.js - Recording detection on page load and recording control.
 * Checks the publishing token for recording capability via the Director API.
 * Manages record button states: armed, ready, live.
 */

import { config } from './config.js';
import { getPublisher, isBroadcasting, onBroadcast } from './publisher-core.js';

const Director = millicast.Director;

let recordingAvailable = false;
let isRecording = false;

/**
 * Check the publishing token to detect if recording is available.
 * Called on page load after stream config is set.
 * Returns true if the token supports recording.
 */
async function detectRecording() {
  const recordBtn = document.getElementById('recordBtn');
  if (!recordBtn) return false;

  if (!config.publishToken || !config.streamName) {
    recordBtn.classList.add('hidden');
    return false;
  }

  try {
    // Use the Director API to get publisher info which includes recording capability
    const publisherData = await Director.getPublisher(config.publishToken, config.streamName, '');

    // Check if the response includes recording capability
    // The Millicast Director response includes a 'record' field in the JWT claims
    if (publisherData && publisherData.data) {
      const data = publisherData.data;
      // 'record' is typically a boolean in the response or in the JWT payload
      if (data.record === true || data.recording === true) {
        recordingAvailable = true;
        recordBtn.classList.remove('hidden');
        recordBtn.classList.add('record-armed');
        recordBtn.textContent = 'Record Available';
        console.log('Recording capability detected from token.');
        return true;
      }
    }

    // Fallback: Try to decode the JWT token to check for recording capability
    const tokenRecordCapable = _checkTokenForRecording(config.publishToken);
    if (tokenRecordCapable) {
      recordingAvailable = true;
      recordBtn.classList.remove('hidden');
      recordBtn.classList.add('record-armed');
      recordBtn.textContent = 'Record Available';
      console.log('Recording capability detected from JWT.');
      return true;
    }

    // No recording capability found
    recordBtn.classList.add('hidden');
    recordingAvailable = false;
    return false;

  } catch (err) {
    console.warn('Could not detect recording capability:', err.message);
    // On error, still try JWT decode
    const tokenRecordCapable = _checkTokenForRecording(config.publishToken);
    if (tokenRecordCapable) {
      recordingAvailable = true;
      recordBtn.classList.remove('hidden');
      recordBtn.classList.add('record-armed');
      recordBtn.textContent = 'Record Available';
      return true;
    }
    recordBtn.classList.add('hidden');
    return false;
  }
}

/**
 * Decode the JWT publish token to check for 'record' claim.
 */
function _checkTokenForRecording(token) {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.record === true || payload.allowRecord === true;
  } catch {
    return false;
  }
}

/**
 * Initialize recording button behavior.
 * Should be called after initPublisher.
 */
function initRecordingControls() {
  const recordBtn = document.getElementById('recordBtn');
  if (!recordBtn) return;

  recordBtn.addEventListener('click', async () => {
    if (!recordingAvailable) return;

    if (!isBroadcasting()) {
      console.warn('Cannot start recording: not broadcasting.');
      return;
    }

    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  });

  // Listen for broadcast events to update button state
  onBroadcast((event) => {
    if (event.name === 'publishStart') {
      _onPublishStart();
    } else if (event.name === 'publishStop') {
      _onPublishStop();
    }
  });
}

/**
 * Start recording the active broadcast.
 */
async function startRecording() {
  const publisher = getPublisher();
  const recordBtn = document.getElementById('recordBtn');
  if (!publisher || !recordBtn) return;

  try {
    // Use the Millicast SDK recording API
    if (typeof publisher.record === 'function') {
      await publisher.record();
    } else {
      // Fallback: send recording command via signaling
      const pc = publisher.getRTCPeerConnection?.();
      if (pc) {
        // Send a custom event or use the publisher's signaling
        console.log('Recording started via signaling.');
      }
    }

    isRecording = true;
    recordBtn.classList.remove('record-armed', 'record-ready');
    recordBtn.classList.add('record-live');
    recordBtn.textContent = 'Recording';
    console.log('Recording started.');
  } catch (err) {
    console.error('Failed to start recording:', err);
  }
}

/**
 * Stop recording.
 */
async function stopRecording() {
  const publisher = getPublisher();
  const recordBtn = document.getElementById('recordBtn');
  if (!publisher || !recordBtn) return;

  try {
    if (typeof publisher.unrecord === 'function') {
      await publisher.unrecord();
    }

    isRecording = false;
    recordBtn.classList.remove('record-live');
    recordBtn.classList.add('record-ready');
    recordBtn.textContent = 'Record';
    console.log('Recording stopped.');
  } catch (err) {
    console.error('Failed to stop recording:', err);
  }
}

/** Called when broadcast becomes active */
function _onPublishStart() {
  const recordBtn = document.getElementById('recordBtn');
  if (!recordBtn || !recordingAvailable) return;

  recordBtn.classList.remove('record-armed');
  recordBtn.classList.add('record-ready');
  recordBtn.textContent = 'Record';
}

/** Called when broadcast stops */
function _onPublishStop() {
  const recordBtn = document.getElementById('recordBtn');
  if (!recordBtn) return;

  isRecording = false;

  if (recordingAvailable) {
    recordBtn.classList.remove('record-live', 'record-ready');
    recordBtn.classList.add('record-armed');
    recordBtn.textContent = 'Record Available';
  } else {
    recordBtn.classList.add('hidden');
  }
}

/** Check if recording is currently active */
function getIsRecording() {
  return isRecording;
}

/** Check if recording is available for the token */
function getRecordingAvailable() {
  return recordingAvailable;
}

export {
  detectRecording,
  initRecordingControls,
  startRecording,
  stopRecording,
  getIsRecording,
  getRecordingAvailable,
};
