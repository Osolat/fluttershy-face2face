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
// let canvasForPeers = document.getElementById('mix-canvas');
let canvasForPeers = document.createElement('canvas');
canvasForPeers.width = 500;
canvasForPeers.height = 400;
let peerCanvasContext = canvasForPeers.getContext('2d');
peerCanvasContext.fillStyle = 'rgb(128, 192, 128)';

let canvasForMixers = document.createElement('canvas');
canvasForMixers.width = 500;
canvasForMixers.height = 400;
let mixerCanvasContext = canvasForMixers.getContext('2d');
mixerCanvasContext.fillStyle = 'rgb(128, 192, 128)';

let dummmyCanvas = document.createElement('canvas');
dummmyCanvas.width = 1;
dummmyCanvas.height = 1;
let dummyContext = dummmyCanvas.getContext('2d');
dummyContext.fillStyle = 'rgb(128, 192, 128)';

let tallestVid = 0;
let widestVid = 0;
let peerMixedStream = null;
let mixerMixedStream = null;
let animationId = null;
let mixingPeerCollection = new Set();
//mixingPeerCollection.add("34kg3h5ghj2gdywtquyd34")
//mixingPeerCollection.add("uifewgfbyu3u3y43gchgef")
//mixingPeerCollection.add("dgagagagawewe42342rhfh")

// for audio
let audioContext = new window.AudioContext();
audioContext.resume();
let dummyAudioStream = audioContext.createMediaStreamDestination().stream;
let dummyVideoStream = dummmyCanvas.captureStream();

let micNodes = [];
let outputNodes = [];
let outputNode;
let audioMixStream;
let audioMixStreams = [];


// for filetransfer
let peersReady = {};
let receiveBuffers = {};
let filemetadata = {};
let statsInterval = null;
let timestampStart = -1;


//Variables for network etc

//connectionOutgoing = {}
//connectionOutgoing[id_1] = {id_1, id_2, id_3}
let networkButton = document.getElementById('NetworkTab')
networkButton.addEventListener('click', () => {
    populateNetwork()
})

let localVid = document.getElementById('local-video');
localVid.addEventListener("click", () => {
    bruteForceElectionInMyFavour();
});
const sendFileButton = document.querySelector('button#sendFile');
sendFileButton.addEventListener('click', () => {
    if (!filetransfer.fileEmpty()) {
        sendMetaData()
    }
})

//Update the network graph by calling populateNetwork over and over after 3000 milliseconds
//setInterval(populateNetwork, 3000);

var simulate = 0

const dataChannels = {};
var RTCConnections = {};
var RTCConnectionsCallStatus = {};
var roomConnectionsSet = new Set();
var activeConnectionSize = 0;
let RTCConnectionNames = {};
var isMixingPeer = false;
//var useNetWorkSplit = true
let electionPointsReceived = {}
let nonMixerStreamsPaused = false;
let mixingPeers = [];
let socket;
let roomID;
let nickName = "Anonymous";
let bitRates = {};
let frameEncodeTimes = {};
let benchmarkBuffers = {};
let benchmarkResponses = {};
let peerElectionPoints = {};
let electionInitiated = false;
let electionNum = 0;
let allowedSubNetworkSize = 2;
let debugging = true;
//const benchmarkSize = 1024 * 1024 * 4; // 4000kbytes = 4MB
//const benchmarkSize = 1024 * 1024; // 1000kbytes = 1MB
const benchmarkSize = 1024 * 512; // 512kbytes = 0.5mb

const benchmarkPackSize = 1024 * 8 // 8 Kbytes
const benchmarkPacketNums = (benchmarkSize) / (benchmarkPackSize)
console.log(benchmarkPacketNums)

// for timesync

var tsync = timesync.create({
    peers: [], // start empty, will be updated at the start of every synchronization
    interval: 10000,
    delay: 200,
    timeout: 1000
});


