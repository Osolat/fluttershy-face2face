//Basic button setup
const textInput = $("#chat-text-input");
textInput.on("keypress", function (event) {
    if (event.which === 13 && !event.shiftKey) {
        event.preventDefault();
        const str = textInput.val();
        postChatMessage(str).then(() => textInput.val(""));
    }
});

//For mixing
let canvasMix = document.getElementById('mix-canvas');
canvasMix.addEventListener('mousedown', clickMixCenter, false);
canvasMix.addEventListener('mousemove', moveMixCenter, false);

let ctxMix = canvasMix.getContext('2d');
ctxMix.fillStyle = 'rgb(128, 192, 128)';
let mixStream = null;
let animationId = null;

// for audio
let audioContext;
let micNodes = [];
let outputNodes = [];
let audioMixSterams = [];

canvasMix.addEventListener('click', function () {
    audioContext = new window.AudioContext();
    audioContext.resume().then(() => {
        console.log('Playback resumed successfully');
    });
});

// mixed video stream
mixStream = canvasMix.captureStream(15);
animationId = window.requestAnimationFrame(drawCanvas)

//To capture network type (unsupported in many browsers, useless)
var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
var type = connection.effectiveType;
console.log("Connection type changed from " + type + " to " + connection.effectiveType);

// ---- mix video ----
let videoPositionSet = [];
var element = document.getElementById('mix-canvas');
var positionInfo = element.getBoundingClientRect();
let mixWidth = positionInfo.width;
let mixHeight = positionInfo.height;
let halfWidth = mixWidth / 2;
let halfHeight = mixHeight / 2;
let smallWidth = mixWidth / 4;
let smallHeight = mixHeight / 4;
let largeWidth = mixWidth - smallWidth;
let largeheight = mixHeight - smallHeight;
let mixMode = 'stripe'; // 'stripe', 'horz-stripe', 'matrix-fusion', '3d', 'matrix'
resetVideoPosition();

//Variables for network etc
const peerConnection = new RTCPeerConnection();
var RTCConnections = {};
var RTCConnectionsCallStatus = {};
var roomConnectionsSet = new Set();
var activeConnectionSize = 0;
let RTCConnectionNames = {};
var isMixingPeer = true;
let socket;
let roomID;
let nickName = "Anonymous";

function resetVideoPosition() {
    videoPositionSet[0] = {left: 0, top: 0, width: halfWidth, height: halfHeight};
    videoPositionSet[1] = {left: 320, top: 0, width: halfWidth, height: halfHeight};
    videoPositionSet[2] = {left: 0, top: 240, width: halfWidth, height: halfHeight};
    videoPositionSet[3] = {left: 320, top: 240, width: halfWidth, height: halfHeight};

    // clear
    clearMixCanvas();
}

function drawCanvas() {
    drawCanvasStripe();
    // animation frame will be drop down, when window is hidden.
    animationId = window.requestAnimationFrame(drawCanvas);
}

function drawCanvasStripe() {
    let index = 1;
    const localVideo = document.getElementById("local-video");

    drawVideoStripe(localVideo, 0);
    for (var key in RTCConnections) {
        console.log("Loop: " + key)
        // check if the property/key is defined in the object itself, not in parent
        remoteVid = document.getElementById(key);
        if (remoteVid) {
            drawVideoStripe(remoteVid, index);
            index++;
        }
    }
}

function drawVideoStripe(videoElement, index) {

    let srcLeft = videoElement.videoWidth * (3.0 / 8.0);
    let srcTop = 0;
    let srcWidth = videoElement.videoWidth;
    let srcHeight = videoElement.videoHeight;


    let destLeft = canvasMix.width / (activeConnectionSize + 1) * index;
    let destTop = 0;
    let destWidth = mixWidth / (activeConnectionSize + 1);
    let destHeight = mixHeight / (activeConnectionSize + 1);
    /*
        ctxMix.drawImage(videoElement, destLeft, destTop, destWidth, destHeight);
    */
    // fill horizontally
    var hRatio = (canvasMix.width / videoElement.videoWidth) * videoElement.videoHeight;
    ctxMix.drawImage(videoElement, destLeft, 0, canvasMix.width / (activeConnectionSize + 1), hRatio / (activeConnectionSize + 1));

    ctxMix.fillText('member' + (index + 1), destLeft + 2, destTop + 10);
}

