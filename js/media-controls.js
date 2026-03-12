/**
 * media-controls.js - Bitrate, codec, FPS, resolution, aspect ratio, and simulcast controls.
 * All media parameter adjustments in one place.
 */

import { config, resolutionBitrateMap } from './config.js';
import { getPublisher, getMediaManager, isBroadcasting } from './publisher-core.js';

/**
 * Set max bitrate on the live video sender.
 */
async function setBitrate(bitrateKbps) {
  const publisher = getPublisher();
  if (!publisher || !isBroadcasting()) {
    console.warn('Stream is not active, cannot set bitrate.');
    return;
  }

  const sender = publisher.webRTCPeer?.getSenders?.()?.find(s => s.track?.kind === 'video');
  if (!sender) {
    console.warn('No video sender found.');
    return;
  }

  const parameters = sender.getParameters();
  if (!parameters.encodings) parameters.encodings = [{}];
  parameters.encodings[0].maxBitrate = bitrateKbps * 1000;

  try {
    await sender.setParameters(parameters);
    console.log(`Bitrate set to ${bitrateKbps} kbps.`);
  } catch (error) {
    console.error('Failed to set bitrate:', error);
  }
}

/**
 * Handle bandwidth selection from dropdown.
 */
async function onSetVideoBandwidth(evt, btnElement) {
  try {
    btnElement.disabled = true;
    const bandwidth = parseInt(evt.target.dataset.rate, 10);
    config.bandwidth = bandwidth;
    btnElement.innerHTML = `${bandwidth} kbps`;

    const publisher = getPublisher();
    if (publisher && isBroadcasting() && publisher.webRTCPeer) {
      await publisher.webRTCPeer.updateBitrate(bandwidth);
      console.log(`Bitrate updated to ${bandwidth} kbps.`);
    } else {
      console.warn('Stream not active. Bitrate will apply on start.');
    }
  } catch (error) {
    console.error('Failed to update bitrate:', error);
  } finally {
    btnElement.disabled = false;
  }
}

/**
 * Handle codec selection from dropdown.
 */
async function onSetVideoCodec(evt, btnElement) {
  btnElement.disabled = true;
  const codec = evt.target.dataset.codec;
  config.codec = codec;
  btnElement.innerHTML = codec === 'h264' ? 'Codec' : `${codec}`;

  const publisher = getPublisher();
  if (publisher && isBroadcasting() && publisher.webRTCPeer) {
    try {
      await publisher.webRTCPeer.updateCodec(codec);
      console.log('Codec updated to', codec);
    } catch (e) {
      console.error('Failed to update codec:', e);
    }
  }
  btnElement.disabled = false;
}

/**
 * Handle FPS selection from dropdown.
 */
async function onSetVideoFps(evt, btnElement) {
  try {
    const fps = parseInt(evt.target.dataset.fps, 10);
    config.fps = fps;
    btnElement.disabled = true;

    const mm = getMediaManager();
    const videoTrack = mm?.mediaStream?.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn('No video track found to update FPS.');
      return;
    }

    const settings = videoTrack.getSettings();
    await videoTrack.applyConstraints({
      width: settings.width,
      height: settings.height,
      aspectRatio: settings.aspectRatio,
      frameRate: fps,
    });

    const publisher = getPublisher();
    if (publisher && isBroadcasting() && publisher.webRTCPeer) {
      await publisher.webRTCPeer.replaceTrack(videoTrack);
    }

    btnElement.innerHTML = `${fps} FPS`;
    console.log(`Frame rate applied: ${videoTrack.getSettings().frameRate} FPS`);
  } catch (error) {
    console.error('Failed to update frame rate:', error);
  } finally {
    btnElement.disabled = false;
  }
}

/**
 * Handle aspect ratio selection from dropdown.
 */