function hashCode(string) {
    var hash = 0, i, chr;
    for (i = 0; i < string.length; i++) {
        chr = string.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function sendMetaData() {
    let file = fileInput.files[0];
    console.log(file);
    file.text().then(
        (v) => {
            let hash = hashCode(v)
            peersReady[hash] = 0;
            console.log(hash)
            let JSONdata = JSON.stringify({
                type: "file-metadata",
                name: file.name,
                size: file.size,
                filetype: file.type,
                hash: hash
            })
            sendToAll(JSONdata)
        }
    )
}

//Sets up the initial data for the network graph
if (isMixingPeer == true) {
    var netGraphTopologyData = {
        nodes: [
            { id: "me", group: "mixing" }
        ],
        edges: []

    }
} else {
    var netGraphTopologyData = {
        nodes: [
            { id: "me", group: "nonMixing" }
        ],
        edges: []

    }
}

function drawPeerCanvas() {
    drawPeerVideoStrip();
    // animation frame will be drop down, when window is hidden.
    window.requestAnimationFrame(drawPeerCanvas);
}

function drawPeerVideoStrip() {
    let indexInMixerCanvas = 1;
    let indexInPeercanvas = 1;
    resetCanvases();
    const localVideo = document.getElementById("local-video");
    let remoteVid;
    let videoslots = networkSplit[socket.id].length;
    drawVideoStripe(peerCanvasContext, localVideo, 0, "-1", videoslots + mixingPeers.length);
    drawVideoStripe(mixerCanvasContext, localVideo, 0, "-1", videoslots);
    for (var key in RTCConnections) {
        remoteVid = document.getElementById(key);
        if (remoteVid && !mixingPeers.includes(key) && networkSplit[socket.id].includes(key)) {
            drawVideoStripe(mixerCanvasContext, remoteVid, indexInMixerCanvas, key, videoslots);
            indexInMixerCanvas++;
        }
        if (remoteVid && (networkSplit[socket.id].includes(key) || mixingPeers.includes(key))) {
            drawVideoStripe(peerCanvasContext, remoteVid, indexInPeercanvas, key, videoslots + mixingPeers.length);
            indexInPeercanvas++;
        }
    }
}

function drawVideoStripe(c, videoElement, index, memberSocket, videoSlots) {
    let destLeft = canvasForPeers.width / (videoSlots + 1) * index;
    let destTop = 0;
    if (videoElement.videoHeight > tallestVid) {
        tallestVid = videoElement.videoHeight;
    }
    if (videoElement.videoWidth > widestVid) {
        widestVid = videoElement.videoWidth;
    }

    /*
        peerCanvasContext.drawImage(videoElement, destLeft, destTop, destWidth, destHeight);
    */
    // fill horizontally
    var hRatio = (canvasForPeers.width / videoElement.videoWidth) * videoElement.videoHeight;
    c.drawImage(videoElement, destLeft, 0, canvasForPeers.width / (videoSlots + 1), hRatio / (videoSlots + 1));
    if (memberSocket === "-1") {
        c.fillText(nickName, destLeft + 2, destTop + 10);
    } else {
        //TODO uncomment this
        //c.fillText(RTCConnectionNames[memberSocket], destLeft + 2, destTop + 10);
        c.fillText(memberSocket, destLeft + 2, destTop + 10);
    }
}

function authenticateUser() {
    let cook = document.cookie;
    if (!cook) {
        window.location.replace("..");
    }
    for (const splitKey in cook.split(';')) {
        var splitAroundEq = cook.split(';')[splitKey].split('=');
        if (splitAroundEq[0].trim() === "group-id") {
            roomID = splitAroundEq[1].trim();
        }
        if (splitAroundEq[0].trim() === "name") {
            //TODO uncomment this
            //nickName = splitAroundEq[1].trim();
        }
    }
    const header = document.getElementById("room-header-id");
    header.innerHTML = decodeURI(roomID);
    socket = io.connect(window.location.hostname, { query: { "group-id": roomID } });
    bootAndGetSocket().then(_ => {
        peerElectionPoints[socket.id] = 0;
        electionPointsReceived[socket.id] = false
        if (isMixingPeer) mixingPeers.push(socket.id)
        tsync.send = function (id, data, _) {
            //console.log('send', id, data);
            //console.log(socket.id)
            let packetString = JSON.stringify({
                type: "timesync",
                from: socket.id,
                tsdata: data,
            })
            let channel = dataChannels[id];
            if (channel) {
                channel.send(packetString);
            } else {
                console.log(new Error('Cannot send message: not connected to ' + id).toString());
            }
            return Promise.resolve();
        }
        tsync.on('sync', function (state) {
            //console.log("sync " + state)
            if (state == "start") {
                tsync.options.peers = Object.keys(dataChannels)
            }
        });
        console.log("Setup finished");
        console.log("My id is: " + socket.id)
    });
}

let d = new Date();
console.log(d.getTime())
authenticateUser();

function removeUseFromNetworkSplit(socketId) {
    for (const [sock, arr] of Object.entries(networkSplit)) {
        if (socketId === sock) {
            //A mixer just left
            console.log("A mixer just left");
            //Redistribute peers to the other mixers
            const index = mixingPeers.indexOf(socketId);
            if (index > -1) {
                mixingPeers.splice(index, 1);
            }
            let mixerIndex = 0;
            let danglingPeersArrayIsEmpty = false;
            while (!danglingPeersArrayIsEmpty) {
                networkSplit[mixingPeers[mixerIndex]].push(networkSplit[sock].pop());
                danglingPeersArrayIsEmpty = networkSplit[sock].length === 0;
                mixerIndex += (mixerIndex + 1) % mixingPeers.length;
            }
            //console.log("Blyat 1");
            //console.log(networkSplit);
            delete networkSplit[sock]
            //console.log("Blyat 2");
            //console.log(networkSplit);
            return;
        } else {
            const index = arr.indexOf(socketId);
            if (index > -1) {
                arr.splice(index, 1);
                return;
            }
        }
    }
}

async function bootAndGetSocket() {
    await initLocalStream();
    // TODO: Handle different room IDs.
    socket.on('connect', (_) => {
        console.log("Connected to discovery server through socket.");
    })

    socket.on("update-user-list", ({ users }) => {
        console.log("Got 'update-user-list'");
        updateUserList(users);
    });

    socket.on("latest-names", (goym) => {
        RTCConnectionNames = JSON.parse(goym);
    });

    socket.on("remove-user", ({ socketId }) => {
        //console.log("remove-user 0")
        //console.log(networkSplit)
        const elToRemove = document.getElementById(socketId);
        if (elToRemove) {
            delete RTCConnections[socketId];
            delete electionPointsReceived[socketId];
            activeConnectionSize--;
            delete RTCConnectionsCallStatus[socketId];
            delete RTCConnectionNames[socketId];
            if (supremeMixerPeer) {
                //console.log("remove-user 1")
                //console.log(networkSplit)
                removeUseFromNetworkSplit(socketId);
                //pollMixerPerformance might also send networksplit.
                updateTracksAsMixer();
                //console.log("remove-user 2")
                //console.log(networkSplit)
                pollMixerPerformance();
                sendNetworkSplit();
            }
            roomConnectionsSet.delete(socketId);
            //mixingPeers.pop()                                                        //When a mixing peer leave, delete it from the mixingPeerCollection
            updateOnRemove(roomConnectionsSet)                                         //Update graph according to the deletion of nodes
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
                if (supremeMixerPeer) {
                    networkSplit[socket.id].push(data.socket);
                    dataChannels[data.socket].send(JSON.stringify({
                        type: "networkSplit",
                        origin: socket.id,
                        networkData: networkSplit
                    }))
                }
            }
        })
        RTCConnections[data.socket].ondatachannel = (event) => {
            if (!dataChannels[data.socket]) {
                let dataChannel = event.channel || event;
                dataChannel.onmessage = onReceiveMessageCallback;
                filetransfer.configureChannel(dataChannel)
                dataChannels[data.socket] = dataChannel
                if (supremeMixerPeer) {
                    networkSplit[socket.id].push(data.socket);
                    sendToAll(JSON.stringify({
                        type: "networkSplit",
                        origin: socket.id,
                        networkData: networkSplit
                    }))
                }
            }
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
    return function ({ streams: [stream] }) {
        const remoteVideo = document.getElementById(socketId);
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
        }
        if (isMixingPeer) {
            let micNode = audioContext.createMediaStreamSource(stream);
            micNodes[socketId] = micNode;
            for (const [sock, _] of Object.entries(RTCConnections)) {
                if (sock !== socketId) {
                    micNode.connect(outputNodes[sock]);
                }
            }
        }
    };
}

function initNewRTCConnection(socketId) {
    let rtcConnection = new RTCPeerConnection();
    if (isMixingPeer) {
        outputNodes[socketId] = audioContext.createMediaStreamDestination();
        for (const [sock, _] of Object.entries(RTCConnections)) {
            if (sock !== socketId) {
                micNodes[sock].connect(outputNodes[socketId]);
            }
        }
    }
    rtcConnection.ontrack = getOntrackFunction(socketId);
    RTCConnections[socketId] = rtcConnection;
    activeConnectionSize++;
    RTCConnectionsCallStatus[socketId] = false;
    if (isMixingPeer) {
        if (mixingPeers.includes(socketId)) {
            mixerMixedStream.getTracks().forEach(track => {
                if (track.kind === "video") {
                    console.log("Added video track to new rtc connection")
                    rtcConnection.addTrack(track, mixerMixedStream);
                }
            });
            rtcConnection.addTrack(outputNodes[socketId].stream.getAudioTracks()[0], mixerMixedStream);
        } else {
            peerMixedStream.getTracks().forEach(track => {
                if (track.kind === "video") {
                    console.log("Added video track to new rtc connection")
                    rtcConnection.addTrack(track, peerMixedStream);
                }
            });
            rtcConnection.addTrack(outputNodes[socketId].stream.getAudioTracks()[0], peerMixedStream);
        }
    } else if (mixingPeers.length === 0) {
        // If no mixing peers, we want to stream video to everyone
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, window.localStream));
    } else if (mixingPeers.includes(socketId)) {
        // If there are mixing peers, we only want to stream video to the mixers
        window.localStream.getTracks().forEach(track => rtcConnection.addTrack(track, window.localStream));
    }
    //Reset animation background
    resetCanvases();
    // Some other init tied to the connection
    electionPointsReceived[socketId] = false;
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
            senders[i].replaceTrack(null).then(_ => console.log("Stopped a track"))
        }
        stoppedStreams[id] = true;

    } else {
        let tracks = window.localStream.getTracks();
        let senders = RTCConnections[id].getSenders();
        for (let i = 0; i < senders.length; i++) {
            senders[i].replaceTrack(tracks[i]).then(_ => console.log("Restarted a track"))
        }
        stoppedStreams[id] = false;
    }
}

