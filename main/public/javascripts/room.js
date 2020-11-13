import * as filetransfer from './filetransfer-main.js'

//Basic button setup
const textInput = $("#chat-text-input");
textInput.on("keypress", function (event) {
    if (event.which === 13 && !event.shiftKey) {
        event.preventDefault();
        const str = textInput.val();
        sendChatMessage(str).then(() => textInput.val(""));
    }
});

//For mixing
let canvasMix = document.getElementById('mix-canvas');
let ctxMix = canvasMix.getContext('2d');
let tallestVid = 0;
let widestVid = 0;
ctxMix.fillStyle = 'rgb(128, 192, 128)';
let mixStream = null;
let animationId = null;

// for audio
let audioContext = new window.AudioContext();
let micNodes = [];
let outputNodes = [];
let outputNode;
let audioMixStream;
let audioMixStreams = [];


// for filetransfer
let receiveBuffer = [];
let receivedSize = 0;
let statsInterval = null;


//Variables for network etc

let localVid = document.getElementById('local-video');
localVid.addEventListener("click", () => {
    if (nonMixerStreamsPaused) {
        resumeNonMixerStreams();
        nonMixerStreamsPaused = false;
    } else {
        pauseNonMixerStreams();
        nonMixerStreamsPaused = true;
    }
});
const sendFileButton = document.querySelector('button#sendFile');
sendFileButton.addEventListener('click', () => {
    console.log(dataChannels)
})

const dataChannels = {};
var RTCConnections = {};
var RTCConnectionsCallStatus = {};
var roomConnectionsSet = new Set();
var activeConnectionSize = 0;
let RTCConnectionNames = {};
var isMixingPeer = false;
let nonMixerStreamsPaused = false;
let mixingPeers = [];
let socket;
let roomID;
let nickName = "Anonymous";
let bitRates = {};
let frameEncodeTimes = {};
let benchmarkBuffers = {};
let benchmarkManualTimes = {};
const benchmarkSize = 1024 * 1024 * 4; // 4000kbytes = 4MB
const benchmarkPackSize = 1024 * 8 // 8 Kbytes
const benchmarkPacketNums = (benchmarkSize) / (benchmarkPackSize)
// mixed video stream
if (isMixingPeer) {
    mixStream = canvasMix.captureStream(15);
    animationId = window.requestAnimationFrame(drawCanvas)
}

function drawCanvas() {
    drawCanvasStripe();
    // animation frame will be drop down, when window is hidden.
    animationId = window.requestAnimationFrame(drawCanvas);
}

function drawCanvasStripe() {
    let index = 1;
    const localVideo = document.getElementById("local-video");
    drawVideoStripe(localVideo, 0, "-1");
    let remoteVid;
    for (var key in RTCConnections) {
        remoteVid = document.getElementById(key);
        if (remoteVid) {
            drawVideoStripe(remoteVid, index, key);
            index++;
        }
    }
}

function drawVideoStripe(videoElement, index, memberSocket) {
    /*let srcLeft = videoElement.videoWidth * (3.0 / 8.0);
    let srcTop = 0;
    let srcWidth = videoElement.videoWidth;
    let srcHeight = videoElement.videoHeight;
    let destWidth = mixWidth / (activeConnectionSize + 1);
    let destHeight = mixHeight / (activeConnectionSize + 1);*/
    let destLeft = canvasMix.width / (activeConnectionSize + 1) * index;
    let destTop = 0;
    if (videoElement.videoHeight > tallestVid) {
        tallestVid = videoElement.videoHeight;
    }
    if (videoElement.videoWidth > widestVid) {
        widestVid = videoElement.videoWidth;
    }

    /*
        ctxMix.drawImage(videoElement, destLeft, destTop, destWidth, destHeight);
    */
    // fill horizontally
    var hRatio = (canvasMix.width / videoElement.videoWidth) * videoElement.videoHeight;

    ctxMix.drawImage(videoElement, destLeft, 0, canvasMix.width / (activeConnectionSize + 1), hRatio / (activeConnectionSize + 1));
    if (memberSocket === "-1") {
        ctxMix.fillText(nickName, destLeft + 2, destTop + 10);

    } else {
        ctxMix.fillText(RTCConnectionNames[memberSocket], destLeft + 2, destTop + 10);
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
        console.log("Got 'answer-made': " + data.socket)
        await RTCConnections[data.socket].setRemoteDescription(
            new RTCSessionDescription(data.answer)
        );
        if (!dataChannels[data.socket]) {
            let newChannel = filetransfer.createChannel(RTCConnections[data.socket])
            newChannel.onmessage = onReceiveMessageCallback
            dataChannels[data.socket] = newChannel;
            console.log(dataChannels)
        }
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
        const answer = await RTCConnections[data.socket].createAnswer()
        await RTCConnections[data.socket].setLocalDescription(new RTCSessionDescription(answer));

        RTCConnections[data.socket].addEventListener('datachannel', (event) => {
            if (!dataChannels[data.socket]) {
                let dataChannel = event.channel || event;
                dataChannel.onmessage = onReceiveMessageCallback;
                filetransfer.configureChannel(dataChannel)
                dataChannels[data.socket] = dataChannel
            }
            console.log(dataChannels)
        })
        RTCConnections[data.socket].ondatachannel = (event) => {
            if (!dataChannels[data.socket]) {
                let dataChannel = event.channel || event;
                dataChannel.onmessage = onReceiveMessageCallback;
                filetransfer.configureChannel(dataChannel)
                dataChannels[data.socket] = dataChannel
            }
            console.log(dataChannels)
        }
        socket.emit("make-answer", {
            answer,
            to: data.socket
        });
    });
    socket.emit("request-user-list", roomID);
    socket.emit('identification', nickName);
    socket.emit("request-user-names");
}

