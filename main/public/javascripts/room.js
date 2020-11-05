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
let audioMixSterams = [];


// for filetransfer
let receiveBuffer = [];
let receivedSize = 0;
let statsInterval = null;


//Variables for network etc
/*const popUpBut = document.querySelector('button#audio-popup-button');
popUpBut.addEventListener('click', () => {
    var modal = document.getElementById("audioPopup");
    audioContext = new window.AudioContext();
    modal.style.display = "none";
})*/

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
let socket;
let roomID;
let nickName = "Anonymous";

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

function initNewRTCConnection(socketId) {
    let rtcConnection = new RTCPeerConnection();
    rtcConnection.ontrack = function ({streams: [stream]}) {
        const remoteVideo = document.getElementById(socketId);
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
        }
        let micNode = audioContext.createMediaStreamSource(stream);
        micNodes[socketId] = micNode;
        for (let key in outputNodes) {
            if (key === socketId) {
                console.log('skip output(id=' + key + ') because same id=' + id);
            } else {
                let otherOutputNode = outputNodes[key];
                micNode.connect(otherOutputNode);
            }
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
    if (isMixingPeer) {
        window.localStream = mixStream;
        let newOutputNode = audioContext.createMediaStreamDestination();
        let newAudioMixStream = newOutputNode.stream;
        outputNodes[id] = newOutputNode;
        audioMixStreams[id] = newAudioMixStream;
        for (let key in micNodes) {
            if (key === id) {
                console.log('skip mic(id=' + key + ') because same id=' + id);
            } else {
                console.log('connect mic(id=' + key + ') to this output');
                let otherMicNode = micNodes[key];
                otherMicNode.connect(newOutputNode);
            }
        }
    }
    window.localStream.addTrack(stream.getAudioTracks()[0])
}

function sendToAll(data) {
    for (const [_, dc] of Object.entries(dataChannels)) {
        dc.send(data)
    }
}

function onReceiveMessageCallback(event) {
    console.log(`Received Message ${event.data}`);
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

async function sendMixerSignal() {
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