function pauseNonMixerStreams() {
    for (const [sock, _] of Object.entries(RTCConnections)) {
        if (!mixingPeers.includes(sock)) {
            let senders = RTCConnections[sock].getSenders();
            console.assert(senders.length === 2);
            console.log(dummyAudioStream.getAudioTracks()[0]);
            console.log(dummyVideoStream.getVideoTracks()[0])
            for (let i = 0; i < senders.length; i++) {
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(dummyAudioStream.getAudioTracks()[0]).then(_ => console.log("Replaced with dummy audio track"))
                } else if (senders[i].track.kind === "video") {
                    senders[i].replaceTrack(dummyVideoStream.getVideoTracks()[0]).then(_ => console.log("Replaced with dummy video track"))
                }
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
                senders[i].replaceTrack(tracks[i]).then(_ => console.log("Restarted a track"))
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
        outputNode = audioContext.createMediaStreamDestination();
        outputNodes[socket.id] = outputNode;
        audioMixStream = outputNode.stream;
        let micNode = audioContext.createMediaStreamSource(stream);
        micNodes[socket.id] = micNode
        micNode.connect(outputNode)
        const audioTrack = audioMixStream.getAudioTracks()[0];
        window.localStream.addTrack(audioTrack)
    } else {
        const audioTrack = stream.getAudioTracks()[0];
        window.localStream.addTrack(audioTrack)
    }
}

async function benchMarkAllKnownPeers() {
    for (const [sock, _] of Object.entries(dataChannels)) {
        await benchMarkPeer(sock);
    }
}

function becomeMixer() {
    peerMixedStream = canvasForPeers.captureStream(15);
    mixerMixedStream = canvasForMixers.captureStream(15);
    animationId = window.requestAnimationFrame(drawPeerCanvas)
    isMixingPeer = true;
    //console.log("become mixer 1: " + mixingPeers);
    mixingPeers.push(socket.id);
    //console.log("become mixer 2: " + mixingPeers);

    const localVideo = document.getElementById("local-video");
    window.localStream = peerMixedStream;
    outputNode = audioContext.createMediaStreamDestination();
    audioMixStream = outputNode.stream;
    let myMicNode = audioContext.createMediaStreamSource(localVideo.srcObject);
    myMicNode.connect(outputNode)
    window.localStream.addTrack(audioMixStream.getAudioTracks()[0])
    let tracks = window.localStream.getTracks();
    for (const [sock, _] of Object.entries(RTCConnections)) {
        const remoteVideo = document.getElementById(sock);
        if (remoteVideo) {
            micNodes[sock] = audioContext.createMediaStreamSource(remoteVideo.srcObject);
            let out = audioContext.createMediaStreamDestination();
            outputNodes[sock] = out;
            myMicNode.connect(out)
        }
    }

    for (const [sock, _] of Object.entries(RTCConnections)) {
        for (const [peer, _] of Object.entries(RTCConnections)) {
            if (sock !== peer) {
                micNodes[peer].connect(outputNodes[sock]);
            }
        }
    }

    /*for (const [sock, _] of Object.entries(RTCConnections)) {
        let senders = RTCConnections[sock].getSenders();
        console.assert(senders.length === 2);
        for (let i = 0; i < senders.length; i++) {
            if (mixingPeers.includes(sock)) {
                // TODO probably a bug here
                console.assert(outputNodes[sock].stream.getAudioTracks()[0] !== null)
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(outputNodes[sock].stream.getAudioTracks()[0]).then(_ => "Replaced track");
                } else if (senders[i].track.kind === "video") {
                    console.assert(mixerMixedStream.getVideoTracks()[0] !== null)
                    senders[i].replaceTrack(mixerMixedStream.getVideoTracks()[0]).then(_ => "Replaced track");
                }
            } else {
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(outputNodes[sock].stream.getAudioTracks()[0]).then(_ => "Replaced track");
                } else if (senders[i].track.kind === "video") {
                    console.assert(peerMixedStream.getVideoTracks()[0] !== null)
                    senders[i].replaceTrack(peerMixedStream.getVideoTracks()[0]).then(_ => "Replaced track");
                }
            }
        }
    }*/

    updateTracksAsMixer();
    for (const [sock, _] of Object.entries(dataChannels)) {
        dataChannels[sock].send(JSON.stringify({
            type: "mixerStatus",
            origin: socket.id,
            mixers: mixingPeers
        }))
    }
}

function bruteForceElectionInMyFavour() {
    supremeMixerPeer = true;
    electionInitiated = true;
    electionBenchMarksSent = true;
    networkSplit[socket.id] = Array.from(roomConnectionsSet);
    becomeMixer();

    let fascistOrder = {
        type: "debugging",
        origin: socket.id
    }
    sendToAll(JSON.stringify(fascistOrder));
}

let electionBenchMarksSent = false;

async function evaluateElectionNeed(sock) {
    // We want at least 5 reports before we can establish
    if (electionInitiated && !electionBenchMarksSent) {
        for (const [sock, _] of Object.entries(RTCConnections)) {
            await benchMarkPeer(sock);
        }
        electionBenchMarksSent = true;
    }
    if (electionInitiated && electionBenchMarksSent) {
        return
    }
    let electionNeeded = false;
    if (bitRates[sock].length > 0) {
        let res = lastResult[sock];
        res.forEach(report => {
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
                /*  console.log(report)
                  console.log(Object.keys(report))*/
                if (report.qualityLimitationResolutionChanges >= 5 || report.pliCount >= 3) {
                    //Resolution changes is in-built webRTC. Resolution changes if GPU stutters or not enough broadband
                    //pliCount is a packet response if video specifically drops a frame
                    electionNeeded = true;
                }
            }
        })
    }
    if (electionNeeded && !electionInitiated) {
        console.log("I initiated an election")
        electionInitiated = true;
        let flag = { type: "initiateElection", origin: socket.id }
        sendToAll(JSON.stringify(flag))
        for (const [sock, _] of Object.entries(RTCConnections)) {
            await benchMarkPeer(sock);
        }
        electionBenchMarksSent = true;
    }
}

async function forceElection() {
    electionInitiated = true;
    let flag = { type: "initiateElection", origin: socket.id }
    sendToAll(JSON.stringify(flag))
    for (const [sock, _] of Object.entries(RTCConnections)) {
        await benchMarkPeer(sock);
    }
    electionBenchMarksSent = true;
}

async function bitRateEveryone() {
    if (debugging) return;
    for (const [sock, _] of Object.entries(RTCConnections)) {
        bitRateBenchMark(sock);
        await evaluateElectionNeed(sock);
    }
}

