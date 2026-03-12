/**
 * config.js - Stream configuration, URL parameters, and constants.
 * Single source of truth for all runtime configuration.
 */

const params = new URLSearchParams(window.location.search);

/** Mutable config object shared across modules */
const config = {
  streamAccountId: '',
  streamName: '',
  publishToken: '',
  sourceId: '',

  // Defaults
  codec: 'h264',
  bandwidth: 0,
  fps: 30,
  aspect: 1.7778,
  resolution: 720,
  simulcast: false,

  disableVideo: false,
  disableAudio: false,
  disableStereo: false,
  disableOrientation: true,
};

// Resolution-to-bitrate mapping (kbps)
const resolutionBitrateMap = {
  '120': 150,
  '240': 250,
  '360': 400,
  '480': 450,
  '540': 600,
  '640': 800,
  '720': 2000,
  '1080': 6000,
  '1440': 8000,
  '2160': 10000,
};

/**
 * Parse URL parameters and populate config.
 */
function initConfigFromURL() {
  const streamIdParam = params.get('streamId') || '';
  config.publishToken = params.get('token') || '';

  if (streamIdParam) {
    const parts = streamIdParam.split('/');
    if (parts.length >= 2) {
      [config.streamAccountId, config.streamName] = parts;
    } else {
      console.warn(`Invalid streamId format; expected "account/stream", got "${streamIdParam}"`);
      config.streamName = streamIdParam;
    }
  }

  const srcParam = params.get('sourceId');
  if (srcParam) config.sourceId = srcParam;

  console.log('Stream account:', config.streamAccountId);
  console.log('Stream name:   ', config.streamName);
  console.log('Publish token: ', config.publishToken ? '(set)' : '(empty)');
}

/**
 * Apply stream config from the input fields and update URL bar.
 */
function applyStreamConfig(streamIdValue, tokenValue) {
  const parts = streamIdValue.split('/');
  if (parts.length >= 2) {
    [config.streamAccountId, config.streamName] = parts;
  } else {
    config.streamAccountId = '';
    config.streamName = streamIdValue;
  }
  config.publishToken = tokenValue;

  // Update URL bar without reload
  const newParams = new URLSearchParams();
  if (config.streamAccountId && config.streamName) {
    newParams.set('streamId', `${config.streamAccountId}/${config.streamName}`);
  } else if (config.streamName) {
    newParams.set('streamId', config.streamName);
  }
  if (config.publishToken) {
    newParams.set('token', config.publishToken);
  }

  const newUrl = `${location.origin}${location.pathname}?${newParams}`;
  history.replaceState(null, '', newUrl);

  console.log('Applied Stream ID:', config.streamAccountId, '/', config.streamName);
  console.log('Applied Token:', config.publishToken ? '(set)' : '(empty)');
}

export { config, resolutionBitrateMap, initConfigFromURL, applyStreamConfig };