function clickMixCenter(evt) {
    //console.log("canvas mix clicked evt:", evt);
    if (evt.button === 0) {
        let rect = evt.target.getBoundingClientRect();
        let x = (evt.clientX - rect.left);
        let y = (evt.clientY - rect.top);
        console.log('x=' + x + ' ,y=' + y)
        setSplitVideo(x, y);
    }
}

function drawCanvasHorzStripe() {
    drawVideoHorzStripe(remoteVideo0, 0);
    drawVideoHorzStripe(remoteVideo1, 1);
    drawVideoHorzStripe(remoteVideo2, 2);
    drawVideoHorzStripe(remoteVideo3, 3);
}

function drawVideoHorzStripe(videoElement, index) {
    let srcLeft = 0;
    let srcTop = videoElement.videoHeight * (3.0 / 8.0);
    let srcWidth = videoElement.videoWidth;
    let srcHeight = videoElement.videoHeight / 4;

    let destLeft = 0;
    let destTop = mixHeight / 4 * index;
    let destWidth = mixWidth;
    let destHeight = mixHeight / 4;

    ctxMix.drawImage(videoElement, srcLeft, srcTop, srcWidth, srcHeight, destLeft, destTop, destWidth, destHeight);
    ctxMix.fillText('member' + (index + 1), destLeft + 2, destTop + 10);
}

function drawCanvasMatrixFusion() {
    let index = 1;
    const localVideo = document.getElementById("local-video");

    drawVideoMatrixFusion(localVideo, 0);
    for (var key in RTCConnections) {
        console.log("Loop: " + key)
        // check if the property/key is defined in the object itself, not in parent
        remoteVid = document.getElementById(key);
        if (remoteVid) {
            drawVideoMatrixFusion(remoteVid, index);
            index++;
        }
    }
}

function drawVideoMatrixFusion(videoElement, index) {
    let srcLeft = 0, destLeft = 0;
    if ((index === 1) || (index === 3)) {
        srcLeft = videoElement.videoWidth / 2;
        destLeft = mixWidth / 2;
    }

    let srcTop = 0, destTop = 0;
    if ((index === 2) || (index === 3)) {
        srcTop = videoElement.videoHeight / 2;
        destTop = mixHeight / 2;
    }

    let srcWidth = videoElement.videoWidth / 2;
    let srcHeight = videoElement.videoHeight / 2;
    let destWidth = mixWidth / 2;
    let destHeight = mixHeight / 2;

    ctxMix.drawImage(videoElement, srcLeft, srcTop, srcWidth, srcHeight, destLeft, destTop, destWidth, destHeight);
    ctxMix.fillText('member' + (index + 1), destLeft + 2, destTop + 10);
}

function drawCanvasCross() {
    drawVideoCross(remoteVideo0, 0);
    drawVideoCross(remoteVideo1, 1);
    drawVideoCross(remoteVideo2, 2);
    drawVideoCross(remoteVideo3, 3);
}