let networkSplit = {}

function sendNetworkSplit() {
    console.log("Sending networksplit: ")
    console.log(networkSplit);
    let message = {
        type: "networkSplit",
        origin: socket.id,
        networkData: networkSplit
    }
    sendToAll(JSON.stringify(message));
}

async function pollMixerPerformance() {
    if (!supremeMixerPeer) return;
    let newSplitWanted = false
    for (const [sock, _] of Object.entries(networkSplit)) {
        if (networkSplit[sock].length > allowedSubNetworkSize) newSplitWanted = true;
    }
    console.log("PollMixerPerformance: newsplitWanted =" + newSplitWanted)

    if (newSplitWanted) {
        let quotient = Math.floor(roomConnectionsSet.size / mixingPeers.length)
        console.log("PollMixerPerformance: quotient = " + quotient)

        let remainder = roomConnectionsSet.size % mixingPeers.length;
        console.log("PollMixerPerformance: remainder = " + remainder)

        if ((quotient + remainder) > allowedSubNetworkSize) {
            // Can't possibly split network so each mixer has < 3 peers
            let peersToDistribute = Object.keys(RTCConnections);
            peersToDistribute = peersToDistribute.filter(elem => !mixingPeers.includes(elem));
            console.log("PollMixerPerformance: peersToDistribute = " + peersToDistribute)
            let newMixerFound = false;
            let candidate;
            while (!newMixerFound) {
                let item = peersToDistribute[Math.floor(Math.random() * peersToDistribute.length)];
                if (!mixingPeers.includes(item)) {
                    candidate = item;
                    newMixerFound = true;
                }
            }
            console.log("PollMixerPerformance: mixingPeers = " + mixingPeers);
            mixingPeers.push(candidate);
            networkSplit[candidate] = [];
            console.log("PollMixerPerformance: mixingPeers = " + mixingPeers);
            console.log("PollMixerPerformance: peersToDistribute = " + peersToDistribute);
            peersToDistribute = peersToDistribute.filter(elem => (elem !== candidate));
            console.log("PollMixerPerformance: peersToDistribute = " + peersToDistribute);
            quotient = Math.floor(peersToDistribute.length / mixingPeers.length)
            remainder = peersToDistribute.length % mixingPeers.length;
            for (const [sock, _] of Object.entries(networkSplit)) {
                networkSplit[sock] = [];
                for (let i = 0; i < quotient; i++) {
                    networkSplit[sock].push(peersToDistribute.pop());
                }
                if (remainder > 0) {
                    remainder--;
                    networkSplit[sock].push(peersToDistribute.pop());
                }
            }
            sendNetworkSplit();
            populateNetwork()                                                                               //maybe not
            rebootStreamTargets();
        } else {
            // We simply need to redistribute
            console.log("Should not be able to get down here - redistribute network")
        }
    }
    sendNetworkSplit();
    populateNetwork()                                                                                       //maybe not
}

let supremeMixerPeer = false;
setInterval(bitRateEveryone, 1000 * 15);
setInterval(pollMixerPerformance, 1000 * 30);

function bitRateBenchMark(socketID) {
    if (!bitRates[socketID]) {
        bitRates[socketID] = [];
        frameEncodeTimes[socketID] = [];
    }

    RTCConnections[socketID].getStats().then(res => {
        res.forEach(report => {
            let bytes;
            let headerBytes;
            //let packets;
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
                //packets = report.packetsSent;
                if (lastResult[socketID] && lastResult[socketID].has(report.id)) {
                    const deltaFrames = report.framesEncoded - lastResult[socketID].get(report.id).framesEncoded;
                    const deltaTimeF = report.totalEncodeTime - lastResult[socketID].get(report.id).totalEncodeTime;
                    const avgFrameEncodeTimeSinceLast = deltaTimeF / deltaFrames;
                    const deltaT = now - lastResult[socketID].get(report.id).timestamp;
                    // calculate bitrate
                    const bitrate = 8 * (bytes - lastResult[socketID].get(report.id).bytesSent) /
                        deltaT;
                    //const headerrate = 8 * (headerBytes - lastResult[socketID].get(report.id).headerBytesSent) /
                    //    deltaT;
                    bitRates[socketID].push(bitrate);
                    frameEncodeTimes[socketID].push(avgFrameEncodeTimeSinceLast);
                }
            }
        });
        lastResult[socketID] = res;
    });
}

