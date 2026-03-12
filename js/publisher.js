import MillicastPublishUserMedia from './MillicastPublishUserMedia.js'
const Director = millicast.Director
const Logger = millicast.Logger
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
window.Logger = Logger
const Publish = millicast.Publish
const mediaManager = millicast.MediaManager
const peerConnection = millicast.PeerConnection
const Signaling = millicast.Signaling

const params = new URLSearchParams(window.location.search);
let streamIdParam = params.get('streamId') || '';
let publishToken = params.get('token') || '';
let streamAccountId = '';
let streamName = '';

if (streamIdParam) {
    const parts = streamIdParam.split('/');
    if (parts.length >= 2) {
        [streamAccountId, streamName] = parts;
    } else {
        // if there’s no slash, treat the entire thing as streamName
        console.warn(`Invalid streamId format; expected "account/stream", got "${streamIdParam}"`);
        streamName = streamIdParam;
    }
}

// log what we ended up with
console.log('Stream account:', streamAccountId);
console.log('Stream name:   ', streamName);
console.log('Publish token: ', publishToken);

const disableVideo = false
const disableAudio = false
const disableStereo = false
const disableOrientation = true
let isBroadcasting = false
let isVideoMuted = false
let isAudioMuted = false
let millicastPublishUserMedia;
let activeMediaSource = 'camera'; // 'camera' or 'screen'
let activeStream = null; // To store the active media stream
let compositeAnimationId = null; //Composite mode for combined screen share


//Control Chrome Share messages
const banner = document.getElementById('shareBanner');
const stopBtn = document.getElementById('stopShareBtn');

function showBanner() { banner.classList.remove('hidden'); }
function hideBanner() { banner.classList.add('hidden'); }

stopBtn.addEventListener('click', () => {
    // trigger your stopScreenShare logic
    stopScreenShare();
});


//Viewer Share Link
document.addEventListener('DOMContentLoaded', () => {
    const shareBtn = document.getElementById('shareLinkBtn');
    shareBtn.addEventListener('click', () => {
        // build fresh each time, using the latest streamAccountId/streamName
        const url = `https://viewer.millicast.com/?streamId=${streamAccountId}/${streamName}`;
        window.open(url, '_blank');
    });
});

//COMBO for screen share WEBINAR GAME CAPTURE


document.addEventListener("DOMContentLoaded", async () => {
    const sourceIdInput = document.getElementById('sourceId'); // Ensure this is defined after DOM is loaded


    if (!sourceIdInput) {
        sourceId = sourceIdInput.value.trim() === "SourceId" ? null : sourceIdInput.value.trim();
        //console.error("Error: Element with ID 'sourceId' not found in the DOM.");
        return;
    }

    let dynamicStreamName = `${streamName}-${sourceId || validatedSourceId}`;

    console.log("Initial Source ID:", sourceId);
    console.log("Initial Stream Name:", dynamicStreamName);

    sourceIdInput.addEventListener('input', (event) => {
        dynamicStreamName = `${streamName}-${sourceId}`;
        //console.log("Updated Source ID:", sourceId || "Main");
        //console.log("Updated Stream Name:", dynamicStreamName);
    });

    const tokenGenerator = () => {
        const validatedSourceId = sourceId || "Main";
        console.log("Token Generator: Validated Source ID:", validatedSourceId);
        return Director.getPublisher(publishToken, `${streamName}-${validatedSourceId}`, validatedSourceId);
    };

    try {
        millicastPublishUserMedia = await MillicastPublishUserMedia.build(
            { streamName: dynamicStreamName, sourceId },
            tokenGenerator,
            true
        );
        console.log("millicastPublishUserMedia initialized with Stream Name:", dynamicStreamName);
    } catch (error) {
        console.error("Failed to initialize millicastPublishUserMedia:", error);
    }
});