function drawVideoCross(videoElement, index) {
    let srcLeft, srcTop, srcWidth, srcHeight;
    let destLeft, destTop, destWidth, destHeight;
    let x0, y0, x1, y1, x2, y2;
    let captionX, captionY;


    if (index === 0) {
        // upper
        x0 = 0, y0 = 0;
        x1 = 640, y1 = 0;
        x2 = 320, y2 = 240;
        captionX = 50, captionY = 20;

        srcLeft = 0;
        srcTop = videoElement.videoHeight / 4;
        srcWidth = videoElement.videoWidth;
        srcHeight = videoElement.videoHeight / 2;

        destLeft = 0;
        destTop = 0;
        destWidth = mixWidth;
        destHeight = mixHeight / 2;
    } else if (index === 1) {
        // buttom
        x0 = 0, y0 = 480;
        x1 = 640, y1 = 480;
        x2 = 320, y2 = 240;
        captionX = 50, captionY = 460;

        srcLeft = 0;
        srcTop = videoElement.videoHeight / 4;
        srcWidth = videoElement.videoWidth;
        srcHeight = videoElement.videoHeight / 2;

        destLeft = 0;
        destTop = mixHeight / 2;
        destWidth = mixWidth;
        destHeight = mixHeight / 2;
    } else if (index === 2) {
        // left
        x0 = 0, y0 = 0;
        x1 = 0, y1 = 480;
        x2 = 320, y2 = 240;
        captionX = 20, captionY = 80;

        srcLeft = videoElement.videoWidth / 4;
        srcTop = 0;
        srcWidth = videoElement.videoWidth / 2;
        srcHeight = videoElement.videoHeight;

        destLeft = 0;
        destTop = 0;
        destWidth = mixWidth / 2;
        destHeight = mixHeight;
    } else if (index === 3) {
        // right
        x0 = 640, y0 = 0;
        x1 = 640, y1 = 480;
        x2 = 320, y2 = 240;
        captionX = 580, captionY = 80;

        srcLeft = videoElement.videoWidth / 4;
        srcTop = 0;
        srcWidth = videoElement.videoWidth / 2;
        srcHeight = videoElement.videoHeight;

        destLeft = mixWidth / 2;
        destTop = 0;
        destWidth = mixWidth / 2;
        destHeight = mixHeight;
    }

    ctxMix.save();

    // -- clip --
    ctxMix.beginPath();
    ctxMix.moveTo(x0, y0);
    ctxMix.lineTo(x1, y1);
    ctxMix.lineTo(x2, y2);
    ctxMix.lineTo(x0, y0);
    ctxMix.closePath();
    ctxMix.clip();

    // -- draw --
    ctxMix.drawImage(videoElement, srcLeft, srcTop, srcWidth, srcHeight, destLeft, destTop, destWidth, destHeight);
    ctxMix.fillText('member' + (index + 1), captionX, captionY);

    ctxMix.restore();
}

function clearMixCanvas() {
    ctxMix.fillRect(0, 0, mixWidth, mixHeight);
}

function drawCanvasMatrix() {
    let index = 1;
    const localVideo = document.getElementById("local-video");

    drawVideo(localVideo, 0);
    for (var key in RTCConnections) {
        console.log("Loop: " + key)
        // check if the property/key is defined in the object itself, not in parent
        remoteVid = document.getElementById(key);
        if (remoteVid) {
            drawVideo(remoteVid, index);
            index++;
        }
    }
}

function drawVideo(videoElement, index) {
    ctxMix.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight,
        videoPositionSet[index].left, videoPositionSet[index].top, videoPositionSet[index].width, videoPositionSet[index].height);
    ctxMix.fillText('member' + (index + 1), videoPositionSet[index].left + 2, videoPositionSet[index].top + 10);
}

function moveMixCenter(evt) {
    if (evt.buttons === 1 || evt.witch === 1) {
        let rect = evt.target.getBoundingClientRect();
        let x = (evt.clientX - rect.left);
        let y = (evt.clientY - rect.top);
        console.log('x=' + x + ' ,y=' + y)
        setSplitVideo(x, y);
    }
}