async function benchMarkPeer(socketID) {
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


function rankAndAwardMixerPoints() {
    let bitRatePool = 0;
    let totalEncodingTime = 0;
    let totalArraySpeed = 0;
    for (const [sock, _] of Object.entries(benchmarkResponses)) {
        totalEncodingTime += benchmarkResponses[sock]["avgEncodingSpeed"];
        totalArraySpeed += benchmarkResponses[sock]["arraySpeed"];
        if (!peerElectionPoints.hasOwnProperty(sock)) {
            peerElectionPoints[sock] = 0;
        }
    }
    for (const [_, ratesArray] of Object.entries(bitRates)) {
        if (ratesArray.length === 0) continue;
        let totalAverage = ratesArray.reduce((sum, num) => sum + num) / ratesArray.length
        bitRatePool += totalAverage;
    }
    let myOutGoingPoints = {}
    for (const [sock, _] of Object.entries(benchmarkResponses)) {
        let points = 0;
        let peerAverage = 0;
        if (bitRates.hasOwnProperty(sock) && bitRates[sock].length !== 0) {
            peerAverage = bitRates[sock].reduce((sum, num) => sum + num) / bitRates[sock].length
        }
        let peerAveragePoints;
        if (bitRatePool === 0) {
            peerAveragePoints = 0;
        } else {
            peerAveragePoints = peerAverage / bitRatePool * 100;
        }
        //let frameEncodingPoints = totalEncodingTime / benchmarkResponses[sock]["avgEncodingSpeed"] * (1 / 100);
        let frameEncodingPoints = -(benchmarkResponses[sock]["avgEncodingSpeed"] / totalEncodingTime * 100);
        let arrayTransferPoints = benchmarkResponses[sock]["arraySpeed"] / totalArraySpeed * 100;
        console.log("Points awarded to " + sock)
        console.log("Bitrate points: " + peerAveragePoints)
        console.log("Frame points: " + frameEncodingPoints)
        console.log("Frame time peer: " + benchmarkResponses[sock]["avgEncodingSpeed"])
        console.log("Frame time total: " + totalEncodingTime)
        console.log("Array points: " + arrayTransferPoints)
        points = Math.floor(peerAveragePoints + frameEncodingPoints + arrayTransferPoints);
        myOutGoingPoints[sock] = points;
        peerElectionPoints[sock] += points;

    }
    let electionObject = {
        type: "electionPoints",
        origin: socket.id,
        points: myOutGoingPoints
    }
    sendToAll(JSON.stringify(electionObject));
    electionPointsReceived[socket.id] = true;
    electMixersIfValid()
}


function electMixers(mixerSpots) {
    // Create items array
    console.log("Printing Election Results")
    for (const [sock, points] of Object.entries(peerElectionPoints)) {
        console.log(sock + " has " + points);
    }
    var candidates = Object.keys(peerElectionPoints).map(function (key) {
        return [key, peerElectionPoints[key]];
    });

    // Sort the array based on the second element
    candidates.sort(function (first, second) {
        if (first[1] === second[1]) return second[0].localeCompare(first[0]);
        return second[1] - first[1];
    });

    // Create a new array with only the first 5 items
    console.log(candidates)
    let ranked = candidates.slice(0, mixerSpots);
    if (ranked[0][0] === socket.id) {
        console.log("I became mixer")
        mixingPeers.push(ranked[0][0])
        // We should only have one mixer at this point.
        console.assert(mixingPeers.length === 1)
        supremeMixerPeer = true;
        networkSplit[socket.id] = Array.from(roomConnectionsSet);
        becomeMixer();
    } else {
        mixingPeers.push(ranked[0][0])
        pauseNonMixerStreams();
    }
}

function electMixersIfValid() {
    for (const [sock, _] of Object.entries(electionPointsReceived)) {
        console.log("In loop, also I am " + socket.id)
        console.log(sock)
        if (electionPointsReceived[sock] === false) {
            console.log(sock + " has value " + electionPointsReceived[sock])
            return;
        }
    }
    electMixers(1);
}

function handleTurningNonMixer() {
    isMixingPeer = false;
}

function resetCanvases() {
    peerCanvasContext.beginPath();
    peerCanvasContext.rect(0, 0, widestVid, tallestVid);
    peerCanvasContext.fillStyle = "black";
    peerCanvasContext.fill();

    mixerCanvasContext.beginPath();
    mixerCanvasContext.rect(0, 0, widestVid, tallestVid);
    mixerCanvasContext.fillStyle = "black";
    mixerCanvasContext.fill();
}

function updateTracksAsMixer() {
    let myPeers = networkSplit[socket.id];
    let otherMixers = Object.keys(networkSplit);
    for (const [sock, _] of Object.entries(RTCConnections)) {
        let senders = RTCConnections[sock].getSenders();
        console.assert(senders.length === 2);
        for (let i = 0; i < senders.length; i++) {
            if (otherMixers.includes(sock)) {
                console.assert(outputNodes[sock].stream.getAudioTracks()[0] !== null)
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(outputNodes[sock].stream.getAudioTracks()[0]).then(_ => "Replaced track");
                } else if (senders[i].track.kind === "video") {
                    console.assert(mixerMixedStream.getVideoTracks()[0] !== null)
                    senders[i].replaceTrack(mixerMixedStream.getVideoTracks()[0]).then(_ => "Replaced track");
                }
            } else if (myPeers.includes(sock)) {
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(outputNodes[sock].stream.getAudioTracks()[0]).then(_ => "Replaced track");
                } else if (senders[i].track.kind === "video") {
                    console.assert(peerMixedStream.getVideoTracks()[0] !== null)
                    senders[i].replaceTrack(peerMixedStream.getVideoTracks()[0]).then(_ => "Replaced track");
                }
            } else {
                if (senders[i].track.kind === "audio") {
                    senders[i].replaceTrack(dummyAudioStream.getAudioTracks()[0]).then(_ => console.log("Replaced with dummy audio track"))
                } else if (senders[i].track.kind === "video") {
                    senders[i].replaceTrack(dummyVideoStream.getVideoTracks()[0]).then(_ => console.log("Replaced with dummy video track"))
                }
            }
        }
    }
}

function rebootStreamTargets() {
    if (!isMixingPeer) {
        //I am a regular client, and I should only stream video/audio to the mixer
        let myMixer;
        for (const [sock, arr] of Object.entries(networkSplit)) {
            if (arr.includes(socket.id)) {
                myMixer = sock;
                //Send actual video to mixer
                let tracks = window.localStream.getTracks();
                let senders = RTCConnections[sock].getSenders();
                for (let i = 0; i < senders.length; i++) {
                    senders[i].replaceTrack(tracks[i]).then(_ => console.log("Restarted a track"))
                }
            }
        }
        console.assert(myMixer !== undefined);
        for (const [sock, _] of Object.entries(RTCConnections)) {
            if (sock !== myMixer) {
                let senders = RTCConnections[sock].getSenders();
                for (let i = 0; i < senders.length; i++) {
                    //senders[i].replaceTrack(null).then(_ => console.log("Stopped a track"))
                    if (senders[i].track.kind === "audio") {
                        senders[i].replaceTrack(dummyAudioStream.getAudioTracks()[0]).then(_ => console.log("Replaced with dummy audio track"))
                    } else if (senders[i].track.kind === "video") {
                        senders[i].replaceTrack(dummyVideoStream.getVideoTracks()[0]).then(_ => console.log("Replaced with dummy video track"))
                    }
                }
            }
        }
    } else {
        //TODO handle what the mixing peer should do
        resetCanvases();
        updateTracksAsMixer();
    }
}

