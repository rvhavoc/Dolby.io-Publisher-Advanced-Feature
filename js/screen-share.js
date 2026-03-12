/**
 * screen-share.js - Screen sharing modes with canvas compositing.
 * Supports: screen-only, screen+camera overlay, camera+screen PiP, dual camera.
 */

import { getPublisher, getMediaManager, isBroadcasting, replaceTrack } from './publisher-core.js';

let isScreenSharing = false;
let originalStream = null;
let compositeAnimation = null;
let screenCleanup = null;
let activeStream = null;

/** Set the active stream reference (called from main.js) */
function setActiveStream(stream) {
  activeStream = stream;
}

/** Get the active stream */
function getActiveStream() {
  return activeStream;
}

/** Check if screen sharing is active */
function getIsScreenSharing() {
  return isScreenSharing;
}

// --- Banner controls ---
function showBanner() {
  const banner = document.getElementById('shareBanner');
  if (banner) banner.classList.remove('hidden');
}

function hideBanner() {
  const banner = document.getElementById('shareBanner');
  if (banner) banner.classList.add('hidden');
}

// --- Audio mixing helper ---
async function mixAudioTracks(...trackArrays) {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  trackArrays.flat().forEach(track => {
    if (track && track.readyState === 'live') {
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      src.connect(dest);
    }
  });
  return dest.stream.getAudioTracks()[0];
}

// --- Replace active stream on both preview and live connection ---
async function replaceActiveStream(stream) {
  const preview = document.getElementById('vidWin');
  if (preview) preview.srcObject = stream;
  activeStream = stream;

  const mm = getMediaManager();
  if (mm) mm.mediaStream = stream;

  if (isBroadcasting()) {
    const vTrack = stream.getVideoTracks()[0];
    const aTrack = stream.getAudioTracks()[0];
    if (vTrack) await replaceTrack(vTrack);
    if (aTrack) await replaceTrack(aTrack);
  }
}

/** Stop screen share and revert to camera */
async function stopScreenShare() {
  if (screenCleanup) {
    await screenCleanup();
    screenCleanup = null;
    hideBanner();
    const videoWin = document.getElementById('vidWin');
    if (videoWin) videoWin.style.cursor = '';
    console.log('Screen share stopped, reverted to camera.');
  }
}

/**
 * Start screen sharing.
 * @param {'screenOnly'|'composite'} mode
 */
async function startScreenShare(mode) {
  let screenStream, cameraStream, canvasStream;
  let cleanup;

  try {
    originalStream = activeStream;
    const oldAudio = originalStream ? originalStream.getAudioTracks() : [];

    // Grab screen + audio
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    const screenAudio = screenStream.getAudioTracks();

    let videoTracks;

    if (mode === 'composite') {
      // Grab camera (video only)
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 854 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });

      const screenVid = document.getElementById('screenVideo');
      const camVid = document.getElementById('cameraVideo');
      screenVid.srcObject = screenStream;
      camVid.srcObject = cameraStream;
      await screenVid.play().catch(() => {});
      await camVid.play().catch(() => {});

      // Canvas compositing
      const canvas = document.getElementById('compositeCanvas');
      const ctx = canvas.getContext('2d');
      const s = screenStream.getVideoTracks()[0].getSettings();
      canvas.width = s.width || 1280;
      canvas.height = Math.floor(canvas.width * 9 / 16);

      const camSets = cameraStream.getVideoTracks()[0].getSettings();
      const camAR = (camSets.width && camSets.height) ? camSets.width / camSets.height : 4 / 3;
      const camW = Math.floor(canvas.width * 0.23);
      const camH = Math.floor(camW / camAR);

      let overlayX = canvas.width - camW - 22;
      let overlayY = canvas.height - camH - 22;
      let dragging = false, offsetX = 0, offsetY = 0;

      const videoWin = document.getElementById('vidWin');

      function mapToCanvasCoord(clientX, clientY) {
        const rect = videoWin.getBoundingClientRect();
        return {
          x: (clientX - rect.left) * (canvas.width / rect.width),
          y: (clientY - rect.top) * (canvas.height / rect.height),
        };
      }

      function onMouseMove(e) {
        if (!dragging) return;
        const { x, y } = mapToCanvasCoord(e.clientX, e.clientY);
        overlayX = Math.max(0, Math.min(canvas.width - camW, x - offsetX));
        overlayY = Math.max(0, Math.min(canvas.height - camH, y - offsetY));
      }

      function onMouseUp() {
        dragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      videoWin.style.cursor = 'move';
      videoWin.addEventListener('mousedown', e => {
        const { x, y } = mapToCanvasCoord(e.clientX, e.clientY);
        if (x >= overlayX && x <= overlayX + camW &&
            y >= overlayY && y <= overlayY + camH) {
          dragging = true;
          offsetX = x - overlayX;
          offsetY = y - overlayY;
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        }
      });

      function drawComposite() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(screenVid, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(camVid, overlayX, overlayY, camW, camH);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(overlayX, overlayY, camW, camH);
        compositeAnimation = requestAnimationFrame(drawComposite);
      }
      drawComposite();

      canvasStream = canvas.captureStream(30);
      videoTracks = canvasStream.getVideoTracks();

      screenCleanup = async () => {
        cancelAnimationFrame(compositeAnimation);
        [screenStream, cameraStream].forEach(s => s.getTracks().forEach(t => t.stop()));
        screenVid.srcObject = camVid.srcObject = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await replaceActiveStream(originalStream);
        isScreenSharing = false;
      };
      screenStream.getVideoTracks()[0].onended = screenCleanup;

    } else {
      // Screen-only mode
      videoTracks = screenStream.getVideoTracks();
      cleanup = async () => {
        screenStream.getTracks().forEach(t => t.stop());
        await replaceActiveStream(originalStream);
        isScreenSharing = false;
      };
      screenCleanup = cleanup;
      screenStream.getVideoTracks()[0].onended = cleanup;
    }

    // Mix screen + old mic audio
    const mixedAudio = await mixAudioTracks(screenAudio, oldAudio);

    const newStream = new MediaStream([...videoTracks, mixedAudio]);
    await replaceActiveStream(newStream);
    isScreenSharing = true;
    showBanner();

  } catch (err) {
    console.error('startScreenShare error:', err);
    if (cleanup) cleanup();
  }
}