function setSplitVideo(x, y) {
    // clear
    clearMixCanvas();

    if (y < halfHeight) {
        if (x < halfWidth) {
            videoPositionSet[0] = {left: 0, top: 0, width: x, height: mixHeight * (x / mixWidth)};
            videoPositionSet[1] = {left: (mixWidth - x), top: 0, width: x, height: mixHeight * (x / mixWidth)};
            videoPositionSet[2] = {
                left: 0,
                top: mixHeight * ((mixWidth - x) / mixWidth),
                width: x,
                height: mixHeight * (x / mixWidth)
            };
            videoPositionSet[3] = {
                left: x,
                top: mixHeight * (x / mixWidth),
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
        } else {
            videoPositionSet[0] = {
                left: 0,
                top: 0,
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
            videoPositionSet[1] = {
                left: x,
                top: 0,
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
            videoPositionSet[2] = {
                left: 0,
                top: mixHeight * ((mixWidth - x) / mixWidth),
                width: x,
                height: (mixHeight * (x / mixWidth))
            };
            videoPositionSet[3] = {
                left: x,
                top: mixHeight * (x / mixWidth),
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
        }
    } else {
        videoPositionSet[0] = {left: 0, top: 0, width: x, height: mixHeight * (x / mixWidth)};
        videoPositionSet[1] = {left: x, top: 0, width: (mixWidth - x), height: mixHeight * ((mixWidth - x) / mixWidth)};

        if (x < halfWidth) {
            videoPositionSet[2] = {
                left: 0,
                top: mixHeight * ((mixWidth - x) / mixWidth),
                width: x,
                height: mixHeight * (x / mixWidth)
            };
            videoPositionSet[3] = {
                left: (mixWidth - x),
                top: mixHeight * ((mixWidth - x) / mixWidth),
                width: x,
                height: mixHeight * (x / mixWidth)
            };
        } else {
            videoPositionSet[2] = {
                left: 0,
                top: mixHeight * (x / mixWidth),
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
            videoPositionSet[3] = {
                left: x,
                top: mixHeight * (x / mixWidth),
                width: (mixWidth - x),
                height: mixHeight * ((mixWidth - x) / mixWidth)
            };
        }
    }
}

function authenticateUser() {
    var cook = document.cookie;
    if (!cook) {
        window.location.replace("..");
    }
    for (const splitKey in cook.split(';')) {
        var splitAroundEq = cook.split(';')[splitKey].split('=');
        if (splitAroundEq[0].trim() === "group-id") {
            roomID = splitAroundEq[1].trim();
        }
        if (splitAroundEq[0].trim() === "name") {
            nickName = splitAroundEq[1].trim();
        }
    }
    const header = document.getElementById("room-header-id");
    header.innerHTML = decodeURI(roomID);
    socket = io.connect(window.location.hostname, {query: {"group-id": roomID}});
    bootAndGetSocket().then(r => console.log("Setup finished"));
}

authenticateUser();

async function bootAndGetSocket() {
    await initLocalStream();
    // TODO: Handle different room IDs.
    socket.on('connect', (socket) => {
        console.log("Connected to discovery server through socket.");
    })

    socket.on("update-user-list", ({users}) => {
        console.log("Got 'update-user-list'");
        updateUserList(users);
    });

    socket.on("latest-names", (goym) => {
        RTCConnectionNames = JSON.parse(goym);
        for (const property in RTCConnections) {
            console.log(`${property}: ${RTCConnectionNames[property]}`);
        }
    });
    socket.on("remove-user", ({socketId}) => {
        const elToRemove = document.getElementById(socketId);
        if (elToRemove) {
            delete RTCConnections[socketId];
            activeConnectionSize--;
            delete RTCConnectionsCallStatus[socketId];
            delete RTCConnectionNames[socketId];
            roomConnectionsSet.delete(socketId);
            elToRemove.remove();
        }
    });

    socket.on("answer-made", async data => {
        console.log("Got 'answer-made'")
        await RTCConnections[data.socket].setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );

        if (!RTCConnectionsCallStatus[data.socket]) {
            callUser(data.socket);
            RTCConnectionsCallStatus[data.socket] = true;
        }
    });

    socket.on("call-made", async data => {
        console.log("Got 'call-made': " + data.socket)
        await RTCConnections[data.socket].setRemoteDescription(
            new RTCSessionDescription(data.offer)
        );
        const answer = await RTCConnections[data.socket].createAnswer();
        await RTCConnections[data.socket].setLocalDescription(new RTCSessionDescription(answer));
        socket.emit("make-answer", {
            answer,
            to: data.socket
        });
    });
    socket.emit("request-user-list", roomID);
    socket.emit('identification', nickName);
}

function castRemoteStreamToFocus(socketId) {
    const alreadyExistingUser = document.getElementById(socketId);
    if (alreadyExistingUser !== false) {
        let focusVid = document.getElementById("focus-video");
        focusVid.append(alreadyExistingUser);
    }
}

function gotRemoteStream(rtcTrackEvent, userId) {
    const video = document.getElementById(userId);
    if (video.srcObject !== rtcTrackEvent.streams[0]) {
        video.srcObject = rtcTrackEvent.streams[0];
    }
}

function initNewRTCConnection(socketId) {
    let rtcConnection = new RTCPeerConnection();
    rtcConnection.ontrack = function ({streams: [stream]}) {
        const remoteVideo = document.getElementById(socketId);
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
        }
    };
    RTCConnections[socketId] = rtcConnection;
    activeConnectionSize++;
    RTCConnectionsCallStatus[socketId] = false;
    if (isMixingPeer) {
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, mixStream));
    } else {
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, window.localStream));
    }
}

