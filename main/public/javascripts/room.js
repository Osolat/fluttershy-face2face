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
let mixingPeerCollection = new Set();
//mixingPeerCollection.add("34kg3h5ghj2gdywtquyd34")
//mixingPeerCollection.add("uifewgfbyu3u3y43gchgef")
//mixingPeerCollection.add("dgagagagawewe42342rhfh")

// for audio
let audioContext = new window.AudioContext();
let micNodes = [];
let outputNodes = [];
let audioMixStreams = [];


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

//connectionOutgoing = {}
//connectionOutgoing[id_1] = {id_1, id_2, id_3}
let networkButton = document.getElementById('NetworkTab')
networkButton.addEventListener('click', () => {
    populateNetwork()
})

const sendFileButton = document.querySelector('button#sendFile');
sendFileButton.addEventListener('click', () => {
    console.log(dataChannels)
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
var useNetWorkSplit = true
let socket;
let roomID;
let nickName = "Anonymous";

//Determines the group of each peer.
var group = ""
if (isMixingPeer == true) {
    group = "mixing"
} else {
    group = "nonMixing"
}

//Sets up the initial data for the network graph
var netGraphTopologyData = {
    nodes: [
        { id: "me", group: group }
    ],
    edges: []

}

var networkSplit = {
    id1: ["p1", "p2", "p3", "p4"],                                      //1st group
    id2: [],                                                  //2nd group
    id3: []                                                       //mixers
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
    socket = io.connect(window.location.hostname, { query: { "group-id": roomID } });
    bootAndGetSocket().then(r => console.log("Setup finished"));
}

authenticateUser();

async function bootAndGetSocket() {
    await initLocalStream();
    // TODO: Handle different room IDs.
    socket.on('connect', (socket) => {
        console.log("Connected to discovery server through socket.");
    })

    socket.on("update-user-list", ({ users }) => {
        console.log("Got 'update-user-list'");
        updateUserList(users);
    });

    socket.on("latest-names", (goym) => {
        RTCConnectionNames = JSON.parse(goym);
        for (const property in RTCConnections) {
            console.log(`${property}: ${RTCConnectionNames[property]}`);
        }
    });

    socket.on("remove-user", ({ socketId }) => {
        const elToRemove = document.getElementById(socketId);
        if (elToRemove) {
            delete RTCConnections[socketId];
            activeConnectionSize--;
            delete RTCConnectionsCallStatus[socketId];
            delete RTCConnectionNames[socketId];
            roomConnectionsSet.delete(socketId);
            mixingPeerCollection.delete(socketId)                                   //When a mixing peer leave, delete it from the mixingPeerCollection
            updateOnRemove(roomConnectionsSet)                                      //Update graph according to the deletion of nodes
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
    rtcConnection.ontrack = function ({ streams: [stream] }) {
        const remoteVideo = document.getElementById(socketId);
        if (remoteVideo) {
            remoteVideo.srcObject = stream;
            if (isMixingPeer) remoteVideo.volume = 0;
        }
        let micNode = audioContext.createMediaStreamSource(stream);
        micNodes[socketId] = micNode;
        for (let key in outputNodes) {
            console.log("Iterate output nodes")
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
        muteRemoteVideos();
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
    if (isMixingPeer) {
        window.localStream = mixStream;
        let newOutputNode = audioContext.createMediaStreamDestination();
        let newAudioMixStream = newOutputNode.stream;
        outputNodes[-1] = newOutputNode;
        audioMixStreams[-1] = newAudioMixStream;
        for (let key in micNodes) {
            if (key === -1) {
                console.log('skip mic(id=' + key + ') because same id=' + id);
            } else {
                console.log('connect mic(id=' + key + ') to this output');
                let otherMicNode = micNodes[key];
                otherMicNode.connect(newOutputNode);
            }
        }
        window.localStream.addTrack(newAudioMixStream.getAudioTracks()[0])
    } else {
        window.localStream.addTrack(stream.getAudioTracks()[0])
    }
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
        case "requestNetworkNodes":
            var myNeighbours = JSON.stringify({ nodes: Array.from(roomConnectionsSet), type: "requestNetworkCallback", origin: socket.id })
            event.target.send(myNeighbours)
            break;
        case "requestMixingPeers":
            var mixingPeers = JSON.stringify({ nodes: Array.from(mixingPeerCollection), type: "requestMixingPeerCallback", origin: socket.id })
            event.target.send(mixingPeers)
            break;
        case "requestNetworkSplit":
            console.log("Now im here yo")
            var split = JSON.stringify({ dataSplit: (networkSplit), type: "requestSplitCallback", origin: socket.id })
            console.log(split)
            event.target.send(split)
            break;
        case "requestSplitCallback":
            console.log("No problem ejnar")
            console.log(data.dataSplit)
            console.log(netGraphTopologyData)
            data.dataSplit.id1.forEach(it => {
                if (findDuplicateNode != true) {
                    netGraphTopologyData.nodes.push({id: it, group: "nonMixing"})
                } 
            })

            data.dataSplit.id2.forEach(it2 => {
                if (findDuplicateNode != true) {
                    netGraphTopologyData.nodes.push({id: it2, group: "nonMixing"})
                }
            })

            for (var i = 0; i < data.dataSplit.id3.length; i++) {
                if (findDuplicateNode != true) {
                    netGraphTopologyData.nodes.push({id: data.dataSplit.id3[i], group: "mixing"})
                }
                addEdges(data.dataSplit.id3[i], data.dataSplit.id3)

                data.dataSplit.id2.forEach(it2 => {
                    if (findDuplicateEdge(data.dataSplit.id3[1], it2) != true) {
                        netGraphTopologyData.edges.push({from: data.dataSplit.id3[1], to: it2})
                    }
                })

                data.dataSplit.id1.forEach(it1 => {
                    if (findDuplicateEdge(data.dataSplit.id3[0], it1) != true) {
                        netGraphTopologyData.edges.push({from: data.dataSplit.id3[0], to: it1})
                    }
                })

            

            }
            updateGraph()
            break;    
        case "requestNetworkCallback":
            data.nodes
            console.log("data.nodes")
            console.log(data.nodes)
            //console.log("NetGrphTopologyData")
            //console.log(netGraphTopologyData)
            console.log("ConnectionSet")
            console.log(roomConnectionsSet)
            console.log("socket id")
            console.log(socket.id)

            data.nodes.forEach(element => {
                if (element != socket.id && findDuplicateNode(element) != true) {                                                                 //Case where we are looking at all the nodes that "me" is connected to
                    netGraphTopologyData.nodes.push({ id: element, group: "nonMixing" })
                    if (mixingPeerCollection.size == 0 && findDuplicateEdge("me", element) != true) {
                        netGraphTopologyData.edges.push({ from: 'me', to: element })
                        addEdges(element, data.nodes)
                    }

                } else {                                                                                                                            //Case where we are looking at the node id of "me"
                    roomConnectionsSet.forEach(element1 => {
                        if (findDuplicateNode(element1) != true) {
                            netGraphTopologyData.nodes.push({ id: element1, group: "nonMixing" })
                            if (mixingPeerCollection.size == 0 && findDuplicateEdge("me", element1) != true) {
                                netGraphTopologyData.edges.push({ from: 'me', to: element1 })
                                addEdges(element1, roomConnectionsSet)
                            }
                        }
                    })
                }
            });
            updateGraph()
            break;
        case "requestMixingPeerCallback":
            data.nodes
            data.nodes.forEach(element => {
                if (element != socket.id) {
                    setInitData()
                    mixingPeerCollection.add(element)
                    mixingPeerCollection.forEach(item => {
                        if (findDuplicateNode(item) != true) {
                            netGraphTopologyData.nodes.push({ id: item, group: "mixing" })
                        }
                    })

                    if (mixingPeerCollection.size == 2) {
                        twoMixerToplogy(data.nodes, roomConnectionsSet, element)

                    }
                    else if (findDuplicateEdge("me", element) != true) {
                        netGraphTopologyData.edges.push({ from: 'me', to: element })
                        addEdges(element, roomConnectionsSet)
                    }
                } else {
                    roomConnectionsSet.forEach(elem => {
                        if (elem != socket.id && findDuplicateEdge("me", elem) != true) {
                            netGraphTopologyData.edges.push({ from: "me", to: elem })
                        }
                    })
                }
            });
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

function updateOnRemove(set) {
    if (mixingPeerCollection.size == 0) {
        if (netGraphTopologyData.nodes.length > (set.size) + 1) {
            setInitData()
        }
    } else {
        setInitData()
        mixingPeerCollection.forEach(item => {
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
    netGraphTopologyData = {
        nodes: [
            { id: "me", group: group }
        ],
        edges: []
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
    if (mixingPeerCollection.size > 0) {                                                            //Bug keep saying mixing is undefined
        var mixing = netWorkChart.group("mixing");
        mixing.normal().shape("star5");
        mixing.normal().fill("#ffa000");
        mixing.normal().height(40);
    }
    // Create group nonMixing
    var nonMixing = netWorkChart.group("nonMixing");                                                //Says nonmixing is undfined if a mixer joins first.
    nonMixing.normal().shape("circle");

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

    console.log("PopulateNetwork Function has been called!")
    if (isMixingPeer == true) {
        console.log("I am a mixing peer")
        mixingPeerCollection.add(socket.id)
    }

    anychart.onDocumentReady(function () {
        //TODO: 
        //Update graph also when peers leave the network. (DONE for non-mixing peers)
        //Update graph correct when there is two mixing peers

        if (useNetWorkSplit == true) {
            console.log("Hey ho im here")
            setInitData()
            //mixingPeerCollection.add("34kg3h5ghj2gdywtquyd34")
            let requestBody = { type: "requestNetworkSplit" }
            sendToAll(JSON.stringify(requestBody))
            updateGraph()
        } else {
            console.log(netGraphTopologyData)
            if (mixingPeerCollection.size == 0 && roomConnectionsSet.size == 0) {                  //Case when only one peer is connected, namely "me"
                setInitData()
                updateGraph()
            }
            if (mixingPeerCollection.size > 0 && roomConnectionsSet.size == 0) {                   //Case where there two peers connected one mixing and "me"
                setInitData()
                mixingPeerCollection.forEach(item => {
                    if (findDuplicateNode(item) != true) {
                        netGraphTopologyData.nodes.push({ id: item, group: "mixing" })
                    }
                    if (findDuplicateEdge("me", item) != true) {
                        netGraphTopologyData.edges.push({ from: "me", to: item })
                    }
                })
                updateGraph()
            }

            if (mixingPeerCollection.size >= 0) {                                                   //Case where there are multiple non-mixing peers and possibly multiple mixing peers.
                let requestMixingBody = { type: "requestMixingPeers" }
                sendToAll(JSON.stringify(requestMixingBody))
                if (roomConnectionsSet.size > 0) {
                    let requestBody = { type: "requestNetworkNodes" }
                    sendToAll(JSON.stringify(requestBody))
                }
                updateGraph()
            }
        }
    });

}
