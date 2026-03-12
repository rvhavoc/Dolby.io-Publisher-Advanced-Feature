/**
 * stats.js — Live stats overlay for Dolby.io Publisher
 *
 * Displays packet loss, bitrate, jitter, and available outgoing bandwidth
 * in a transparent overlay positioned under the LIVE badge (top-left).
 *
 * Dual approach:
 *   1. Primary: SDK built-in stats event (publisher.webRTCPeer.on('stats'))
 *   2. Fallback: Manual RTCPeerConnection.getStats() polling every 1s
 *
 * Hooks into publisher_multi.js via:
 *   - window._publisher  (the MillicastPublishUserMedia instance)
 *   - Fallback: polls LIVE badge visibility to auto-detect broadcast state
 */

(function () {
    'use strict';

    var isCollecting = false;
    var pollInterval = null;
    var statsListenerAttached = false;
    var manualPollTimer = null;
    var sdkStatsReceived = false;
    var prevBytesSentVideo = 0;
    var prevBytesSentAudio = 0;
    var prevTimestamp = 0;

    function getOverlay() {
        return document.getElementById('statsOverlay');
    }

    function renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost) {
        var overlay = getOverlay();
        if (!overlay) return;

        overlay.innerHTML =
            '<div class="stats-row"><span class="stats-label">Video:</span> <span class="stats-value ' + (videoBitrate < 100 ? 'stats-bad' : 'stats-ok') + '">' + videoBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Audio:</span> <span class="stats-value stats-ok">' + audioBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Res:</span> <span class="stats-value stats-ok">' + videoWidth + 'x' + videoHeight + ' @' + videoFps + 'fps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Avail BW:</span> <span class="stats-value ' + (availBw > 0 && availBw < 1000 ? 'stats-bad' : 'stats-ok') + '">' + availBw + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">RTT:</span> <span class="stats-value ' + (rtt > 200 ? 'stats-bad' : 'stats-ok') + '">' + rtt + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Jitter:</span> <span class="stats-value ' + (jitter > 30 ? 'stats-bad' : 'stats-ok') + '">' + jitter + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Pkt Loss:</span> <span class="stats-value ' + (packetsLost > 0 ? 'stats-bad' : 'stats-ok') + '">' + packetsLost + '</span></div>';
    }

    function renderFromSDKStats(stats) {
        var videoBitrate = 0, audioBitrate = 0;
        var videoWidth = 0, videoHeight = 0, videoFps = 0;
        var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;

        try {
            // The SDK stats object structure varies by version.
            // Try multiple known formats.

            // Format 1: stats.video / stats.audio arrays (parsed format)
            if (stats.video && stats.video.length > 0) {
                var v = stats.video[0];
                videoBitrate = Math.round((v.bitrate || 0) / 1000);
                videoWidth = v.frameWidth || v.width || 0;
                videoHeight = v.frameHeight || v.height || 0;
                videoFps = v.framesPerSecond || v.fps || 0;
                packetsLost = v.packetsLost || v.totalPacketsLost || 0;
                jitter = Math.round((v.jitter || 0) * 1000);
            }
            if (stats.audio && stats.audio.length > 0) {
                var a = stats.audio[0];
                audioBitrate = Math.round((a.bitrate || 0) / 1000);
                if (!jitter && a.jitter) jitter = Math.round(a.jitter * 1000);
                if (!packetsLost && a.packetsLost) packetsLost = a.packetsLost;
            }

            // Format 2: stats.totalRoundTripTime or stats.currentRoundTripTime
            if (stats.candidatePair || stats.selectedCandidatePair) {
                var cp = stats.candidatePair || stats.selectedCandidatePair;
                rtt = Math.round((cp.currentRoundTripTime || 0) * 1000);
                availBw = Math.round((cp.availableOutgoingBitrate || 0) / 1000);
            }

            // Format 3: Flat stats properties
            if (!rtt && stats.roundTripTime) rtt = Math.round(stats.roundTripTime * 1000);
            if (!rtt && stats.currentRoundTripTime) rtt = Math.round(stats.currentRoundTripTime * 1000);
            if (!availBw && stats.availableOutgoingBitrate) availBw = Math.round(stats.availableOutgoingBitrate / 1000);

            // Format 4: raw stats with totalBitrate
            if (!videoBitrate && stats.totalBitrate) videoBitrate = Math.round(stats.totalBitrate / 1000);
            if (!videoBitrate && stats.bitrate) videoBitrate = Math.round(stats.bitrate / 1000);

            // Format 5: output.video / output.audio (another SDK version format)
            if (stats.output) {
                if (stats.output.video && stats.output.video.length > 0) {
                    var ov = stats.output.video[0];
                    if (!videoBitrate) videoBitrate = Math.round((ov.bitrate || 0) / 1000);
                    if (!videoWidth) videoWidth = ov.frameWidth || 0;
                    if (!videoHeight) videoHeight = ov.frameHeight || 0;
                    if (!videoFps) videoFps = ov.framesPerSecond || 0;
                }
                if (stats.output.audio && stats.output.audio.length > 0) {
                    var oa = stats.output.audio[0];
                    if (!audioBitrate) audioBitrate = Math.round((oa.bitrate || 0) / 1000);
                }
            }

            // Format 6: raw property (contains the raw RTCStatsReport data)
            if (stats.raw && typeof stats.raw.forEach === 'function') {
                stats.raw.forEach(function (stat) {
                    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                        if (!videoWidth) videoWidth = stat.frameWidth || 0;
                        if (!videoHeight) videoHeight = stat.frameHeight || 0;
                        if (!videoFps) videoFps = stat.framesPerSecond || 0;
                    }
                    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                        if (!rtt) rtt = Math.round((stat.currentRoundTripTime || 0) * 1000);
                        if (!availBw) availBw = Math.round((stat.availableOutgoingBitrate || 0) / 1000);
                    }
                    if (stat.type === 'remote-inbound-rtp') {
                        if (!jitter) jitter = Math.round((stat.jitter || 0) * 1000);
                        if (!packetsLost && stat.packetsLost) packetsLost = stat.packetsLost;
                    }
                });
            }
        } catch (e) {
            console.warn('[Stats] Error parsing SDK stats:', e.message);
        }

        renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost);
    }

    function renderFromRawStats(report) {
        var videoBitrate = 0, audioBitrate = 0;
        var videoWidth = 0, videoHeight = 0, videoFps = 0;
        var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;
        var nowBytesSentVideo = 0, nowBytesSentAudio = 0, nowTimestamp = 0;

        report.forEach(function (stat) {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                nowBytesSentVideo = stat.bytesSent || 0;
                nowTimestamp = stat.timestamp || Date.now();
                videoWidth = stat.frameWidth || 0;
                videoHeight = stat.frameHeight || 0;
                videoFps = stat.framesPerSecond || 0;
            }
            if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
                nowBytesSentAudio = stat.bytesSent || 0;
                if (!nowTimestamp) nowTimestamp = stat.timestamp || Date.now();
            }
            if (stat.type === 'remote-inbound-rtp') {
                if (stat.jitter) jitter = Math.round(stat.jitter * 1000);
                if (stat.packetsLost) packetsLost = stat.packetsLost;
                if (stat.roundTripTime) rtt = Math.round(stat.roundTripTime * 1000);
            }
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                if (stat.currentRoundTripTime) rtt = Math.round(stat.currentRoundTripTime * 1000);
                if (stat.availableOutgoingBitrate) availBw = Math.round(stat.availableOutgoingBitrate / 1000);
            }
        });

        if (prevTimestamp > 0 && nowTimestamp > prevTimestamp) {
            var elapsed = (nowTimestamp - prevTimestamp) / 1000;
            videoBitrate = Math.round(((nowBytesSentVideo - prevBytesSentVideo) * 8) / elapsed / 1000);
            audioBitrate = Math.round(((nowBytesSentAudio - prevBytesSentAudio) * 8) / elapsed / 1000);
            if (videoBitrate < 0) videoBitrate = 0;
            if (audioBitrate < 0) audioBitrate = 0;
        }
        prevBytesSentVideo = nowBytesSentVideo;
        prevBytesSentAudio = nowBytesSentAudio;
        prevTimestamp = nowTimestamp;

        renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost);
    }

    var loggedSDKOnce = false;
    var loggedManualOnce = false;

    function onSDKStats(stats) {
        sdkStatsReceived = true;
        if (!loggedSDKOnce) {
            loggedSDKOnce = true;
            console.log('[Stats] First SDK stats event received. Keys:', Object.keys(stats));
            try {
                console.log('[Stats] SDK stats sample:', JSON.stringify(stats, null, 2).substring(0, 2000));
            } catch (e) {
                console.log('[Stats] SDK stats (non-serializable):', stats);
            }
        }
        if (manualPollTimer) {
            clearInterval(manualPollTimer);
            manualPollTimer = null;
            console.log('[Stats] SDK stats working, stopped manual fallback');
        }
        renderFromSDKStats(stats);
    }

    function getRTCPeerConnection() {
        var pub = window._publisher || window.millicastPublish;
        if (!pub) return null;

        if (typeof pub.getRTCPeerConnection === 'function') {
            try { var pc = pub.getRTCPeerConnection(); if (pc) return pc; } catch (e) {}
        }

        var peer = pub.webRTCPeer;
        if (peer) {
            if (typeof peer.getRTCPeer === 'function') {
                try { var pc = peer.getRTCPeer(); if (pc) return pc; } catch (e) {}
            }
            if (typeof peer.getRTCPeerConnection === 'function') {
                try { var pc = peer.getRTCPeerConnection(); if (pc) return pc; } catch (e) {}
            }
            if (peer.peer && peer.peer instanceof RTCPeerConnection) return peer.peer;
            if (peer.pc && peer.pc instanceof RTCPeerConnection) return peer.pc;
        }

        return null;
    }

    function manualStatsPoll() {
        if (sdkStatsReceived) return;
        var pc = getRTCPeerConnection();
        if (!pc) {
            console.log('[Stats] Manual fallback: RTCPeerConnection not available yet');
            return;
        }
        if (!loggedManualOnce) {
            loggedManualOnce = true;
            console.log('[Stats] Manual fallback active: polling RTCPeerConnection.getStats()');
        }
        pc.getStats(null).then(function (report) {
            if (!isCollecting) return;
            renderFromRawStats(report);
        }).catch(function (err) {
            console.warn('[Stats] Manual getStats() error:', err.message);
        });
    }

    function startStats() {
        if (isCollecting) return;
        isCollecting = true;
        sdkStatsReceived = false;
        loggedSDKOnce = false;
        loggedManualOnce = false;
        prevBytesSentVideo = 0;
        prevBytesSentAudio = 0;
        prevTimestamp = 0;
        var overlay = getOverlay();
        if (overlay) overlay.style.display = 'block';
        console.log('[Stats] Starting stats collection');
        attachStatsListener();
    }

    function attachStatsListener() {
        if (statsListenerAttached) return;
        var pub = window._publisher || window.millicastPublish;
        if (!pub) {
            console.log('[Stats] window._publisher not available, retrying in 1s...');
            setTimeout(attachStatsListener, 1000);
            return;
        }
        var peer = pub.webRTCPeer;
        if (!peer) {
            console.log('[Stats] webRTCPeer not available, retrying in 1s...');
            setTimeout(attachStatsListener, 1000);
            return;
        }

        // Primary: SDK's built-in stats event
        peer.on('stats', onSDKStats);
        statsListenerAttached = true;
        console.log('[Stats] Attached SDK stats listener to webRTCPeer');

        if (typeof peer.initStats === 'function') {
            try {
                peer.initStats();
                console.log('[Stats] Called initStats() on webRTCPeer');
            } catch (e) {
                console.log('[Stats] initStats() skipped (may already be active)');
            }
        }

        // Fallback: Start manual getStats() polling after 3s if SDK event hasn't fired
        setTimeout(function () {
            if (!sdkStatsReceived && isCollecting) {
                console.log('[Stats] SDK stats event not received after 3s, starting manual fallback');
                manualPollTimer = setInterval(manualStatsPoll, 1000);
            }
        }, 3000);
    }

    function stopStats() {
        isCollecting = false;
        sdkStatsReceived = false;

        if (statsListenerAttached) {
            var pub = window._publisher || window.millicastPublish;
            if (pub && pub.webRTCPeer) {
                try { pub.webRTCPeer.removeListener('stats', onSDKStats); } catch (e) {}
            }
            statsListenerAttached = false;
        }

        if (manualPollTimer) {
            clearInterval(manualPollTimer);
            manualPollTimer = null;
        }

        var overlay = getOverlay();
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }
        console.log('[Stats] Stopped stats collection');
    }

    // Listen for broadcast lifecycle events from publisher_multi.js
    window.addEventListener('publisherBroadcastStart', startStats);
    window.addEventListener('publisherBroadcastStop', stopStats);

    // Fallback: poll the LIVE badge visibility every 2s to detect broadcast state.
    function pollLiveBadge() {
        var liveBadge = document.getElementById('liveBadge');
        if (!liveBadge) return;
        var isLive = !liveBadge.classList.contains('hidden');
        if (isLive && !isCollecting) {
            console.log('[Stats] Detected LIVE badge visible - starting stats (fallback)');
            startStats();
        } else if (!isLive && isCollecting) {
            console.log('[Stats] Detected LIVE badge hidden - stopping stats (fallback)');
            stopStats();
        }
    }

    // Start polling after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            pollInterval = setInterval(pollLiveBadge, 2000);
        });
    } else {
        pollInterval = setInterval(pollLiveBadge, 2000);
    }

})();