/**
 * Camera + Screen (reverse composite): camera full, screen PiP.
 */
async function startCameraPlusScreen() {
  let screenStream, cameraStream, canvasStream;

  try {
    const currentOriginal = activeStream;
    const oldAudio = currentOriginal ? currentOriginal.getAudioTracks() : [];

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 30, max: 60 },
        aspectRatio: 16 / 9,
      },
      audio: false,
    });

    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    const screenAudio = screenStream.getAudioTracks();

    const camVid = document.getElementById('cameraVideo');
    const screenVid = document.getElementById('screenVideo');
    camVid.srcObject = cameraStream;
    screenVid.srcObject = screenStream;
    await camVid.play().catch(() => {});
    await screenVid.play().catch(() => {});

    const canvas = document.getElementById('compositeCanvas');
    const ctx = canvas.getContext('2d');

    const camSet = cameraStream.getVideoTracks()[0].getSettings();
    canvas.width = camSet.width || 1280;
    canvas.height = Math.floor(canvas.width * 9 / 16);

    const scrSet = screenStream.getVideoTracks()[0].getSettings();
    const scrAR = (scrSet.width && scrSet.height) ? scrSet.width / scrSet.height : 16 / 9;
    const pipW = Math.floor(canvas.width * 0.23);
    const pipH = Math.floor(pipW / scrAR);

    let overlayX = canvas.width - pipW - 22;
    let overlayY = canvas.height - pipH - 22;

    const videoWin = document.getElementById('vidWin');
    let dragging = false, offsetX = 0, offsetY = 0;

    function mapToCanvas(clientX, clientY) {
      const rect = videoWin.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height),
      };
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const { x, y } = mapToCanvas(e.clientX, e.clientY);
      overlayX = Math.max(0, Math.min(canvas.width - pipW, x - offsetX));
      overlayY = Math.max(0, Math.min(canvas.height - pipH, y - offsetY));
    }

    function onMouseUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      videoWin.style.cursor = '';
    }

    videoWin.addEventListener('mousedown', (e) => {
      const { x, y } = mapToCanvas(e.clientX, e.clientY);
      if (x >= overlayX && x <= overlayX + pipW && y >= overlayY && y <= overlayY + pipH) {
        dragging = true;
        offsetX = x - overlayX;
        offsetY = y - overlayY;
        videoWin.style.cursor = 'move';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    });

    function drawComposite() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(camVid, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(screenVid, overlayX, overlayY, pipW, pipH);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(overlayX, overlayY, pipW, pipH);
      compositeAnimation = requestAnimationFrame(drawComposite);
    }
    drawComposite();

    canvasStream = canvas.captureStream(30);
    const videoTracks = canvasStream.getVideoTracks();
    const mixedAudioTrack = await mixAudioTracks(screenAudio, oldAudio);

    const newStream = new MediaStream([...videoTracks, mixedAudioTrack]);
    await replaceActiveStream(newStream);
    isScreenSharing = true;
    showBanner();

    screenCleanup = async () => {
      cancelAnimationFrame(compositeAnimation);
      [screenStream, cameraStream].forEach(s => s && s.getTracks().forEach(t => t.stop()));
      screenVid.srcObject = null;
      camVid.srcObject = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await replaceActiveStream(currentOriginal);
      isScreenSharing = false;
      hideBanner();
    };
    screenStream.getVideoTracks()[0].onended = screenCleanup;

  } catch (err) {
    console.error('startCameraPlusScreen error:', err);
  }
}