function onReceiveMessageCallback(event) {
    // console.log(`Received Message ${event.data}`);
    let data = JSON.parse(event.data)
    let replyChannel = event.target;
    switch (data.type) {
        case "debugging":
            electionInitiated = true;
            electionBenchMarksSent = true;
            mixingPeers = [data.origin]
            pauseNonMixerStreams();
            break;
        case "electionPoints":
            for (const [id, votes] of Object.entries(data.points)) {
                if (!peerElectionPoints.hasOwnProperty(id)) {
                    peerElectionPoints[id] = 0;
                }
                peerElectionPoints[id] = peerElectionPoints[id] + votes;
                console.log(id + " got " + votes + " from " + data.origin);
            }
            electionPointsReceived[data.origin] = true;
            electMixersIfValid()
            break;
        case "chat":
            postChatMessage(data.message, data.nickname)
            break;
        case "networkSplit":
            console.log("In networkSplit")
            console.log(data.networkData);
            for (const [id, _] of Object.entries(data.networkData)) {
                console.log(data.networkData[id])
            }
            networkSplit = data.networkData;
            let newMixers = Object.keys(networkSplit);
            mixingPeers = newMixers;
            let clientInMixerChoices = mixingPeers.includes(socket.id);
            populateNetwork()                                                                               //Maybe not
            if (isMixingPeer && !clientInMixerChoices) {
                console.log("Turn nonmixer")
                postChatMessage("Turn nonmixer", socket.id)
                handleTurningNonMixer();
            } else if (!isMixingPeer && clientInMixerChoices) {
                console.log("Turn mixer from networkSplit update")
                postChatMessage("Turn mixer from networkSplit update", socket.id)
                becomeMixer();
                rebootStreamTargets();
            } else if (!isMixingPeer && !clientInMixerChoices) {
                //My status didn't change, but the mixer I should stream to might
                console.log("rebootStreamTargets")
                rebootStreamTargets();
            }
            break;
        case "file":
            if (timestampStart == -1) {
                let timestampStart = (new Date()).getTime()
            }
            let payload = data.payload;
            console.log("payload")
            console.log(payload)
            let buffer = decode(payload)
            console.log("buffer")
            console.log(buffer)
            receiveBuffers[data.hash].push(buffer);
            console.log("old size: " + filemetadata[data.hash].receivedSize)
            filemetadata[data.hash].receivedSize += buffer.byteLength
            console.log("new size: " + filemetadata[data.hash].receivedSize)
            // we are assuming that our signaling protocol told
            // about the expected file size (and name, hash, etc).
            if (filemetadata[data.hash].receivedSize === filemetadata[data.hash].size) {
                console.log("Received file")
                const received = new Blob(receiveBuffers[data.hash]);
                console.log(received)
                const name = filemetadata[data.hash].name
                receiveBuffers[data.hash] = [];
                filetransfer.makeDownloadLink(received, filemetadata[data.hash]);
                //const bitrate = Math.round(filemetadata[data.hash].receivedSize * 8 /
                //    ((new Date()).getTime() - timestampStart));
                //bitrateDiv.innerHTML =
                //    `<strong>Average Bitrate:</strong> ${bitrate} kbits/sec (max: ${bitrateMax} kbits/sec)`;
                timestampStart = -1
                if (statsInterval) {
                    clearInterval(statsInterval);
                    statsInterval = null;
                }
            }
            break;
        case "initiateElection":
            electionInitiated = true;
            console.log("Got initiate election flag")
            break;
        case "benchmarkOut":
            console.log("Benchmark packet")
            if (!benchmarkBuffers.hasOwnProperty(data.origin)) {
                benchmarkBuffers[data.origin] = [];
            }
            data.buff.forEach(byte => benchmarkBuffers[data.origin].push(byte));
            if (benchmarkBuffers[data.origin].length === benchmarkSize) {
                var d = new Date(tsync.now()); // for now
                let deltaTS = (d.getTime() - data.ts) / 1000; //Diff in seconds
                let speed = benchmarkSize / deltaTS;
                let mBSSpeed = speed / (1024 * 1024);
                let avgEncoding;
                //benchmarkResponses[data.origin] = mBSSpeed;
                if (!frameEncodeTimes.hasOwnProperty(data.origin) || frameEncodeTimes[data.origin].length < 2) {
                    avgEncoding = 0
                } else {
                    avgEncoding = frameEncodeTimes[data.origin].reduce((sum, num) => {
                        return sum + num
                    }) / frameEncodeTimes[data.origin].length;
                }

                let
                    response = {
                        type: "benchMarkResponse",
                        origin: socket.id,
                        benchmark: mBSSpeed,
                        avgEncodingSpeed: avgEncoding
                    }
                dataChannels[data.origin].send(JSON.stringify(response))
                benchmarkBuffers[data.origin] = [];
            }
            break;
        case "mixerStatusResponse":
            console.log("mixerStatusResponse mixers 1: " + mixingPeers);
            data.mixers.forEach(newMixer => {
                if (!mixingPeers.includes(newMixer)) {
                    mixingPeers.push(newMixer)
                    if (isMixingPeer) {
                        var sender = RTCConnections[newMixer].getSenders().find(function (s) {
                            return s.track.kind === "video";
                        });
                        sender.replaceTrack(mixerMixedStream.getVideoTracks()[0]).then(_ => "Replaced inside response");
                    }
                }
            })
            console.log("mixerStatusResponse mixers 2: " + mixingPeers);
            break;
        case "mixerStatus":
            console.log("mixerStatus mixers 1: " + mixingPeers);
            data.mixers.forEach(newMixer => {
                if (!mixingPeers.includes(newMixer)) {
                    mixingPeers.push(newMixer)
                    if (isMixingPeer) {
                        var sender = RTCConnections[newMixer].getSenders().find(function (s) {
                            return s.track.kind === "video";
                        });
                        sender.replaceTrack(mixerMixedStream.getVideoTracks()[0]).then(_ => "Replaced inside response");
                    }
                }
            })
            if (mixingPeers.length !== 0) {
                electionInitiated = true; //Election already held
                if (!isMixingPeer) {
                    pauseNonMixerStreams();
                }
            }
            let response = {
                type: "mixerStatusResponse",
                origin: socket.id,
                mixers: mixingPeers
            }
            dataChannels[data.origin].send(JSON.stringify(response))
            console.log("mixerStatus mixers 2: " + mixingPeers);
            break;
        case "benchMarkResponse":
            console.log("Got a benchmark back from " + data.origin)
            benchmarkResponses[data.origin] = {};
            benchmarkResponses[data.origin]["arraySpeed"] = data.benchmark;
            benchmarkResponses[data.origin]["avgEncodingSpeed"] = data.benchmark;
            if (Object.keys(benchmarkResponses).length === roomConnectionsSet.size) rankAndAwardMixerPoints()
            break;
        case "mixerSignal":
            console.log("Got mixer signal from: " + data.origin);
            break;
        case "SomeSignalType":
            console.log("Here something should happen if i receive some message with type=SomeSignal")
            break;
        case "requestNetworkNodes":
            var myNeighbours = JSON.stringify({ nodes: Array.from(roomConnectionsSet), type: "requestNetworkCallback", origin: socket.id })
            event.target.send(myNeighbours)
            break;
        case "requestUpdateNetworkSplit":
            var myNetworkSplit = JSON.stringify({ split: networkSplit, type: "requestUpdateNetworkSplitCallback", origin: socket.id })
            event.target.send(myNetworkSplit)
            break;
        case "requestUpdateNetworkSplitCallback":
            data.split
            console.log("networkSplit is not empty so we have mixers")
            console.log(data.split)
            console.log(Object.keys(data.split))
            setInitData()

            Object.keys(data.split).forEach(mixer => {                                                              //Go through all keys (mixing peers)
                let mixPeers = data.split[mixer];                                                                   //Get the value (which peers that mixer is connected to)
                console.log(mixPeers)                                                                               //Print out values
                if (mixer != socket.id) {
                    console.log("Not a node that is our self")
                    if (findDuplicateNode(mixer) != true) {                                                         //If the key is noy oneself, push it to the networkGraph as node    
                        netGraphTopologyData.nodes.push({ id: mixer, group: "mixing" })

                        addEdges(mixer, Object.keys(data.split))
                        //Add edges between mixers
                    }
                    mixPeers.forEach(nonMixer1 => {                                                                 //Go through all the non-mixing peers
                        if (nonMixer1 != socket.id) {                                                               //If the non-mixing peer is not oneself
                            if (findDuplicateNode(nonMixer1) != true) {                                             //add it to the networkGraph as non-mixing and
                                netGraphTopologyData.nodes.push({ id: nonMixer1, group: "nonMixing" })              //and add edges from the non-mixers to mixers
                            }
                            if (findDuplicateEdge(nonMixer1, mixer) != true) {
                                netGraphTopologyData.edges.push({ from: nonMixer1, to: mixer })
                            }
                        } else {                                                                                    //else if the value(non-mixer) is yourself then add
                            if (findDuplicateEdge("me", mixer) != true) {                                           //edge to from "me" to the mixer peer
                                netGraphTopologyData.edges.push({ from: "me", to: mixer })
                            }
                        }
                    })

                } else {
                    console.log("So me should be mixing")                                                           //If the key(mixer) is yourself, reset data
                    netGraphTopologyData = {                                                                        //and set "me" as a mixing node
                        nodes: [
                            { id: "me", group: "mixing" }
                        ],
                        edges: []
                    }

                    addEdges("me", Object.keys(data.split))                                                         //Add egdes from "me" to all the mixer peers

                    mixPeers.forEach(nonMixer2 => {                                                                 //Go through all the non-mixers 
                        if (nonMixer2 != socket.id) {                                                               //Check if the non-mixer is yourself if so then
                            if (findDuplicateNode(nonMixer2) != true) {                                             //push that node as non-mixer and add edges from "me" to it 
                                netGraphTopologyData.nodes.push({ id: nonMixer2, group: "nonMixing" })
                            }
                            if (findDuplicateEdge("me", nonMixer2) != true) {
                                netGraphTopologyData.edges.push({ from: "me", to: nonMixer2 })
                            }
                        } else {                                                                                    //Else draw edge from "me" to the mixer
                            if (findDuplicateEdge("me", mixer) != true) {
                                netGraphTopologyData.edges.push({ from: "me", to: mixer })
                            }
                        }
                    })
                }
            });

            break;
        case "requestNetworkCallback":
            data.nodes
            console.log("data.nodes")
            console.log(data.nodes)
            //console.log("NetGrphTopologyData")
            //console.log(netGraphTopologyData)
            //console.log("ConnectionSet")
            //console.log(roomConnectionsSet)
            //console.log("socket id")
            //console.log(socket.id)
            const empty = {};
            if (Object.keys(networkSplit).length === 0) {
                console.log("networkSplit is empty meaning no mixers")
                data.nodes.forEach(element => {
                    if (element != socket.id && findDuplicateNode(element) != true) {
                        console.log("here not self")                                                                 //Case where we are looking at all the nodes that "me" is connected to
                        netGraphTopologyData.nodes.push({ id: element, group: "nonMixing" })
                        if (mixingPeers.length == 0 && findDuplicateEdge("me", element) != true) {
                            netGraphTopologyData.edges.push({ from: 'me', to: element })
                            //addEdges(element, data.nodes)
                            addEdges(element, roomConnectionsSet)
                        }

                    } else {                                                                                                                            //Case where we are looking at the node id of "me"
                        roomConnectionsSet.forEach(element1 => {
                            if (findDuplicateNode(element1) != true) {
                                console.log("There self")
                                netGraphTopologyData.nodes.push({ id: element1, group: "nonMixing" })
                                if (mixingPeers.length == 0 && findDuplicateEdge("me", element1) != true) {
                                    netGraphTopologyData.edges.push({ from: 'me', to: element1 })
                                    addEdges(element1, roomConnectionsSet)
                                }
                            }
                        })
                    }
                });
            }
            updateGraph()
            break;
        case "file-metadata":
            receiveBuffers[data.hash] = [];
            filemetadata[data.hash] = data
            let reply = JSON.stringify({
                type: "file-callback",
                hash: data.hash
            });
            filemetadata[data.hash].receivedSize = 0;
            console.log(filemetadata[data.hash])
            replyChannel.send(reply);
            break;
        case "file-callback":
            peersReady[data.hash]++
            let nmbrOfPeersReady = peersReady[data.hash]
            let dataChannelsLength = Object.keys(dataChannels).length
            let allPeersReady = nmbrOfPeersReady == dataChannelsLength
            if (allPeersReady) {
                filetransfer.sendData(dataChannels, data.hash, nickName)
            } else {
                console.log("peersReady: " + nmbrOfPeersReady)
                console.log("datachannel length: " + dataChannelsLength)
            }
            break;
        case "timesync":
            let parsedData = data.tsdata;
            tsync.receive(data.from, parsedData)
            //let date = new Date(tsync.now())
            //console.log("date: "+date)
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

function decode(str) {
    var buf = new ArrayBuffer(str.length); // 2 bytes for each char
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
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

function findDuplicateNode(element) {
    //Given some element check if that element is a node that already exist in the network graph
    //If it does return true otherwise return false.
    var netWorkNodeFound = false;
    for (var i = 0; i < netGraphTopologyData.nodes.length; i++) {
        if (netGraphTopologyData.nodes[i].id == element) {
            netWorkNodeFound = true;
            break;
        }
    }
    return netWorkNodeFound
}

function findDuplicateEdge(from, to) {
    //Given some element "from" and some element "to" check if the edge between "from" and "to" already exist in the network graph
    //If it does return true otherwise return false. 
    var netWorkEdgeFound = false;
    for (var i = 0; i < netGraphTopologyData.edges.length; i++) {
        if (netGraphTopologyData.edges[i].from == from && netGraphTopologyData.edges[i].to == to) {
            netWorkEdgeFound = true;
            break;
        }
    }
    return netWorkEdgeFound
}

function addEdges(element, set) {
    //Add edges to the network graph such that there are no self-edges and no duplicate edges
    var conSetAsArr = Array.from(set)
    for (var i = 0; i < conSetAsArr.length; i++) {
        var edgeFound = false;
        for (var j = 0; j < netGraphTopologyData.edges.length; j++) {
            if (j > 0) {
                if (netGraphTopologyData.edges[j].from == element && netGraphTopologyData.edges[j].to == conSetAsArr[i] ||
                    netGraphTopologyData.edges[j].from == conSetAsArr[i] && netGraphTopologyData.edges[j].to == element) {
                    edgeFound = true;
                    break;
                }
            }
        }
        if (element != conSetAsArr[i] && edgeFound != true) {
            netGraphTopologyData.edges.push({ from: element, to: conSetAsArr[i] })
        }
    }
}

function removeNonExistentDataFromGraph(set) {
    var setSize = mixingPeerCollection.size
    console.log("Mixing set when in remove function")
    console.log(mixingPeerCollection)
    //console.log("Enteres removed nonexistent data")
    console.log("Number of nodes in network")
    console.log(netGraphTopologyData.nodes.length)
    console.log("Number of nodes in connectionSet + 1")
    console.log((set.size) + 1)
    console.log("Number of nodes in mixSet")
    console.log((mixingPeerCollection.size))

    if (mixingPeerCollection.size == 0) {
        if (netGraphTopologyData.nodes.length > (set.size) + 1) {
            console.log("non mixer disconnected in a network with no mixers")
            setInitData()
        }
    } else {
        if (netGraphTopologyData.nodes.length > ((set.size) + 1) + (mixingPeerCollection.size)) {
            console.log("Non mixer disconnected in a network with mixers")
            setInitData()
            mixingPeerCollection.forEach(item => {
                if (findDuplicateNode(item) != true) {
                    if (findDuplicateEdge("me", item)) {
                        netGraphTopologyData.edges.push({ from: "me", to: item })
                    }
                }
            })
        }
    }
}

function drawElectedMixerNode() {                                                                       //Bug example, connect 5 peers. two peers become mixers. add one more peer, then one more peer turns mixer
    console.log("I am a mixing peer")                                                                   //so we have that each mixer is connected to 1 nonMixer peer. One non-mixer leave and then we
    Object.keys(networkSplit).forEach(mixer => {                                                        //are back at 5 peers but with 3 mixers. So one mixer1 is connected to one peer,
        let nonMixers = networkSplit[mixer];                                                            //mixer2 is connected to one peer and mixer3 is not connected to any.
        console.log("socket.id of mixer")
        console.log(socket.id)
        console.log("mixer currently looking at")
        console.log(mixer)
        if (mixer != socket.id) {
            console.log("socket id is not the same as the mixer we are looking at:")
            if (findDuplicateNode(mixer) != true) {                                                         //networkSplit send: Object { "mixer1": (1) […], mixer2: (1) […], mixer3: [] } WRONG?!
                netGraphTopologyData.nodes.push({ id: mixer, group: "mixing" })                             //Network should detect if there are too many mixers to nonmixer, and it should make mixer to nonmixer??
                nonMixers.forEach(nonMixer => {
                    if (findDuplicateNode(nonMixer) != true && nonMixer != socket.id) {                     //Bug example, connect 3 peers, make one mixer. Then add a new peer
                        netGraphTopologyData.nodes.push({ id: nonMixer, group: "nonMixing" })               //NetworkSplit becomes 2 mixers 2 non-mixers
                    }                                                                                       //Remove 1 non-mixer and we end up in the example above
                    if (findDuplicateEdge(nonMixer, mixer) != true) {                                       //Then remove the peer that is mixing but shouldn't be mixing (not the supreme)
                        netGraphTopologyData.edges.push({ from: nonMixer, to: mixer })
                    }                                                                                       //Network split becomes: mixer1: Array [ "BuAfoMOFufgtcDZfAACM", undefined ]        
                })                                                                                          //Should not be undefined??? Remove peers + graph (only removing) works for non-mixers, and mixers elected.
                addEdges(mixer, Object.keys(networkSplit))                                                  //Does not work when supreme removed, and if the last non-mixing peer is removed             
            }
        } else {
            console.log("socket id is the same as the mixer we are looking at:")
        }                                                                                               //And only supreme left. (mixing undefined)
    })                                                                                                  //wants to add one/two edges to a node that doesn't exist when a peer becomes mixer
}                                                                                                       //edge from me to "non-existent node which has value socket.id"
                                                                                                        //edge from other mixer to "non-existent node which has value socket.id"
function updateOnRemove(set) {
    if (mixingPeers.length == 0) {
        if (netGraphTopologyData.nodes.length > (set.size) + 1) {
            setInitData()
        }
    } else {
        setInitData()
        mixingPeers.forEach(item => {
            if (findDuplicateNode(item) != true && findDuplicateEdge("me", item)) {
                netGraphTopologyData.edges.push({ from: "me", to: item })
            }
        })
    }
}

function twoMixerToplogy(data, set, element) {
    //TODO: Fix this function to correctly connect mixing peers to non-mixing peers 
    //Possibly fixed with tree-structure? Parent nodes and child nodes

    var conSet = Array.from(set)
    var mixSet = Array.from(data)
    var half = Math.ceil(conSet.length / mixSet.length);
    var firstHalf = conSet.splice(0, half)
    var secondHalf = conSet.splice(-half)
    secondHalf.push("me")                                                           //Should not always just push "me" to second half

    for (var i = 0; i < mixSet.length; i++) {
        addEdges(mixSet[i], mixSet)
        if (i == 0) {
            addEdges(mixSet[i], firstHalf)                                          //Depends on order, so if all the peers does not see peer connect in the same order it messes up
        } else {
            addEdges(mixSet[i], secondHalf)
        }
    }
}

function setInitData() {
    //Set the data of the network graph to its initial values. Used to reset the data before updating the graph
    if (isMixingPeer == true) {
        netGraphTopologyData = {
            nodes: [
                { id: "me", group: "mixing" }
            ],
            edges: []
        }
    } else {
        netGraphTopologyData = {
            nodes: [
                { id: "me", group: "nonMixing" }
            ],
            edges: []
        }
    }
}

function updateGraph() {
    //Update the graph by removing the old graph and then redrawing the new one with the new data.
    //Sets up the appearance of the graph by grouping the nodes into two groups namely non-mixing
    //and mixing. The two groups are drawed diffent on the graph. A non-mixing node will appear as
    //a dot and a mixing-peer will appear as a star.

    var netWorkChart = anychart.graph(netGraphTopologyData);
    // set the title
    netWorkChart.title("Network Graph showing all peers");

    // draw the chart
    //console.log(netGraphTopologyData)
    // if there is at least one mixerPeer create the group mixing
    if (mixingPeers.length > 0 && Object.keys(networkSplit).length !== 0) {                                                            //Bug keep saying mixing is undefined
        var mixing = netWorkChart.group("mixing");
        if (typeof mixing !== 'undefined') {
            mixing.normal().shape("star5");
            mixing.normal().fill("#ffa000");
            mixing.normal().height(40);
        }
    }
    // Create group nonMixing
    //if (roomConnectionsSet.size > 0) {
        var nonMixing = netWorkChart.group("nonMixing");                                                                                    //Says nonmixing is undfined if a mixer joins first.
        if (typeof nonMixing !== 'undefined') {
            nonMixing.normal().shape("circle");
        }
    //}

    // enable the labels of nodes
    netWorkChart.nodes().labels().enabled(true);

    // configure the labels of nodes
    netWorkChart.nodes().labels().format("{%id}");
    netWorkChart.nodes().labels().fontSize(12);
    netWorkChart.nodes().labels().fontWeight(600);

    // Remove the container div
    var myobj = document.getElementById("container");
    myobj.remove();

    //Create a new container div with same attributes
    var p = document.getElementById("NetworkTab");
    const newDiv = document.createElement("div");
    newDiv.setAttribute('id', "container");
    newDiv.setAttribute('class', "plot");
    p.appendChild(newDiv);

    //Draw container
    netWorkChart.container("container").draw();
}

function populateNetwork() {
    //Polulates the network with all the new peers. Whenever new peers connect, networkRequests and mixingNetworkRequest 
    //are sent out to all other peers connected, and then the graph is updated according to the reponse the different peers¨
    //gives.
    //console.log("array of mixingPeers")
    //console.log(mixingPeers)
    console.log("PopulateNetwork Function has been called!")
    anychart.onDocumentReady(function () {
        //TODO: 
        //Update graph also when peers leave the network. (DONE for non-mixing peers)
        //Update graph correct when there is two mixing peers
        console.log("netGraphTopologyData")
        console.log(netGraphTopologyData)
        console.log("networkSplit")
        console.log(networkSplit)

        if (mixingPeers.length == 0 && Object.keys(networkSplit).length === 0) {
            let requestBody = { type: "requestNetworkNodes" }
            sendToAll(JSON.stringify(requestBody))
        } else {
            let requestBody = { type: "requestUpdateNetworkSplit" }
            sendToAll(JSON.stringify(requestBody))

            if (isMixingPeer == true) {
                drawElectedMixerNode()
            }
        }


        updateGraph()
    });

}
