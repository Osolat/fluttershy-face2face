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
let peersReady = {};
let receiveBuffers = {};
let filemetadata = {};
let statsInterval = null;
let timestampStart = -1;



//Variables for network etc
/*const popUpBut = document.querySelector('button#audio-popup-button');
popUpBut.addEventListener('click', () => {
    var modal = document.getElementById("audioPopup");
    audioContext = new window.AudioContext();
    modal.style.display = "none";
})*/

let localVid = document.getElementById('local-video');
localVid.addEventListener("click", () => benchMarkAllKnownPeers());
const sendFileButton = document.querySelector('button#sendFile');
sendFileButton.addEventListener('click', () => {
    if(!filetransfer.fileEmpty()) {
        sendMetaData()
    }
})

const peerConnection = new RTCPeerConnection();
const dataChannels = {};
var RTCConnections = {};
var RTCConnectionsCallStatus = {};
var roomConnectionsSet = new Set();
var activeConnectionSize = 0;
let RTCConnectionNames = {};
var isMixingPeer = false;
let socket;
let roomID;
let nickName = "Anonymous";
let benchmarkBuffers = {};
let benchmarkTimes = {};
const benchmarkSize = 1024 * 1024 * 4; // 4000kbytes = 4MB
const benchmarkPackSize = 1024 * 8 // 8 Kbytes
const benchmarkPacketNums = (benchmarkSize) / (benchmarkPackSize)
console.log(benchmarkPacketNums)

// for timesync

var tsync = timesync.create({
    peers: [], // start empty, will be updated at the start of every synchronization
    interval: 500000,
    delay: 200,
    timeout: 1000
});




function hashCode(string) {
    var hash = 0, i, chr;
    for (i = 0; i < string.length; i++) {
        chr   = string.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function sendMetaData(){
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
    bootAndGetSocket().then(r => {
        tsync.send = function (id, data, timeout) {
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
        tsync.on('sync', function(state) {
            //console.log("sync " + state)
            if (state == "start") {
                tsync.options.peers = Object.keys(dataChannels)
            }
        })
        console.log("Setup finished")
    });
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


function initNewRTCConnection(socketId) {
    let rtcConnection = new RTCPeerConnection();
    rtcConnection.ontrack = function ({streams: [stream]}) {
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

function benchMarkPeer(socketID) {
    if (dataChannels.hasOwnProperty(socketID)) {
        var d = new Date(); // for now
        let start = d.getTime();
        var array = new Uint8Array(benchmarkPackSize);  // allocates KByte * 10
        console.log("Start: " + start)
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
    if (event.type != "timesync") {
        console.log(`Received Message ${event.data}`);
    }
    let data = JSON.parse(event.data)
    let replyChannel = event.target;
    switch (data.type) {
        case "chat":
            postChatMessage(data.message, data.nickname)
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
            console.log("old size: "+filemetadata[data.hash].receivedSize)
            filemetadata[data.hash].receivedSize += buffer.byteLength
            console.log("new size: "+filemetadata[data.hash].receivedSize)
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
                benchmarkTimes[data.origin] = mBSSpeed;
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
            benchmarkTimes[data.origin] = data.benchmark;
            console.log(benchmarkTimes)
        case "mixerSignal":
            console.log("Got mixer signal from: " + data.origin);
            break;
        case "SomeSignalType":
            console.log("Here something should happen if i receive some message with type=SomeSignal")
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
                console.log("peersReady: "+nmbrOfPeersReady)
                console.log("datachannel length: "+ dataChannelsLength)
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
    for (const webCon in RTCConnections) {
        console.log(webCon)
        RTCConnections[webCon].getStats().then(res => {
            res.forEach(report => {
                let bytes;
                let headerBytes;
                let packets;
                if (report.type === 'outbound-rtp') {
                    console.log(report);

                    if (report.isRemote) {
                        return;
                    }
                    const now = report.timestamp;
                    bytes = report.bytesSent;
                    headerBytes = report.headerBytesSent;

                    packets = report.packetsSent;
                    if (lastResult[webCon] && lastResult[webCon].has(report.id)) {
                        const deltaT = now - lastResult[webCon].get(report.id).timestamp;
                        // calculate bitrate
                        const bitrate = 8 * (bytes - lastResult[webCon].get(report.id).bytesSent) /
                            deltaT;
                        const headerrate = 8 * (headerBytes - lastResult[webCon].get(report.id).headerBytesSent) /
                            deltaT;

                        console.log(webCon + " bitrate:" + bitrate);
                        console.log(webCon + " headerrate:" + headerrate);

                    }
                }
            });
            lastResult[webCon] = res;
        });
    }
    let data = {
        type: "mixerSignal",
        origin: socket.id
    }
    sendToAll(JSON.stringify(data));
}
function decode(str) {
    var buf = new ArrayBuffer(str.length); // 2 bytes for each char
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i < strLen; i++) {
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
