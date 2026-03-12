/**
 * ambisonic.js — Ambisonic / multiopus SDP transform for Dolby.io Publisher
 *
 * Provides SDP munging to replace standard opus/48000/2 with multiopus
 * for FOA (4ch), SOA (9ch), TOA (16ch), and 5.1 surround (6ch).
 *
 * Hooks into publisher_multi.js via:
 *   - window._publisher  (the MillicastPublishUserMedia instance)
 *
 * Usage from publisher_multi.js or other modules:
 *   window.ambisonicSDP.setOrder('foa');   // set ambisonic order
 *   window.ambisonicSDP.getOrder();        // get current order
 *   window.ambisonicSDP.getTransform();    // get sdpTransform function (or null)
 *
 * The sdpTransform should be passed via peerConfig when calling connect():
 *   const xform = window.ambisonicSDP.getTransform();
 *   if (xform) connectOpts.peerConfig = { sdpTransform: xform };
 */

(function () {
    'use strict';

    var ORDERS = {
        none:  null,
        foa:   { channels: 4,  label: 'FOA (4ch)',      order: 1 },
        soa:   { channels: 9,  label: 'SOA (9ch)',      order: 2 },
        toa:   { channels: 16, label: 'TOA (16ch)',     order: 3 },
        '5.1': { channels: 6,  label: '5.1 Surround',  order: null }
    };

    var activeOrder = 'none';

    /**
     * Set the ambisonic order. Call before starting broadcast.
     * @param {'none'|'foa'|'soa'|'toa'|'5.1'} order
     */
    function setOrder(order) {
        if (!(order in ORDERS)) {
            console.warn('[Ambisonic] Unknown order:', order, '- using none');
            order = 'none';
        }
        activeOrder = order;
        console.log('[Ambisonic] Order set to:', order);

        // If we have a publisher and a non-none order, re-acquire audio
        // with the correct channelCount so the mic actually delivers N channels
        if (order !== 'none' && ORDERS[order]) {
            reacquireAudio(ORDERS[order].channels);
        }
    }

    function getOrder() {
        return activeOrder;
    }

    /**
     * Re-acquire audio with exact channelCount constraint.
     */
    function reacquireAudio(channelCount) {
        var pub = window._publisher;
        if (!pub || !pub.mediaManager) return;
        try {
            var constraints = pub.mediaManager.constraints || {};
            if (!constraints.audio || typeof constraints.audio !== 'object') {
                constraints.audio = {};
            }
            constraints.audio.channelCount = { exact: channelCount };
            pub.mediaManager.constraints = constraints;
            console.log('[Ambisonic] Audio constraints updated: channelCount=' + channelCount);

            // Re-acquire media to apply the new constraint
            if (typeof pub.mediaManager.getMedia === 'function') {
                pub.mediaManager.getMedia(constraints).then(function (stream) {
                    console.log('[Ambisonic] Audio re-acquired with ' + channelCount + ' channels');
                    var audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        var settings = audioTracks[0].getSettings();
                        console.log('[Ambisonic] Actual channelCount:', settings.channelCount || 'unknown');
                    }
                }).catch(function (err) {
                    console.warn('[Ambisonic] Failed to re-acquire audio:', err.message);
                });
            }
        } catch (e) {
            console.warn('[Ambisonic] Error updating audio constraints:', e.message);
        }
    }

    /**
     * Returns an sdpTransform function for the current order, or null if none.
     * Pass to connect() via: connectOpts.peerConfig = { sdpTransform: fn }
     */
    function getTransform() {
        if (activeOrder === 'none' || !ORDERS[activeOrder]) return null;
        var config = ORDERS[activeOrder];

        return function sdpTransform(sdp) {
            console.log('[Ambisonic] Applying SDP transform for ' + config.label);
            var lines = sdp.split('\r\n');
            var out = [];
            var inAudio = false;

            for (var i = 0; i < lines.length; i++) {
                out.push(lines[i]);

                if (lines[i].indexOf('m=audio') === 0) {
                    inAudio = true;
                } else if (lines[i].indexOf('m=') === 0) {
                    inAudio = false;
                }

                // After a=rtpmap for opus, inject multiopus channel_mapping
                if (inAudio && /^a=rtpmap:\d+ opus\/48000\/2/.test(lines[i])) {
                    var pt = lines[i].match(/^a=rtpmap:(\d+)/)[1];
                    // Replace opus/48000/2 with multiopus/48000/N
                    out[out.length - 1] = 'a=rtpmap:' + pt + ' multiopus/48000/' + config.channels;
                    // Build channel_mapping
                    var mapping = [];
                    for (var j = 0; j < config.channels; j++) mapping.push(j);
                    var numStreams = Math.ceil(config.channels / 2);
                    var coupledStreams = Math.floor(config.channels / 2);
                    out.push('a=fmtp:' + pt + ' channel_mapping=' + mapping.join(',') +
                        ';num_streams=' + numStreams +
                        ';coupled_streams=' + coupledStreams);
                    console.log('[Ambisonic] Injected multiopus fmtp: ' + config.channels + ' channels, PT=' + pt);
                }
            }
            return out.join('\r\n');
        };
    }

    // Expose API on window
    window.ambisonicSDP = {
        setOrder: setOrder,
        getOrder: getOrder,
        getTransform: getTransform,
        ORDERS: ORDERS
    };

})();