function castRemoteStreamToFocus(socketId) {
    const alreadyExistingUser = document.getElementById(socketId);
    if (alreadyExistingUser !== false) {
        let focusVid = document.getElementById("VideoTab");
        focusVid.append(alreadyExistingUser);
    }
}

function gotRemoteStream(rtcTrackEvent, userId) {
    const video = document.getElementById(userId);
    if (video.srcObject !== rtcTrackEvent.streams[0]) {
        video.srcObject = rtcTrackEvent.streams[0];
    }
}


function getOntrackFunction(socketId) {
    return function ({streams: [stream]}) {
        const remoteVideo = document.getElementById(socketId);
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
        }
        if (isMixingPeer) {
            let micNode = audioContext.createMediaStreamSource(stream);
            micNodes[socketId] = micNode;
            console.log("Connected micnode " + socketId + " to my output node")
            micNode.connect(outputNode);
        }
    };
}

function initNewRTCConnection(socketId) {
    let rtcConnection = new RTCPeerConnection();
    rtcConnection.ontrack = getOntrackFunction(socketId);
    RTCConnections[socketId] = rtcConnection;
    activeConnectionSize++;
    RTCConnectionsCallStatus[socketId] = false;
    if (isMixingPeer) {
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, mixStream));
    } else {
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, window.localStream));
    }
    ctxMix.beginPath();
    ctxMix.rect(0, 0, widestVid, tallestVid);
    ctxMix.fillStyle = "black";
    ctxMix.fill();
}