//
document.addEventListener("DOMContentLoaded", async (event) => {
    $('.privy-popup-container, .privy-popup-content-wrap').click(e => {
        return false;
    })
    const videoWin = document.querySelector('video');
    const constraints = {

    }
    //check if mobile user.
    let isMobile = window.mobilecheck = function () {
        let check = false;
        (function (a) {
            if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
                a) ||
                /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
                    a.substr(0, 4))) {
                check = true;
            }
        })(navigator.userAgent || navigator.vendor || window.opera);
        return check;
    }();
    //console.log('*index*  isMobile: ', isMobile);
    if (!isMobile) {
        videoWin.setAttribute("class", "vidWinBrowser");
    }
    //GUI ELEMENTS Refs
    //video overlay
    //let viewUrlEl = document.getElementById('viewerURL');
    let readyFlag = document.getElementById('readyBadge');
    let onAirFlag = document.getElementById('liveBadge');
    let userCount = document.getElementById('userCount');

    //publish button
    let pubBtn = document.getElementById('publishBtn');
    //Cam elements
    let camsList = document.getElementById('camList'),
        camMuteBtn = document.getElementById('camMuteBtn');
    //Mic elements
    let micsList = document.getElementById('micList'),
        micMuteBtn = document.getElementById('micMuteBtn');
    //Share Copy element
    let cpy = document.getElementById('copyBtn');
    let ctrl = document.getElementById('ctrlUI');
    let view = document.getElementById('shareView');
    //Bandwidth Video element
    let elbandList = document.querySelectorAll('#bandwidthMenu>.dropdown-item');
    //Codec Video element
    let elcodecList = document.querySelectorAll('#codecMenu>.dropdown-item');
    //FPS Video element
    let elfpsList = document.querySelectorAll('#fpsMenu>.dropdown-item');
    //Aspect Video element
    let elaspectList = document.querySelectorAll('#aspMenu>.dropdown-item');

    // Publish & share sections
    let publishSection = document.getElementById('publishSection'),
        shareSection = document.getElementById('shareSection');

    // Function to toggle visibility of menu items with class "dropdown"

    window.cogOpen = function () {
        const dropdowns = document.querySelectorAll('.dropdown');
        dropdowns.forEach((dropdown) => {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
    };

//Mobile Orientation
    function handleOrientation() {
        let el = document.querySelector(".turnDeviceNotification");
        let elW = document.querySelector(".turnDeviceNotification.notification-margin-top");
        let thx = document.getElementById('thanks');
        const videoElement = document.querySelector("video");

        if (window.orientation === undefined || !thx.classList.contains('d-none')) {
            return;
        }

        // Get screen dimensions
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        switch (window.orientation) {
            case 90:
            case -90:
                /* Landscape mode */
                el.style.display = "none";
                elW.style.display = "none";
                if (videoElement) {
                    // Fit width to screen, adjust height for 16:9
                    videoElement.style.width = `${screenWidth}px`;
                    videoElement.style.height = `${(screenWidth / 16) * 9}px`;
                }
                break;
            default:
                /* Portrait mode */
                el.style.display = "block";
                elW.style.display = "none";
                if (videoElement) {
                    // Fit height to screen, adjust width for 9:16
                    videoElement.style.height = `${screenHeight}px`;
                    videoElement.style.width = `${(screenHeight / 16) * 9}px`;
                }
        }
    }

    let previousOrientation = window.orientation;

    let checkOrientation = function () {
        if (window.orientation !== previousOrientation) {
            previousOrientation = window.orientation;
        }
        handleOrientation();
    };

    // Ensure video fits on load
    function adjustVideoOnLoad() {
        const videoElement = document.querySelector("video");
        if (!videoElement) return;

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isLandscape = window.matchMedia("(orientation: landscape)").matches;

        if (isLandscape) {
            videoElement.style.width = `${screenWidth}px`;
            videoElement.style.height = `${(screenWidth / 16) * 9}px`;
        } else {
            videoElement.style.height = `${screenHeight}px`;
            videoElement.style.width = `${(screenHeight / 16) * 9}px`;
        }
    }

    // Set up listeners
    if (!disableOrientation) {
        window.addEventListener("resize", checkOrientation, false);
        window.addEventListener("orientationchange", checkOrientation, false);
        document.addEventListener("DOMContentLoaded", () => {
            checkOrientation();
            adjustVideoOnLoad();
        });
    }
    /////////////////////////
    const tokenGenerator = () => {
        const sourceIdInput = document.getElementById('sourceId');
        const sourceIdValue = sourceIdInput?.value.trim() || null;
        const validatedSourceId = sourceIdValue || "";
        console.log("Token Generator: Validated Source ID:", validatedSourceId);
        return Director.getPublisher(publishToken, streamName, validatedSourceId);
    };
    const millicastPublishUserMedia = window.millicastPublish = await MillicastPublishUserMedia.build({ streamName }, tokenGenerator, true)
    //Get MediaStream
    const options = {};
    let selectedBandwidthBtn = document.querySelector('#bandwidthMenuButton');
    let bandwidth = 0
    let selectedCodecBtn = document.querySelector('#codecMenuButton');
    let codec = 'h264';
    let selectedFpsBtn = document.querySelector('#fpsMenuButton');
    let fps = 30;
    let selectedAspBtn = document.querySelector('#aspMenuButton');
    let aspect = 1.7778;
    let selectedResolutionBtn;
    let resolution = 720;
    let width;

    //Need to define the bitrate to a resolution and source id
    const resolutionBitrateMap = {
        '120': 150, // 150 Kbps
        '240': 250, // 250 Kbps
        '360': 400, // 400 Kbps
        '480': 450, // 450 Kbps
        '540': 600, // 600 Kbps
        '640': 800, // 800 Kbps
        '720': 2000, // 2000 Kbps
        '1080': 6000, // 4000 Kbps
        '1440': 8000, // 8000 Kbps
        '2160': 10000  // 10000 Kbps
    };
    /// Setting the bitrate to the resolution based on resoltuion

    document.addEventListener("DOMContentLoaded", async () => {
        const sourceIdInput = document.getElementById('sourceId'); // Ensure this is defined after DOM is loaded

        if (!sourceIdInput) {
            return;
        }

        let sourceId = sourceIdInput.value.trim() === "SourceId" ? null : sourceIdInput.value.trim();
        let dynamicStreamName = `${streamName}-${sourceId || "Main"}`;

        console.log("Initial Source ID:", sourceId);
        console.log("Initial Stream Name:", dynamicStreamName);

        const tokenGenerator = () => {
            const validatedSourceId = sourceId || "Main";
            console.log("Token Generator: Validated Source ID:", validatedSourceId);
            return Director.getPublisher(publishToken, `${streamName}-${validatedSourceId}`, validatedSourceId);
        };

        try {
            millicastPublishUserMedia = await MillicastPublishUserMedia.build(
                { streamName: dynamicStreamName, sourceId },
                tokenGenerator,
                true
            );
            console.log("millicastPublishUserMedia initialized with Stream Name:", dynamicStreamName);
        } catch (error) {
            console.error("Failed to initialize millicastPublishUserMedia:", error);
        }
    });

    document.getElementById('resolutionMenu').addEventListener('click', async (event) => {
        const selectedResolution = event.target.getAttribute('data-resolution');
        if (!selectedResolution) return;

        console.log(`Attempting to update resolution to: ${selectedResolution}p`);

        if (resolutionBitrateMap[selectedResolution]) {
            const bitrate = resolutionBitrateMap[selectedResolution];
            console.log(`Resolution set to: ${selectedResolution}p, Bitrate set to: ${bitrate} Kbps`);

            if (millicastPublishUserMedia.isActive()) {
                try {
                    await millicastPublishUserMedia.webRTCPeer.updateBitrate(bitrate);
                    console.log(`Bitrate applied: ${bitrate} Kbps`);
                } catch (err) {
                    console.error('Failed to update bitrate:', err);
                }
            } else {
                console.log('Stream not active. Bitrate will apply when broadcast starts.');
            }
        } else {
            console.warn(`Warning: No bitrate mapping defined for the selected resolution: ${selectedResolution}p`);
        }
    });;

    //Screen Share

    //Overide Bitrate
    async function setMaxBitrate(bitrateKbps) {
        if (!millicastPublishUserMedia || !millicastPublishUserMedia.isActive()) {
            console.warn("Stream is not active, cannot set bitrate.");
            return;
        }

        const sender = millicastPublishUserMedia.webRTCPeer.getSenders().find(s => s.track.kind === 'video');
        if (!sender) {
            console.warn("No video sender found.");
            return;
        }

        const parameters = sender.getParameters();
        if (!parameters.encodings) {
            parameters.encodings = [{}];
        }

        parameters.encodings[0].maxBitrate = bitrateKbps * 1000; // Convert kbps to bps

        try {
            await sender.setParameters(parameters);
            console.log(`Max bitrate set to ${bitrateKbps} kbps.`);
        } catch (error) {
            console.error("Failed to set max bitrate:", error);
        }
    }
  

    //StreamID and Publishing Token

    
    document.getElementById('applyStreamConfig').addEventListener('click', () => {
        const sid = document.getElementById('streamIdInput').value.trim();
        const tok = document.getElementById('tokenInput').value.trim();

        // update our in-memory vars
        const parts = sid.split('/');
        if (parts.length >= 2) {
            [streamAccountId, streamName] = parts;
        } else {
            streamAccountId = '';        // or your default
            streamName = sid;
        }
        publishToken = tok;

        // rebuild the URL query
        const newParams = new URLSearchParams();
        if (streamAccountId && streamName) {
            newParams.set('streamId', `${streamAccountId}/${streamName}`);
        } else if (streamName) {
            newParams.set('streamId', streamName);
        }
        if (publishToken) {
            newParams.set('token', publishToken);
        }

        // push into the address bar (no reload)
        const newUrl = `${location.origin}${location.pathname}?${newParams}`;
        history.replaceState(null, '', newUrl);

        const viewerField = document.getElementById('viewerLinkField');
        viewerField.value = `https://viewer.millicast.com/?streamId=${streamAccountId}/${streamName}`;

    

        console.log('Applied Stream ID:', streamAccountId,'/',streamName);
        console.log('Applied Token:    ', publishToken);
    });
   

    // Screen sharing logic with proper integration
 
  
    let isScreenSharing = false;
    let originalStream = null;
    let compositeAnimation = null;

    // --- helper: mix any number of audio tracks into one ---
    async function mixAudioTracks(...trackArrays) {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        trackArrays.flat().forEach(track => {
            const src = ctx.createMediaStreamSource(new MediaStream([track]));
            src.connect(dest);
        });
        return dest.stream.getAudioTracks()[0];
    }

    // --- helper: replace both video & audio on peer + preview ---
    async function replaceActiveStream(stream) {
        const preview = document.getElementById('vidWin');
        preview.srcObject = stream;
        activeStream = stream;
        millicastPublishUserMedia.mediaManager.mediaStream = stream;

        if (millicastPublishUserMedia.isActive()) {
            const peer = millicastPublishUserMedia.webRTCPeer;
            const vTrack = stream.getVideoTracks()[0];
            const aTrack = stream.getAudioTracks()[0];

            await peer.replaceTrack(vTrack);
            console.log('✅ Video replaced');
            if (aTrack) {
                await peer.replaceTrack(aTrack);
                console.log('✅ Audio replaced');
            }
        }
    }

    // Need to stop screen share properly to go back to default camera
     let screenCleanup = null;

    async function stopScreenShare() {
        if (screenCleanup) {
            await screenCleanup();
            screenCleanup = null;
            hideBanner();       // if you show a chrome banner or UI flag
            videoWin.style.cursor = '';  // reset any custom cursor
            console.log('✅ Screen share stopped, reverted to camera.');
        }
    }

    // full startScreenShare implementation
    async function startScreenShare(mode) {
        let screenStream, cameraStream, canvasStream;
        let cleanup;

        try {
            //  save & mix your existing audio
            originalStream = activeStream;
            const oldAudio = originalStream.getAudioTracks();

            // grab screen + its audio // Only if Chrome you will see this.
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            const screenAudio = screenStream.getAudioTracks();

            // build videoTracks based on mode
            let videoTracks;
            if (mode === 'composite') {
                // grab camera (video only)
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640, max: 854},
                        height: { ideal: 360, max: 480 },
                        frameRate: { ideal: 24, max: 30 }
                    },
                    audio: false
                });

                // render both into hidden video adjust as needed.
                const screenVid = document.getElementById('screenVideo');
                const camVid = document.getElementById('cameraVideo');
                screenVid.srcObject = screenStream;
                camVid.srcObject = cameraStream;
                await screenVid.play().catch(() => { });
                await camVid.play().catch(() => { });




                // “composite” branch, after you’ve got screenStream & cameraStream …

                // Setup canvas at 16:9 using the screen’s width
                const canvas = document.getElementById('compositeCanvas');
                const ctx = canvas.getContext('2d');
                const s = screenStream.getVideoTracks()[0].getSettings();
                canvas.width = s.width || 1280;                  // e.g. 1280
                canvas.height = Math.floor(canvas.width * 9 / 16); // enforce 16:9

                // Compute camera overlay size from its natural aspect
                const camSets = cameraStream.getVideoTracks()[0].getSettings();
                const camAR = (camSets.width && camSets.height)
                    ? camSets.width / camSets.height
                    : 4 / 3;                           // fallback 4∶3
                const camW = Math.floor(canvas.width * 0.23);
                const camH = Math.floor(camW / camAR);

                // starting at bottom-right
                let overlayX = canvas.width - camW - 22;
                let overlayY = canvas.height - camH - 22;

                // dragging state
                let dragging = false, offsetX = 0, offsetY = 0;

                // Map mouse on video → canvas coords
                const videoWin = document.getElementById('vidWin');
                function mapToCanvasCoord(clientX, clientY) {
                    const rect = videoWin.getBoundingClientRect();
                    const xScale = canvas.width / rect.width;
                    const yScale = canvas.height / rect.height;
                    const x = (clientX - rect.left) * xScale;
                    const y = (clientY - rect.top) * yScale;
                    return { x, y };
                }

                // Drag handlers on the video element
                videoWin.style.cursor = 'move';
                videoWin.addEventListener('mousedown', e => {
                    const { x: mx, y: my } = mapToCanvasCoord(e.clientX, e.clientY);
                    if (mx >= overlayX && mx <= overlayX + camW &&
                        my >= overlayY && my <= overlayY + camH) {
                        dragging = true;
                        offsetX = mx - overlayX;
                        offsetY = my - overlayY;
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                    }
                });

                function onMouseMove(e) {
                    if (!dragging) return;
                    const { x: mx, y: my } = mapToCanvasCoord(e.clientX, e.clientY);
                    overlayX = Math.max(0, Math.min(canvas.width - camW, mx - offsetX));
                    overlayY = Math.max(0, Math.min(canvas.height - camH, my - offsetY));
                }

                function onMouseUp() {
                    dragging = false;
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                }

                // Draw loop
                function drawComposite() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    // full-screen screen‐share
                    ctx.drawImage(screenVid, 0, 0, canvas.width, canvas.height);
                    // camera overlay at new position
                    ctx.drawImage(camVid, overlayX, overlayY, camW, camH);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#fff';
                    ctx.strokeRect(overlayX, overlayY, camW, camH);
                    compositeAnimation = requestAnimationFrame(drawComposite);
                }
                drawComposite();

                // capture canvas video
                canvasStream = canvas.captureStream(30);
                videoTracks = canvasStream.getVideoTracks();

                // cleanup/composite stop handler
                screenCleanup = async () => {
                    cancelAnimationFrame(compositeAnimation);
                    [screenStream, cameraStream].forEach(s => s.getTracks().forEach(t => t.stop()));
                    screenVid.srcObject = camVid.srcObject = null;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    await replaceActiveStream(originalStream);
                    isScreenSharing = false;
                };
                screenStream.getVideoTracks()[0].onended = screenCleanup;
            }
            else {
                // screen-only
                videoTracks = screenStream.getVideoTracks();
                cleanup = async () => {
                    screenStream.getTracks().forEach(t => t.stop());
                    await replaceActiveStream(originalStream);
                    isScreenSharing = false;
                };
                screenStream.getVideoTracks()[0].onended = cleanup;
            }

            //  mix screen + old mic audio
            const mixedAudio = await mixAudioTracks(screenAudio, oldAudio);

            //  assemble the final stream
            const newStream = new MediaStream([
                ...videoTracks,
                mixedAudio
            ]);

            //  publish it
            await replaceActiveStream(newStream);
            isScreenSharing = true;
        }
        catch (err) {
            console.error('startScreenShare error:', err);
            if (cleanup) cleanup();
        }
    }

    //   End Screen Share
    document.addEventListener("DOMContentLoaded", () => {
        const elResolutionList = document.querySelectorAll("#resolutionMenu > .dropdown-item");
        elResolutionList.forEach((el) => el.addEventListener("click", onSetResolution));

        const elSimulcastList = document.querySelectorAll("#simulcastMenu > .dropdown-item");
        elSimulcastList.forEach((el) => el.addEventListener("click", onToggleSimulcast));
    });
    
    let selectedSimulcastBtn = document.querySelector('#simulcastMenuButton');
    let simulcast = false;

    const events = ['viewercount']
    ///Check before connenting

    function onBroadcastEvent(event) {
        const { name, data } = event;
        switch (name) {
            case 'active':
                // stream has gone live
                broadcastHandler({ name: 'publishStart', data });
                break;

            case 'inactive':
            case 'stopped':
                // stream stopped or disconnected
                broadcastHandler({ name: 'publishStop', data });
                break;

            case 'viewercount':
                // update your <span id="userCount">
                document.getElementById('userCount').textContent = data.viewercount;
                break;

            // optionally handle other events:
     
        }
    }

    // Attach it once, right after you create/build the publisher:
    millicastPublishUserMedia.on('broadcastEvent', onBroadcastEvent);

    const BroadcastMillicastStream = async () => {
     
        if (!codec) {
            console.error("Codec must be set before starting the broadcast.");
            return;
        }
        if (simulcast === undefined) {
            console.error("Simulcast must be set before starting the broadcast.");
            return;
        }
        if (!activeStream) {
            console.error("No active media stream available for broadcasting.");
            return;
        }

       
        // normalize sourceId
        const srcIn = document.getElementById('sourceId');
        let srcVal = srcIn?.value.trim() || '';
        if (srcVal === 'SourceId') srcVal = '';
        const validatedSourceId = srcVal;

      
        const vTracks = activeStream.getVideoTracks();
        if (!vTracks.length) {
            console.error("No video tracks in activeStream; cannot publish.");
            return;
        }

       
        let bandwidth = resolutionBitrateMap[resolution] || 2500;
        if (activeMediaSource === 'screen') bandwidth = 6000;

      
        millicastPublishUserMedia.removeAllListeners?.('broadcastEvent');
        millicastPublishUserMedia.on('broadcastEvent', event => {
            if (event.name === 'publishStart' || event.name === 'publishStop') {
                broadcastHandler(event);
            }
            else if (event.name === 'viewercount') {
                document.getElementById('userCount').textContent = event.data.viewercount;
            }
        });

        try {
      
            await millicastPublishUserMedia.connect({
                codec,
                simulcast,
                sourceId: validatedSourceId,
                bandwidth,
                mediaStream: activeStream,
                events: [
                    'active',       // triggers publishStart
                    'inactive',     // triggers publishStop
                    'viewercount',  // triggers our viewercount handler
                    'stopped'       // triggers publishStop
                ]
            });

            // — on success —
            isBroadcasting = true;
            console.log(`🚀 Broadcast started: ${streamName}`);

        
            await millicastPublishUserMedia.webRTCPeer.replaceTrack(vTracks[0]);
            console.log("✅ Video track replacement done.");

        } catch (err) {
            console.error("🛑 Broadcast Stopped:");
            //console.error("❌ Broadcast failed to start:", err);//Debug
            isBroadcasting = false;
            // fire your UI stop logic just in case
            broadcastHandler({ name: 'publishStop', data: {} });
        }
    };


    //Set Bitrate
    function setBitrate(bitrateKbps) {
        if (millicastPublishUserMedia.isActive()) {
            const sender = millicastPublishUserMedia.webRTCPeer.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                const parameters = sender.getParameters();
                if (!parameters.encodings) {
                    parameters.encodings = [{}];
                }
                parameters.encodings[0].maxBitrate = bitrateKbps * 1000; // Convert kbps to bps
                sender.setParameters(parameters)
                    .then(() => {
                        console.log(`Bitrate set to ${bitrateKbps} Kbps.`);
                    })
                    .catch(e => console.error('Error setting bitrate:', e));
            }
        }
    }


    const onSetVideoBandwidth = async (evt) => {
        try {
            selectedBandwidthBtn.disabled = true;
            bandwidth = parseInt(evt.target.dataset.rate, 10);
            selectedBandwidthBtn.innerHTML = `${bandwidth} kbps`;

            let peerConnection = millicastPublishUserMedia.webRTCPeer;

            if (millicastPublishUserMedia.isActive()) {
                console.log(`Updating bitrate to: ${bandwidth} kbps (Live Stream Active)`);

                // ✅ Use Millicast’s updateBitrate() API
                await peerConnection.updateBitrate(bandwidth);
                console.log(`Millicast API: Bitrate updated to ${bandwidth} kbps.`);
            } else {
                console.warn("Stream is not active. Bitrate setting will apply on start.");
                millicastPublishUserMedia.bandwidthPreset = bandwidth;
            }
        } catch (error) {
            console.error("Failed to update bitrate:", error);
        } finally {
            selectedBandwidthBtn.disabled = false;
        }
    };

    // Set Video Codec H265 availbe on Chrome now
    const onSetVideoCodec = async (evt) => {
        selectedCodecBtn.disabled = true;
        codec = evt.target.dataset.codec;
        selectedCodecBtn.innerHTML = codec === 'h264' ? 'Codec' : `${codec} `;
        if (!millicastPublishUserMedia.isActive()) {
            selectedCodecBtn.disabled = false;
        }
        else {
            try {
                await millicastPublishUserMedia.webRTCPeer.updateCodec(codec)
                console.log('codec updated')
            }
            catch (e) {
                onSetSessionDescriptionError(e)
            }
        }
        selectedCodecBtn.disabled = false;
    }

    /**
   * Function to set the frame rate dynamically and update the live stream
   * @param {Event} evt - The event triggered by selecting an FPS option.
   */
    const onSetVideoFps = async (evt) => {
        try {
            const fps = parseInt(evt.target.dataset.fps, 10);
            if (fps < 5) {
                console.warn("FPS is too low and may impact stream quality.");
            }
            selectedFpsBtn.disabled = true;

            const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];
            if (!videoTrack) {
                console.warn("No video track found to update FPS.");
                return;
            }

            const settings = videoTrack.getSettings();
            console.log("Current video settings:", settings);

            const newConstraints = {
                width: settings.width,
                height: settings.height,
                aspectRatio: settings.aspectRatio,
                frameRate: fps
            };

            console.log("Applying new FPS constraints:", newConstraints);
            await videoTrack.applyConstraints(newConstraints);

            await millicastPublishUserMedia.webRTCPeer.replaceTrack(videoTrack);

            // Update the dropdown UI (assuming you're using the button label to reflect it)
            selectedFpsBtn.innerHTML = `${fps} FPS`;

            const updated = videoTrack.getSettings();
            console.log(`✅ Frame rate applied: ${updated.frameRate} FPS`, updated);
        } catch (error) {
            console.error("Failed to update frame rate:", error);
        } finally {
            selectedFpsBtn.disabled = false;
        }
    };
    //const updatedSettings = videoTrack.getSettings();
    //console.log("Updated track settings:", updatedSettings);


    //////aspectRatio
    const onSetVideoAspect = async (evt) => {
        // Disable the aspect button while the change is processed
        selectedAspBtn.disabled = true;

        // Retrieve and set the desired aspect ratio from the event target
        aspect = parseFloat(evt.target.dataset.aspect);
        selectedAspBtn.innerHTML = aspect === 1.7778 ? 'Aspect' : `${aspect}`;

        // Check if the stream is active
        if (!millicastPublishUserMedia.isActive()) {
            selectedAspBtn.disabled = false;
            return; // Exit if the stream is not active
        }

        try {
            // Get the current video track from the media stream
            const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];

            // Apply the new aspect ratio constraint directly to the video track
            await videoTrack.applyConstraints({ aspectRatio: aspect });

            // Replace the current track in the WebRTC peer connection with the updated track
            await millicastPublishUserMedia.webRTCPeer.replaceTrack(videoTrack);

            console.log('Aspect ratio updated to', aspect);
        } catch (error) {
            console.error("Failed to update aspect ratio:", error);
            onSetSessionDescriptionError(error); // Call error handler if there's an issue
        }

        // Re-enable the aspect button after the update is complete
        selectedAspBtn.disabled = false;
    };
    /**
   * Updates the video resolution dynamically.
   * @param {Event} evt - The event triggered by selecting a resolution option.
   */

    const onSetResolution = async (evt) => {
        try {
            const resolution = parseInt(evt.target.dataset.resolution, 10);
            const aspectRatio = 16 / 9; // Default aspect ratio

            console.log(`Attempting to update resolution to: ${resolution}p`);

            // Update the UI button text
            selectedResolutionBtn.innerHTML = `${resolution}p`;

            // Retrieve the video track
            const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];
            if (!videoTrack) {
                console.warn("No video track found to update resolution.");
                return;
            }

            // Apply new constraints
            const newConstraints = {
                height: { ideal: resolution, max: 2160 }, // Adjust height constraint and will handle 4k
                //width: { ideal: 1280, max: 3640 },
                aspectRatio: aspectRatio,
                frameRate: fps, // Maintain frame rate
            };

            console.log("Applying resolution constraints:", newConstraints);
            await videoTrack.applyConstraints(newConstraints);

            console.log("Updated track settings after resolution change:", videoTrack.getSettings());
        } catch (error) {
            if (error.name === "OverconstrainedError") {
                console.warn("OverconstrainedError detected. Adjusting constraints to fallback resolution.");

                // Fallback to a lower resolution or default settings
                const fallbackConstraints = {
                    height: { ideal: resolution, max: 2160 },
                    //width: {ideal: 1280},
                    aspectRatio: 16 / 9,
                };

                try {
                    const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];
                    if (videoTrack) {
                        await videoTrack.applyConstraints(fallbackConstraints);
                        console.log("Fallback constraints applied successfully:", videoTrack.getSettings());
                    }
                } catch (fallbackError) {
                    console.error("Failed to apply fallback constraints:", fallbackError);
                }
            } else {
                console.error("Failed to update resolution:", error);
            }
            //Manually Set the BitRate to the Resolution
            try {
                const resolutionKey = event.target.getAttribute('data-resolution'); // e.g., "120", "240", etc.
                console.log(`Attempting to update resolution to: ${resolutionKey}p`);

                if (!resolutionBitrateMap[resolutionKey]) {
                    console.warn(`No bitrate defined for the selected resolution: ${resolutionKey}`);
                    return;
                }

                const bitrate = resolutionBitrateMap[resolutionKey]; // Retrieve the bitrate
                resolution = resolutionKey; // Update the resolution variable

                // Retrieve the video track
                const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];
                if (!videoTrack) {
                    console.warn("No video track found to update resolution.");
                    return;
                }

                // Apply new resolution constraints
                const newConstraints = {
                    height: { ideal: parseInt(resolutionKey, 10) },
                    aspectRatio: 16 / 9,
                    frameRate: 30, // Maintain frame rate
                };

                console.log("Applying resolution constraints:", newConstraints);
                await videoTrack.applyConstraints(newConstraints);

                // Update the bitrate dynamically
                if (millicastPublishUserMedia.isActive()) {
                    await millicastPublishUserMedia.webRTCPeer.updateBitrate(bitrate);
                    console.log(`Bitrate updated to: ${bitrate} Kbps`);
                } else {
                    console.log("Stream not active. Bitrate will apply when broadcast starts.");
                }

                console.log("Updated track settings after resolution change:", videoTrack.getSettings());
            } catch (error) {
                console.error("Failed to update resolution:", error);
            }

        }
    };

    // Ensure the checkbox is properly referenced and initialized
    // Ensure then it can only be applied to VP8/h264 with a minimum 5000 Kbps.
    //only working on h264 and vp8 at this point
    const simulcastCheckbox = document.getElementById('simulcastCheckbox');

    if (!simulcastCheckbox) {
        console.error("Simulcast checkbox element not found!");
    } else {
        simulcastCheckbox.addEventListener('change', async (event) => {
            const isChecked = simulcastCheckbox.checked;
            const currentCodec = codec; // Assuming `codec` is defined globally
            const currentBandwidth = bandwidth; // Assuming `bandwidth` is defined globally

            // Validate codec and bandwidth before enabling simulcast
            if (isChecked && !(currentCodec === 'h264' || currentCodec === 'vp8')) {
                //console.error("Simulcast can only be enabled for codecs H264 and VP8.");
                alert("Simulcast can only be enabled for codecs H264 and VP8.");
                simulcastCheckbox.checked = false; // Revert the checkbox state
                return;
            }

            if (isChecked && currentBandwidth < 4500) {
                // console.error("Simulcast requires a minimum bandwidth of 5000 kbps.");
                alert("Simulcast requires a minimum bandwidth of 5000 kbps for 1080p.");
                simulcastCheckbox.checked = false; // Revert the checkbox state
                return;
            }

            simulcast = isChecked;
            console.log(`Simulcast checkbox toggled: ${simulcast ? "Enabled" : "Disabled"}`);

            // Apply the change immediately if the stream is active
            if (millicastPublishUserMedia.isActive()) {
                try {
                    if (millicastPublishUserMedia.webRTCPeer.updateSimulcast) {
                        await millicastPublishUserMedia.webRTCPeer.updateSimulcast(simulcast);
                        console.log(`Simulcast ${simulcast ? 'enabled' : 'disabled'} during active broadcast.`);
                    } else {
                        console.warn("Simulcast toggle method is not available in webRTCPeer.");
                    }
                } catch (error) {
                    console.error("Failed to update simulcast dynamically:", error);
                }
            } else {
                console.log("Simulcast will take effect on the next broadcast.");
            }
        });
    }

    const toggleSimulcast = async () => {
        try {
            const enableSimulcast = simulcastCheckbox.checked; // Check state
            const currentCodec = codec; // Assuming `codec` is defined globally
            const currentBandwidth = bandwidth; // Assuming `bandwidth` is defined globally

            // Validate codec and bandwidth before enabling simulcast
            if (enableSimulcast && !(currentCodec === 'h264' || currentCodec === 'vp8')) {
                console.error("Simulcast can only be enabled for codecs H264 and VP8.");
                simulcastCheckbox.checked = false; // Revert the checkbox state
                return;
            }

            if (enableSimulcast && currentBandwidth < 5000) {
                alert("Simulcast requires a minimum bandwidth of 5000 kbps.");
                simulcastCheckbox.checked = false; // Revert the checkbox state
                return;
            }

            simulcast = enableSimulcast;

            console.log(`Simulcast set to: ${simulcast}`);

            if (millicastPublishUserMedia.isActive()) {
                if (millicastPublishUserMedia.webRTCPeer.updateSimulcast) {
                    await millicastPublishUserMedia.webRTCPeer.updateSimulcast(simulcast);
                    console.log(`Simulcast ${simulcast ? 'enabled' : 'disabled'}`);
                } else {
                    console.warn("Simulcast toggle method is not available in webRTCPeer.");
                }
            } else {
                console.log(
                    `Simulcast settings updated but will only take effect on the next broadcast.`
                );
            }
        } catch (error) {
            console.error("Failed to toggle simulcast:", error);
        }
    };

    /**
 * Applies all video track constraints collectively.
 */

    const applyAllConstraints = async () => {
        try {
            const videoTrack = millicastPublishUserMedia.mediaManager.mediaStream.getVideoTracks()[0];
            if (!videoTrack) {
                console.warn("No video track available for constraint updates.");
                return;
            }
            // Default camera set on Chrome may lock to 640x480
            const constraints = {
                height: { min: parseInt(selectedResolutionBtn.innerHTML), max: 2160 },
                //width: Math.round(parseInt(selectedResolutionBtn.innerHTML) * (16 / 9)),
                //width: { ideal: Math.round(parseInt(selectedResolutionBtn.innerHTML) * (16 / 9)) },

                frameRate: fps,
                aspectRatio: aspect,
            };

            console.log("Applying combined constraints:", constraints);
            await videoTrack.applyConstraints(constraints);

            console.log(
                "Updated track settings after applying constraints:",
                videoTrack.getSettings()
            );
        } catch (error) {
            console.error("Failed to apply constraints:", error);
        }
    };
    //See AUDIO track information DEBUG
    function logAudioTrackInfo() {
        if (!millicastPublishUserMedia || !millicastPublishUserMedia.mediaManager.mediaStream) {
            console.warn("No active media stream found.");
            return;
        }

        const audioTracks = millicastPublishUserMedia.mediaManager.mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.warn("No audio track found in the media stream.");
            return;
        }

        const audioTrack = audioTracks[0]; // Get the first audio track
        const settings = audioTrack.getSettings();

        console.log("🎤 Audio Track Information:");
        console.log(`  🔹 ID: ${audioTrack.id}`);
        console.log(`  🔹 Sample Rate: ${settings.sampleRate || "Unknown"} Hz`);
        console.log(`  🔹 Channel Count: ${settings.channelCount || "Unknown"} 🎧`);  // Key log
        console.log(`  🔹 Latency: ${settings.latency || "Unknown"} seconds`);
        console.log(`  🔹 Echo Cancellation: ${settings.echoCancellation ? "✅ Enabled" : "❌ Disabled"}`);
        console.log(`  🔹 Auto Gain Control: ${settings.autoGainControl ? "✅ Enabled" : "❌ Disabled"}`);
        console.log(`  🔹 Noise Suppression: ${settings.noiseSuppression ? "✅ Enabled" : "❌ Disabled"}`);
    }

    // Call this function after stream is initialized
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(logAudioTrackInfo, 3000); // Ensures stream is ready
    });


    // Call this function after media stream is initialized
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(logAudioTrackInfo, 3000); // Delay to ensure stream is initialized
    });

    function onSetSessionDescriptionError(error) {
        isBroadcasting = false;
        console.log('Failed to set session description: ' + error.toString());
    }
    //////////////////////////
    /* UI Initialization */
    async function initUI() {
        // Ensure the DOM is fully loaded and the button exists
        selectedResolutionBtn = document.querySelector('#resolutionMenuButton');
        if (!selectedResolutionBtn) {

            return;
        }
        //console.log("UI initialized, all event listeners are bound.");

        // Add resolution event listeners
        const elResolutionList = document.querySelectorAll("#resolutionMenu > .dropdown-item");
        elResolutionList.forEach((el) => {
            el.addEventListener("click", onSetResolution);
        });

        // Hide bandwidth selector if video is disabled
        if (disableVideo === true) {
            selectedBandwidthBtn.classList.add('d-none');
        }
        selectedBandwidthBtn.innerHTML = bandwidth === 0 ? 'Bitrate' : `${bandwidth} kbps`;

        // Bind events for bandwidth selection
        elbandList.forEach((el) => {
            el.classList.add('btn');
            el.addEventListener('click', onSetVideoBandwidth);
        });

        // Bind events for codec selection
        selectedCodecBtn.innerHTML = codec === 'h264' ? 'Codec' : `${codec}`;
        elcodecList.forEach((el) => {
            el.classList.add('btn');
            el.addEventListener('click', onSetVideoCodec);
        });

        // Bind events for FPS selection
        selectedFpsBtn.innerHTML = fps === 24 ? 'FPS' : `${fps}`;
        elfpsList.forEach((el) => {
            el.classList.add('btn');
            el.addEventListener('click', onSetVideoFps);
        });

        // Bind events for aspect ratio selection
        selectedAspBtn.innerHTML = aspect === 1.7778 ? 'Aspect' : `${aspect}`;
        elaspectList.forEach((el) => {
            el.classList.add('btn');
            el.addEventListener('click', onSetVideoAspect);
        });

        // Simulcast Menu Initialization
        const elSimulcastList = document.querySelectorAll("#simulcastMenu > .dropdown-item");
        elSimulcastList.forEach((el) => {
            el.addEventListener("click", (evt) => {
                onToggleSimulcast(evt);
                console.log(`Simulcast button updated to: ${evt.target.dataset.simulcast === "true" ? "Enabled" : "Disabled"}`);
            });
        });


        console.log("UI initialized, all event listeners are bound.");


        //stereo support
        let a = true;
        if (!disableStereo) {
            a = {
                channelCount: { ideal: 2 },
                echoCancellation: true
            }
        }
        console.log('constraints audio:', a, ' disableAudio:', (!disableAudio ? a : false));

        millicastPublishUserMedia.mediaManager.constraints = {
            audio: !disableAudio ? a : false,
            video: !disableVideo ? {
                //width:  {min:420, ideal:width, max:3840 }, //Mobile Does not like this set
                height: { min: 180, ideal: resolution, max: 2160 },
                aspectRatio: `${aspect} `,
                fps: `${fps} `
            } : false,
        };
        try {
            videoWin.srcObject = await millicastPublishUserMedia.getMediaStream()
            const devices = await millicastPublishUserMedia.devices

            displayDevices(devices)
        }
        catch (err) {
            console.error(err);
        }


        pubBtn.addEventListener('click', async (e) => {
            await BroadcastMillicastStream();
            if (pubBtn.value = 'STOP') {
                broadcastHandler()
                // millicastPublishUserMedia.stop();
            }
            if (pubBtn.value = 'Start' || isBroadcasting == false) {
                // millicastPublishUserMedia.stop();
            }
        })


        camMuteBtn.addEventListener('click', (e) => {
            if (millicastPublishUserMedia.muteMedia('video', !isVideoMuted)) {
                isVideoMuted = !isVideoMuted;
                let iconEl = document.querySelector('#camOnIcon');
                isVideoMuted ? iconEl.classList.add('fa-video-slash') : iconEl.classList.remove('fa-video-slash');
            }
        });


        micMuteBtn.addEventListener('click', (e) => {
            if (millicastPublishUserMedia.muteMedia('audio', !isAudioMuted)) {
                isAudioMuted = !isAudioMuted;
                let iconEl = document.querySelector('#micOnIcon');
                console.log("Mic is muted =  ", isAudioMuted)
                isAudioMuted ? iconEl.classList.add('fa-microphone-slash') : iconEl.classList.remove('fa-microphone-slash');
            }
        });

        //For the Viewer Link
        /*
        cpy.addEventListener('click', () => {
            doCopy();
            showGuide('guide2', false);
        });

        viewUrlEl.addEventListener('click', e => {
            //do not open browser if mobile.
           if (isMobile) {
                return doCopy();
            }
       
       let url = (viewUrlEl.textContent || viewUrlEl.innerText).trim();
            //console.log('openViewer: ', url);
            if (url.length === 0 || url === 'https://' || url === 'Must broadcast first') {
                alert('You need to start a broadcast first.');
                return false;
            } else {
                window.open(url, '_blank');
            }
        }); */
    }
    //Mic list to audio track to screen share
    /* Updated mic dropdown rebuild and highlighting */
    function displayDevices(data) {
        // Clear mic list
        while (micsList.firstChild) {
            micsList.removeChild(micsList.firstChild);
        }

        const mics = data.audioinput || [];
        mics.forEach(device => {
            const item = document.createElement('button');
            const label = device.label || 'Microphone';
            const isLoopback = /mix|loopback|blackhole|vb-audio/i.test(label);
            item.innerHTML = isLoopback ? `🎧 ${label}` : label;
            item.classList = 'dropdown-item use-hand';
            item.id = device.deviceId;
            micsList.appendChild(item);
        });

        // Inject processed speaker audio option
        const processedSpeakerItem = document.createElement('button');
        processedSpeakerItem.innerHTML = '🎧 Processed Speaker Audio';
        processedSpeakerItem.classList = 'dropdown-item use-hand';
        processedSpeakerItem.id = 'virtualProcessedSpeaker';
        micsList.appendChild(processedSpeakerItem);

        // Set up Web Audio API capture from screen share if available
        if (activeStream) {
            const screenAudio = activeStream.getAudioTracks().find(track => {
                const label = track.label?.toLowerCase() || '';
                return label.includes('tab') || label.includes('system') || label.includes('screen');
            });

            if (screenAudio) {
                try {
                    const context = new AudioContext();
                    const inputStream = new MediaStream([screenAudio]);
                    const source = context.createMediaStreamSource(inputStream);
                    const destination = context.createMediaStreamDestination();

                    // TODO: connect processing node if needed
                    source.connect(destination);

                    const processedTrack = destination.stream.getAudioTracks()[0];
                    const currentVideoTracks = videoWin.srcObject?.getVideoTracks() || [];
                    const newStream = new MediaStream([...currentVideoTracks, processedTrack]);

                    videoWin.srcObject = newStream;
                    activeStream = newStream;
                    millicastPublishUserMedia.mediaManager.mediaStream = newStream;

                    // Defer audio replacement until WebRTC connection is live
                    millicastPublishUserMedia.onConnected = async () => {
                        const senders = millicastPublishUserMedia.webRTCPeer?.getSenders?.() || [];
                        const audioSender = senders.find(sender => sender.track?.kind === 'audio');
                        if (audioSender) {
                            await audioSender.replaceTrack(processedTrack);
                            console.log("✅ Replaced audio track with Web Audio processed stream (onConnected)");
                        } else {
                            console.warn("⚠️ No audio sender found to replace (onConnected)");
                        }
                    };

                    const audioTabItem = document.createElement('button');
                    audioTabItem.innerHTML = `🎧 ${screenAudio.label || 'Tab Audio Active'}`;
                    audioTabItem.classList = 'dropdown-item disabled';
                    audioTabItem.id = 'audioTab';
                    micsList.appendChild(audioTabItem);
                } catch (err) {
                    console.error('❌ Failed to route tab audio through Web Audio API:', err);
                }
            }
        }

        // Device change listener to update mic list
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            const updatedDevices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = updatedDevices.filter(d => d.kind === 'audioinput');

            while (micsList.firstChild) {
                micsList.removeChild(micsList.firstChild);
            }

            audioInputs.forEach(device => {
                const item = document.createElement('button');
                const label = device.label || 'Microphone';
                const isLoopback = /mix|loopback|blackhole|vb-audio/i.test(label);
                item.innerHTML = isLoopback ? `🎧 ${label}` : label;
                item.classList = 'dropdown-item use-hand';
                item.id = device.deviceId;
                micsList.appendChild(item);
            });

            micsList.appendChild(processedSpeakerItem);
        });


        // Fallback UI display
        const audioTracks = activeStream?.getAudioTracks() || [];
        if (!audioTracks.length || audioTracks.every(t => t.readyState !== 'live')) {
            const item = document.createElement('div');
            item.classList = 'dropdown-item disabled';
            item.innerText = '⚠️ No audio track detected or audio is muted.';
            micsList.appendChild(item);
        }

        //Mic if Screen Share is used needs to be handled


        async function replaceAudioTrack(newAudioTrack) {
            try {
                // Stop old audio tracks to free device
                if (activeStream) {
                    activeStream.getAudioTracks().forEach(track => track.stop());
                }

                // Build new stream with the existing video track(s), if any
                const videoTracks = activeStream ? activeStream.getVideoTracks() : [];
                const newStream = new MediaStream([...videoTracks, newAudioTrack]);

                // Set for local preview
                videoWin.srcObject = newStream;
                activeStream = newStream;
                millicastPublishUserMedia.mediaManager.mediaStream = newStream;

                // Replace audio in WebRTC, if possible
                const peer = millicastPublishUserMedia.webRTCPeer;
                if (
                    millicastPublishUserMedia.isActive() &&
                    peer &&
                    typeof peer.getSenders === "function"
                ) {
                    const senders = peer.getSenders();
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) {
                        await audioSender.replaceTrack(newAudioTrack);
                        console.log("✅ Replaced audio track in WebRTC sender");
                    } else {
                        console.warn("⚠️ No audio sender found in WebRTC peer.");
                    }
                } else {
                    console.warn("⚠️ webRTCPeer.getSenders not available yet; audio will be active on next connect.");
                }

                // Log tracks for debug
                console.log("🔊 Now publishing tracks:", newStream.getTracks().map(t => t.kind + ":" + t.label));
            } catch (err) {
                console.error('❌ Failed to replace audio track:', err);
            }
        }


        // --- overwrite your old listener ---
        micsList.addEventListener('click', async (e) => {
            const btn = e.target;
            if (!btn || !btn.classList.contains('dropdown-item')) return;

            const deviceId = btn.id;

            // 1) “Processed Speaker Audio” special case
            if (deviceId === 'virtualProcessedSpeaker') {
                const screenAudio = activeStream.getAudioTracks().find(t => {
                    const l = (t.label || '').toLowerCase();
                    return l.includes('tab') || l.includes('system') || l.includes('screen');
                });
                if (!screenAudio) return;

                try {
                    // Route through WebAudio if you still want processing
                    const ctx = new AudioContext();
                    const src = ctx.createMediaStreamSource(new MediaStream([screenAudio]));
                    const dest = ctx.createMediaStreamDestination();
                    src.connect(dest);
                    const processed = dest.stream.getAudioTracks()[0];
                    await swapAudioTrack(processed, deviceId);
                } catch (err) {
                    console.error('❌ Failed to route tab audio:', err);
                }
                return;
            }

            //  Real mic
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: deviceId } },
                    video: false
                });
                const newAudioTrack = micStream.getAudioTracks()[0];
                if (!newAudioTrack) throw new Error('No track');

                await swapAudioTrack(newAudioTrack, deviceId);
            } catch (err) {
                console.error('❌ Switching mic failed:', err);
            }
        });

        // --- helper to swap in any new AudioTrack ---
        async function swapAudioTrack(newAudioTrack, selectedId) {
            // stop old audio so devices free up
            activeStream.getAudioTracks().forEach(t => t.stop());

            // build a stream with your existing video + new audio
            const videoTracks = activeStream.getVideoTracks();
            const merged = new MediaStream([...videoTracks, newAudioTrack]);
            videoWin.srcObject = merged;
            activeStream = merged;
            millicastPublishUserMedia.mediaManager.mediaStream = merged;

            // live-replace in Millicast
            const peer = millicastPublishUserMedia.webRTCPeer;
            if (millicastPublishUserMedia.isActive() && peer && typeof peer.replaceTrack === 'function') {
                await peer.replaceTrack(newAudioTrack);
                console.log('✅ Live audio track replaced');
            } else {
                console.warn('⚠️ replaceTrack() not available; audio will update on reconnect');
            }

            // highlight UI
            updateMicDropdownUI(selectedId);
            displayActiveDevice('mic');
        }

        // updateMicDropdownUI() — it already toggles the “active” class on the selected button


        async function replaceMic(deviceId) {
            // stop and drop old audio
            activeStream.getAudioTracks().forEach(t => t.stop());

            // get just the new mic
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
                video: false
            });
            const newAudioTrack = micStream.getAudioTracks()[0];

            // build a stream with your existing video + the new audio
            const videoTracks = activeStream.getVideoTracks();
            const merged = new MediaStream([...videoTracks, newAudioTrack]);

            // update preview & publisher
            videoWin.srcObject = merged;
            activeStream = merged;
            millicastPublishUserMedia.mediaManager.mediaStream = merged;

            // live‐replace the audio sender
            const audioSender = millicastPublishUserMedia.webRTCPeer
                .getSenders()
                .find(s => s.track.kind === 'audio');
            if (audioSender) {
                await audioSender.replaceTrack(newAudioTrack);
                console.log('✅ Audio track replaced live');
            } else {
                console.warn('⚠️ No audio sender found; will publish on next connect');
            }
        }

        //Update the 
        function updateMicDropdownUI(selectedId) {
            document.querySelectorAll('#micsList .dropdown-item').forEach(item => {
                if (item.id === selectedId) {
                    item.classList.add('active'); // Highlight the selected mic
                } else {
                    item.classList.remove('active');
                }
            });
        }


        //Camera 
        // Update camera list
        while (camsList.firstChild) {
            camsList.removeChild(camsList.firstChild);
        }

        const cams = data.videoinput || [];
        cams.forEach(device => {
            const item = document.createElement('button');
            item.innerHTML = device.label || 'Camera';
            item.classList = 'dropdown-item use-hand';
            item.id = device.deviceId;
            camsList.appendChild(item);
        });

        // ...existing code that adds camera devices...

        // Add both screen share options:
        const screenShareItem = document.createElement('button');
        screenShareItem.innerHTML = '🖥️ Screen Share';
        screenShareItem.classList = 'dropdown-item use-hand';
        screenShareItem.id = 'screenShareOnly';
        camsList.appendChild(screenShareItem);

        const screenCameraCompositeItem = document.createElement('button');
        screenCameraCompositeItem.innerHTML = '🖥️ Screen + Camera Overlay';
        screenCameraCompositeItem.classList = 'dropdown-item use-hand';
        screenCameraCompositeItem.id = 'screenCameraComposite';
        camsList.appendChild(screenCameraCompositeItem);


        displayActiveDevice();
    }


    /// Add after displayDevices camList
    camsList.addEventListener('click', async (e) => {
        const target = e.target;
        if (!target || !target.classList.contains('dropdown-item')) return;

        try {
            // Special virtual device handling
            if (target.id === 'screenShareOnly') {
                console.log("Switching to screen share (screen only)...");
                updateDropdownUI('Screen Share Only');
                await startScreenShare('screenOnly');
                return;
            }
            if (target.id === 'screenCameraComposite') {
                console.log("Switching to screen share + camera overlay...");
                updateDropdownUI('Screen + Camera Overlay');
                await startScreenShare('composite');
                return;
            }

            // Handle real camera devices (everything else)
            console.log(`Switching to camera: ${target.id}`);
            activeMediaSource = 'camera';

            const selectedCamera = [...camsList.children].find(item => item.id === target.id);
            if (!selectedCamera) {
                console.warn("Selected camera not found in dropdown list.");
                return;
            }

            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }

            updateDropdownUI(target.textContent);

            const cameraStream = await millicastPublishUserMedia.updateMediaStream('video', target.id);
            activeStream = cameraStream;
            videoWin.srcObject = cameraStream;

            if (millicastPublishUserMedia.isActive()) {
                const cameraTrack = cameraStream.getVideoTracks()[0];
                await millicastPublishUserMedia.webRTCPeer.replaceTrack(cameraTrack);
                console.log("Camera track replaced successfully.");
            }

            console.log(`Updated local preview and published camera to: ${target.textContent}`);
        } catch (error) {
            console.error("Error switching media source:", error);
        }
    });


    navigator.mediaDevices.enumerateDevices().then(async (devices) => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        // Avoid the default device
        const firstRealCamera = videoDevices.find(device => device.deviceId !== 'default') || videoDevices[0];

        if (!firstRealCamera) {
            console.warn("No video input devices found.");
            return;
        }

        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
        }

        await new Promise(resolve => setTimeout(resolve, 500)); // give time for cleanup
        console.log("🎥 Forcing capture from device:", firstRealCamera.label);

        // Strong 4K constraints if available test debug settings
        const constraints = {
            video: {
                deviceId: { exact: firstRealCamera.deviceId },
                width: { ideal: 3840 },
                height: { ideal: 2160 },
                frameRate: { ideal: 30, max: 60 },
                aspectRatio: 16 / 9
            },
            audio: true
        };


        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            activeMediaSource = 'camera';
            activeStream = stream;

            videoWin.srcObject = stream;
            millicastPublishUserMedia.mediaManager.mediaStream = stream;

            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            console.log(`✅ Camera initialized at: ${settings.width}x${settings.height} @ ${settings.frameRate || '?'}fps`);

            updateDropdownUI(firstRealCamera.label);

            // Optional: Warn if low resolution was returned
            if (settings.width <= 640 || settings.height <= 480) {
                console.warn("⚠️ Low resolution detected. Chrome may have defaulted to fallback settings.");
            }

        } catch (err) {
            console.error("❌ Failed to initialize camera:", err);
        }
    });



    /**
     * Updates the dropdown UI and <p> tag text to reflect the selected source.
     * @param {string} selectedLabel - The label of the selected source.
     */
    function updateDropdownUI(selectedLabel) {
        const camListItems = document.querySelectorAll('#camList .dropdown-item');
        const camListBtn = document.getElementById('camListBtn');
        let label = selectedLabel || 'Select Camera'; // Default text

        camListItems.forEach(item => {
            if (
                (item.id === 'screenShare' && activeMediaSource === 'screen') ||
                (activeMediaSource === 'camera' && item.textContent === selectedLabel)
            ) {
                // Highlight the active source
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update the dropdown button text
        camListBtn.querySelector('p').textContent = label;
        console.log("Dropdown updated with selected:", label);
    }


    console.log("Current activeMediaSource:", activeMediaSource);
    console.log("Current activeStream:", activeStream);

    function displayActiveDevice(type) {
        if (type === 'mic' || !type) {
            micListBtn.innerHTML = '<p>' + cleanLabel(millicastPublishUserMedia.activeAudio.label) + '</p><span class="boxCover"></span>';
        }
        if (type === 'cam' || !type) {
            const camListBtn = document.getElementById('camListBtn');
            camListBtn.innerHTML = '<p>' + (isScreenSharing ? 'Screen Share' : cleanLabel(millicastPublishUserMedia.activeVideo.label)) + '</p><span class="boxCover"></span>';
        }
    }


    function broadcastHandler(b) {
        if (isBroadcasting) {
            pubBtn.innerHTML = isBroadcasting ? 'Stop' : 'Start ';
            
            onAirFlag.classList.remove('hidden')
            readyFlag.classList.add('hidden')
         
            selectedBandwidthBtn.disabled = false;
        } else {
            onAirFlag.classList.add('hidden')
            readyFlag.classList.remove('hidden')

            pubBtn.disabled = false;
        }
        if (pubBtn.value = 'Stop' || isBroadcasting === true) {
            pubBtn.style.backgroundColor = "red";

        }
        if (isBroadcasting == false) {
            pubBtn.style.backgroundColor = "green";
            pubBtn.value = 'Start';

        }
        if (pubBtn.style.backgroundColor != "red") {
            millicastPublishUserMedia.stop();
            pubBtn.innerHTML = 'Start';
        }


    }
   

    /* UTILS */
    function cleanLabel(s) {
        if (s.indexOf('Default - ') === 0) {
            s = s.split('Default - ').join('');
        }
        return s;
    }

    function doCopy() {
        //add to clean text.
        let view = document.getElementById("viewerURL");
        let path = (view.textContent || view.innerText).trim();

        let txt = document.createElement('input');
        txt.type = 'text';
        txt.readonly = true;
        txt.value = path;
        txt.style.position = 'fixed';
        txt.style.left = '-9999px';
        document.body.appendChild(txt);
        //console.log('view: ', txt);

        let iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        //let txt = input;
        if (iOS) {
            console.log('IS iOS!');
            txt.setAttribute('contenteditable', true);
            txt.setAttribute('readonly', false);
            let range = document.createRange();
            range.selectNodeContents(txt);
            let s = window.getSelection();
            s.removeAllRanges();
            s.addRange(range);
            txt.setSelectionRange(0, 999999);
            txt.setAttribute('contenteditable', false);
            txt.setAttribute('readonly', true);
        } else {
            //console.log('NOT iOS!');
            txt.select();
        }
        document.execCommand('copy');
        alert('Copied to Clipboard!');
        document.body.removeChild(txt);
        return true;
    }

    initUI()

})