async function onSetVideoAspect(evt, btnElement) {
  btnElement.disabled = true;
  const aspect = parseFloat(evt.target.dataset.aspect);
  config.aspect = aspect;
  btnElement.innerHTML = aspect === 1.7778 ? 'Aspect' : `${aspect}`;

  const publisher = getPublisher();
  const mm = getMediaManager();
  if (!publisher || !isBroadcasting() || !mm) {
    btnElement.disabled = false;
    return;
  }

  try {
    const videoTrack = mm.mediaStream.getVideoTracks()[0];
    await videoTrack.applyConstraints({ aspectRatio: aspect });
    if (publisher.webRTCPeer) {
      await publisher.webRTCPeer.replaceTrack(videoTrack);
    }
    console.log('Aspect ratio updated to', aspect);
  } catch (error) {
    console.error('Failed to update aspect ratio:', error);
  }
  btnElement.disabled = false;
}

/**
 * Handle resolution selection from dropdown.
 */
async function onSetResolution(evt, btnElement) {
  try {
    const resolution = parseInt(evt.target.dataset.resolution, 10);
    config.resolution = resolution;
    if (btnElement) btnElement.innerHTML = `${resolution}p`;

    const mm = getMediaManager();
    const videoTrack = mm?.mediaStream?.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn('No video track found to update resolution.');
      return;
    }

    const newConstraints = {
      height: { ideal: resolution, max: 2160 },
      aspectRatio: 16 / 9,
      frameRate: config.fps,
    };

    await videoTrack.applyConstraints(newConstraints);
    console.log('Resolution updated:', videoTrack.getSettings());

    // Auto-set bitrate based on resolution
    if (resolutionBitrateMap[String(resolution)]) {
      const bitrate = resolutionBitrateMap[String(resolution)];
      const publisher = getPublisher();
      if (publisher && isBroadcasting() && publisher.webRTCPeer) {
        await publisher.webRTCPeer.updateBitrate(bitrate);
        console.log(`Auto-bitrate set to ${bitrate} kbps for ${resolution}p`);
      }
    }
  } catch (error) {
    if (error.name === 'OverconstrainedError') {
      console.warn('OverconstrainedError. Trying fallback.');
      try {
        const mm = getMediaManager();
        const videoTrack = mm?.mediaStream?.getVideoTracks()[0];
        if (videoTrack) {
          await videoTrack.applyConstraints({
            height: { ideal: config.resolution, max: 2160 },
            aspectRatio: 16 / 9,
          });
        }
      } catch (fallbackError) {
        console.error('Fallback constraints failed:', fallbackError);
      }
    } else {
      console.error('Failed to update resolution:', error);
    }
  }
}

/**
 * Toggle simulcast on/off.
 */
async function onToggleSimulcast(evt) {
  try {
    const isEnabled = evt.target.dataset.simulcast === 'true';
    config.simulcast = isEnabled;
    console.log(`Simulcast set to: ${isEnabled}`);

    const publisher = getPublisher();
    if (publisher && isBroadcasting() && publisher.webRTCPeer?.updateSimulcast) {
      await publisher.webRTCPeer.updateSimulcast(isEnabled);
      console.log(`Simulcast ${isEnabled ? 'enabled' : 'disabled'}`);
    } else {
      console.log('Simulcast will take effect on next broadcast.');
    }
  } catch (error) {
    console.error('Failed to toggle simulcast:', error);
  }
}

/**
 * Apply all video constraints at once.
 */
async function applyAllConstraints() {
  const mm = getMediaManager();
  const videoTrack = mm?.mediaStream?.getVideoTracks()[0];
  if (!videoTrack) return;

  try {
    await videoTrack.applyConstraints({
      height: { min: config.resolution, max: 2160 },
      frameRate: config.fps,
      aspectRatio: config.aspect,
    });
    console.log('Combined constraints applied:', videoTrack.getSettings());
  } catch (error) {
    console.error('Failed to apply constraints:', error);
  }
}

export {
  setBitrate,
  onSetVideoBandwidth,
  onSetVideoCodec,
  onSetVideoFps,
  onSetVideoAspect,
  onSetResolution,
  onToggleSimulcast,
  applyAllConstraints,
};