function muteRemoteVideos() {
    roomConnectionsSet.forEach((s) => {
        const exists = document.getElementById(s);
        if (exists) {
            exists.volume = 0;
            console.log("Muted remote video: " + s)
        }
    })
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

let stoppedStream = false;
let stoppedStreams = {}

function toggleEncoding(id) {
    if (!stoppedStreams.hasOwnProperty(id)) {
        stoppedStreams[id] = false;
    }
    if (!stoppedStreams[id]) {
        let senders = RTCConnections[id].getSenders();
        for (let i = 0; i < senders.length; i++) {
            senders[i].replaceTrack(null).then(r => console.log("Stopped a track"))
        }
        stoppedStreams[id] = true;

    } else {
        let tracks = window.localStream.getTracks();
        let senders = RTCConnections[id].getSenders();
        for (let i = 0; i < senders.length; i++) {
            senders[i].replaceTrack(tracks[i]).then(r => console.log("Restarted a track"))
        }
        stoppedStreams[id] = false;
    }
}

function pauseNonMixerStreams() {
    for (const [sock, _] of Object.entries(RTCConnections)) {
        if (!mixingPeers.includes(sock)) {
            let senders = RTCConnections[sock].getSenders();
            for (let i = 0; i < senders.length; i++) {
                senders[i].replaceTrack(null).then(r => console.log("Stopped a track"))
            }
        }
    }
}

function resumeNonMixerStreams() {
    let tracks = window.localStream.getTracks();
    for (const [sock, _] of Object.entries(RTCConnections)) {
        if (!mixingPeers.includes(sock)) {
            let senders = RTCConnections[sock].getSenders();
            for (let i = 0; i < senders.length; i++) {
                senders[i].replaceTrack(tracks[i]).then(r => console.log("Restarted a track"))
            }
        }
    }
}

function toggleNonMixerStreams() {
    // OLD + USELESS
    // This method is meant to stop encoding videos, when we no longer want the mesh network
    // So we only encode video to the mixing peer
    if (!stoppedStream) {
        for (const [sock, _] of Object.entries(RTCConnections)) {
            if (!mixingPeers.includes(sock)) {
                let senders = RTCConnections[sock].getSenders();
                for (let i = 0; i < senders.length; i++) {
                    senders[i].replaceTrack(null).then(r => console.log("Stopped a track"))
                }
            }
        }
        stoppedStream = true;
    } else {
        let tracks = window.localStream.getTracks();
        for (const [sock, _] of Object.entries(RTCConnections)) {
            if (!mixingPeers.includes(sock)) {
                let senders = RTCConnections[sock].getSenders();
                for (let i = 0; i < senders.length; i++) {
                    senders[i].replaceTrack(tracks[i]).then(r => console.log("Restarted a track"))
                }
            }
        }
    }
}

function gotStream(stream) {
    console.log('Received local stream');
    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = stream;
    window.localStream = stream;
    audioContext.resume();
    if (isMixingPeer) {
        window.localStream = mixStream;
        outputNode = audioContext.createMediaStreamDestination();
        audioMixStream = outputNode.stream;
        let micNode = audioContext.createMediaStreamSource(stream);
        micNode.connect(outputNode)
        window.localStream.addTrack(audioMixStream.getAudioTracks()[0])
    } else {
        window.localStream.addTrack(stream.getAudioTracks()[0])
    }
}

async function benchMarkAllKnownPeers() {
    for (const [sock, _] of Object.entries(dataChannels)) {
        await benchMarkPeer(sock);
    }
}

function becomeMixer() {
    mixStream = canvasMix.captureStream(15);
    animationId = window.requestAnimationFrame(drawCanvas)
    isMixingPeer = true;
    const localVideo = document.getElementById("local-video");
    window.localStream = mixStream;
    outputNode = audioContext.createMediaStreamDestination();
    audioMixStream = outputNode.stream;
    let micNode = audioContext.createMediaStreamSource(localVideo.srcObject);
    micNode.connect(outputNode)
    window.localStream.addTrack(audioMixStream.getAudioTracks()[0])
    let tracks = window.localStream.getTracks();
    for (const [sock, _] of Object.entries(RTCConnections)) {
        const remoteVideo = document.getElementById(sock);
        if (remoteVideo) {
            let micNode = audioContext.createMediaStreamSource(remoteVideo.srcObject);
            micNodes[sock] = micNode;
            console.log("Connected micnode " + sock + " to my output node")
            micNode.connect(outputNode);
        } else {
            console.log("Something went wrong in getting audio for mixingPeerSwap")
        }
    }
    for (const [sock, _] of Object.entries(RTCConnections)) {
        console.log(RTCConnections[sock].getSenders());
        for (let i = 0; i < tracks.length; i++) {
            console.log(tracks[i].kind);
            var sender = RTCConnections[sock].getSenders().find(function (s) {
                return s.track.kind === tracks[i].kind;
            });
            sender.replaceTrack(tracks[i]).then(r => "Replaced track");
        }
    }
}

function bitRateEveryone() {
    for (const [sock, _] of Object.entries(RTCConnections)) {
        bitRateBenchMark(sock);
    }
    console.log(bitRates)
    console.log(frameEncodeTimes)
}

setInterval(bitRateEveryone, 1000 * 30);

function bitRateBenchMark(socketID) {
    if (!bitRates[socketID]) {
        bitRates[socketID] = [];
        frameEncodeTimes[socketID] = [];
    }

    RTCConnections[socketID].getStats().then(res => {
        res.forEach(report => {
            let bytes;
            let headerBytes;
            let packets;
            if (report.type === 'outbound-rtp') {
                var str = report.id;
                var str_pos = str.indexOf("Video");
                if (!(str_pos > -1)) {
                    // Ignores reports from 'audio' channels for instance. Video channels are the significant factor in bitrate
                    return
                }
                if (report.isRemote) {
                    return;
                }
                const now = report.timestamp;
                bytes = report.bytesSent;
                headerBytes = report.headerBytesSent;
                packets = report.packetsSent;

                if (lastResult[socketID] && lastResult[socketID].has(report.id)) {
                    const deltaFrames = report.framesEncoded - lastResult[socketID].get(report.id).framesEncoded;
                    const deltaTimeF = report.totalEncodeTime - lastResult[socketID].get(report.id).totalEncodeTime;
                    const avgFrameEncodeTimeSinceLast = deltaTimeF / deltaFrames;
                    const deltaT = now - lastResult[socketID].get(report.id).timestamp;
                    // calculate bitrate
                    const bitrate = 8 * (bytes - lastResult[socketID].get(report.id).bytesSent) /
                        deltaT;
                    const headerrate = 8 * (headerBytes - lastResult[socketID].get(report.id).headerBytesSent) /
                        deltaT;
                    bitRates[socketID].push(bitrate);
                    frameEncodeTimes[socketID].push(avgFrameEncodeTimeSinceLast);
                }
            }
        });
        lastResult[socketID] = res;
    });
}

function benchMarkPeer(socketID) {
    if (dataChannels.hasOwnProperty(socketID)) {
        //This part benchmarks by sending out 4mb arrays to each peer (array in segment of 8kb)
        var d = new Date(); // for now
        let start = d.getTime();
        var array = new Uint8Array(benchmarkPackSize);  // allocates KByte * 10
        array.fill(1)
        let data = {
            type: "benchmarkOut",
            origin: socket.id,
            ts: start,
            buff: Array.from(array)
        }
        let realdata = JSON.stringify(data);
        for (let i = 0; i < benchmarkPacketNums; i++) {
            dataChannels[socketID].send(realdata);
        }
    } else {
        console.log("Tried to benchmark a non-existing datachannel socket: " + socketID)
    }

}

function sendToAll(data) {
    for (const [_, dc] of Object.entries(dataChannels)) {
        dc.send(data)
    }
}

function onReceiveMessageCallback(event) {
    // console.log(`Received Message ${event.data}`);
    let data = JSON.parse(event.data)
    switch (data.type) {
        case "chat":
            postChatMessage(data.message, data.nickname)
            break;
        case "file":
            receiveBuffer.push(event.data);
            receivedSize += event.data.byteLength;
            receiveProgress.value = receivedSize;
            // we are assuming that our signaling protocol told
            // about the expected file size (and name, hash, etc).
            const file = fileInput.files[0];
            if (receivedSize === file.size) {
                const received = new Blob(receiveBuffer);
                receiveBuffer = [];
                downloadAnchor.href = URL.createObjectURL(received);
                downloadAnchor.download = file.name;
                downloadAnchor.textContent =
                    `Click to download '${file.name}' (${file.size} bytes)`;
                downloadAnchor.style.display = 'block';

                const bitrate = Math.round(receivedSize * 8 /
                    ((new Date()).getTime() - timestampStart));
                bitrateDiv.innerHTML =
                    `<strong>Average Bitrate:</strong> ${bitrate} kbits/sec (max: ${bitrateMax} kbits/sec)`;

                if (statsInterval) {
                    clearInterval(statsInterval);
                    statsInterval = null;
                }
            }
            break;
        case "benchmarkOut":
            if (!benchmarkBuffers.hasOwnProperty(data.origin)) {
                benchmarkBuffers[data.origin] = [];
            }
            console.log(benchmarkBuffers[data.origin].length)
            console.log(benchmarkSize)

            data.buff.forEach(byte => benchmarkBuffers[data.origin].push(byte));
            if (benchmarkBuffers[data.origin].length === benchmarkSize) {
                var d = new Date(); // for now
                console.log(d.getTime())
                console.log(data.ts)

                let deltaTS = (d.getTime() - data.ts) / 1000; //Diff in seconds
                let speed = benchmarkSize / deltaTS;
                let mBSSpeed = speed / (1024 * 1024);
                console.log("I AM SPEED mb/s: " + mBSSpeed);
                benchmarkManualTimes[data.origin] = mBSSpeed;
                let response = {
                    type: "benchMarkResponse",
                    origin: socket.id,
                    benchmark: mBSSpeed
                }
                dataChannels[data.origin].send(JSON.stringify(response))
                benchmarkBuffers[data.origin] = [];
            }
            break;
        case "benchMarkResponse":
            benchmarkManualTimes[data.origin] = data.benchmark;
            console.log(benchmarkManualTimes)
            break;
        case "mixerSignal":
            console.log("Got mixer signal from: " + data.origin);
            break;
        case "SomeSignalType":
            console.log("Here something should happen if i receive some message with type=SomeSignal")
            break;
        default:
            console.log("error: unknown message data type or malformed JSON format")
    }
}

let lastResult = {};

function sendMixerSignal() {
    let data = {
        type: "mixerSignal",
        origin: socket.id
    }
    sendToAll(JSON.stringify(data));
}

async function sendChatMessage(str) {
    let chatData = JSON.stringify({
        type: "chat",
        nickname: nickName,
        message: str
    })
    console.log(chatData)
    sendToAll(chatData)
    await postChatMessage(str, nickName)
}

async function postChatMessage(str, nickname) {
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
    chatEntryItem.innerHTML = '<p class="timestamp-chat">' + formattedTime + '(' + nickname + ') ' + '<span class="chat-message">' + str + '</span>' + '</p>'
    const chatloglist = document.getElementById("chat-log-list");
    if (chatloglist) {
        chatloglist.appendChild(chatEntryItem);
    }
}

function openPage(pageName, elmnt, color) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].style.backgroundColor = "";
    }
    document.getElementById(pageName).style.display = "block";
    elmnt.style.backgroundColor = color;
}

// Get the element with id="defaultOpen" and click on it
document.getElementById("defaultOpen").click();

dragElement(document.getElementById("local-video"));

function dragElement(elmnt) {
    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (document.getElementById(elmnt.id + "header")) {
        // if present, the header is where you move the DIV from:
        document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