/**
 * Dual Camera: primary full screen, secondary as PiP.
 */
async function startDualCamera() {
  let camAStream = null, camBStream = null, rafId = 0;

  const stopStream = s => {
    try { s && s.getTracks().forEach(t => t.stop()); } catch {}
  };

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    if (cams.length < 1) {
      alert('No cameras available.');
      return;
    }

    const publisher = getPublisher();
    const mm = getMediaManager();
    const activeVid = mm?.videoInput;
    const activeDevId = activeVid?.getSettings?.()?.deviceId || null;
    const primaryId = activeDevId || cams[0].deviceId;

    const pipId = window.pipDeviceId
      || (cams.find(c => c.deviceId !== primaryId) || cams[0]).deviceId;

    const sameAsActive = (primaryId === pipId);
    if (sameAsActive && cams.length > 1) {
      console.warn('[DualCam] PiP device is same as primary. Picking another camera.');
    }

    // Primary camera (full frame)
    if (activeStream && activeStream.getVideoTracks().length) {
      camAStream = activeStream;
    } else {
      camAStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: primaryId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      });
    }

    // Secondary camera (PiP)
    try {
      camBStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: pipId }, width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
        audio: false,
      });
    } catch {
      // Fallback: open without exact constraint
      camBStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
        audio: false,
      });
    }

    // Canvas compositing
    const canvas = document.getElementById('compositeCanvas');
    const ctx = canvas.getContext('2d');
    const camVid = document.getElementById('cameraVideo');
    const screenVid = document.getElementById('screenVideo');

    camVid.srcObject = camAStream;
    screenVid.srcObject = camBStream;
    await camVid.play().catch(() => {});
    await screenVid.play().catch(() => {});

    const aSet = camAStream.getVideoTracks()[0].getSettings();
    canvas.width = aSet.width || 1280;
    canvas.height = Math.floor(canvas.width * 9 / 16);

    const bSet = camBStream.getVideoTracks()[0].getSettings();
    const bAR = (bSet.width && bSet.height) ? bSet.width / bSet.height : 4 / 3;
    const pipW = Math.floor(canvas.width * 0.23);
    const pipH = Math.floor(pipW / bAR);

    let overlayX = canvas.width - pipW - 22;
    let overlayY = canvas.height - pipH - 22;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(camVid, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(screenVid, overlayX, overlayY, pipW, pipH);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(overlayX, overlayY, pipW, pipH);
      rafId = requestAnimationFrame(draw);
    }
    draw();

    const canvasStream = canvas.captureStream(30);
    const vid = canvasStream.getVideoTracks()[0];
    const audioTrack = activeStream ? activeStream.getAudioTracks()[0] : null;
    const finalStream = new MediaStream(audioTrack ? [vid, audioTrack] : [vid]);

    await replaceActiveStream(finalStream);

    const cleanup = async () => {
      try { cancelAnimationFrame(rafId); } catch {}
      stopStream(camAStream);
      stopStream(camBStream);
      try { await replaceActiveStream(originalStream || activeStream); } catch {}
      isScreenSharing = false;
    };

    screenCleanup = cleanup;
    camAStream.getVideoTracks()[0].onended = cleanup;
    camBStream.getVideoTracks()[0].onended = cleanup;

  } catch (err) {
    console.error('startDualCamera error:', err);
  }
}

export {
  setActiveStream,
  getActiveStream,
  getIsScreenSharing,
  stopScreenShare,
  startScreenShare,
  startCameraPlusScreen,
  startDualCamera,
  replaceActiveStream,
  showBanner,
  hideBanner,
};