function updateUserList(socketIds) {
    const activeUserContainer = document.getElementById("active-user-container");
    socketIds.forEach(socketId => {
        roomConnectionsSet.add(socketId);
        const alreadyExistingUser = document.getElementById(socketId);
        if (!alreadyExistingUser) {
            const userContainerEl = createUserVideoItemContainer(socketId);
            userContainerEl.onclick = () => castRemoteStreamToFocus(socketId);
            activeUserContainer.appendChild(userContainerEl);
            initNewRTCConnection(socketId);
            callUser(socketId);
        }
    });
}

function createUserVideoItemContainer(socketId) {
    const userVideoContainerEl = document.createElement("div");
    const userVideoEl = document.createElement("video");
    userVideoEl.setAttribute("class", "active-user-video");
    userVideoEl.setAttribute("id", socketId);
    userVideoEl.setAttribute("autoplay", "true")
    userVideoContainerEl.appendChild(userVideoEl);
    return userVideoContainerEl;
}

function createUserItemContainer(socketId) {
    const userContainerEl = document.createElement("div");
    const usernameEl = document.createElement("p");
    userContainerEl.setAttribute("class", "active-user");
    userContainerEl.setAttribute("id", socketId);
    usernameEl.setAttribute("class", "username");
    usernameEl.innerHTML = `Socket: ${socketId}`;
    userContainerEl.appendChild(usernameEl);
    userContainerEl.addEventListener("click", () => {
        userContainerEl.setAttribute("class", "active-user active-user--selected");
        const talkingWithInfo = document.getElementById("talking-with-info");
        talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
        callUser(socketId);
    });
    return userContainerEl;
}

async function mixVideo() {
    console.log("Skyd mig nu")
}

async function initLocalStream() {
    console.log('Requesting local stream');
    await navigator.mediaDevices
        .getUserMedia({
            audio: true,
            video: true
        })
        .then(gotStream)
        .catch(e => console.log('getUserMedia() error: ', e));
}

async function callUser(socketId) {
    const offer = await RTCConnections[socketId].createOffer();
    await RTCConnections[socketId].setLocalDescription(new RTCSessionDescription(offer));
    console.log("Emitting call-user: " + socketId)
    socket.emit("call-user", {
        offer,
        to: socketId
    });
}

function gotStream(stream) {
    console.log('Received local stream');
    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = stream;
    window.localStream = stream;
    if (isMixingPeer){
        window.localStream = mixStream;
    }
}

async function postChatMessage(str) {
    console.log("Uploaded message: " + str);
    var ts = Date.now();
    var h = new Date(ts).getHours();
    var m = new Date(ts).getMinutes();
    var s = new Date(ts).getSeconds();
    h = (h < 10) ? '0' + h : h;
    m = (m < 10) ? '0' + m : m;
    s = (s < 10) ? '0' + s : s;

    var formattedTime = h + ':' + m + ':' + s + "  ";
    const chatEntryItem = document.createElement("li");
    chatEntryItem.innerHTML = '<p class="timestamp-chat">' + formattedTime + '(' + nickName + ') ' + '<span class="chat-message">' + str + '</span>' + '</p>'
    const chatloglist = document.getElementById("chat-log-list");
    if (chatloglist) {
        chatloglist.appendChild(chatEntryItem);
    }
}
