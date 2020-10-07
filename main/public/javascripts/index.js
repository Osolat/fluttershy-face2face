//Basic button setup
const textInput = $("#chat-text-input");
textInput.on("keypress", function (event) {
    if (event.which === 13 && !event.shiftKey) {
        event.preventDefault();
        const str = textInput.val();
        postChatMessage(str).then(() => textInput.val(""));
    }
});
start();
const peerConnection = new RTCPeerConnection();

peerConnection.ontrack = function ({streams: [stream]}) {
    const remoteVideo = document.getElementById("remote-video");
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
    }
};
const socket = io.connect("localhost");

socket.on('connect', (socket) => {
    console.log("Connected to discovery server through socket.");
})

socket.on("update-user-list", ({users}) => {
    updateUserList(users);
    let RTCConnection =
});

socket.on("remove-user", ({socketId}) => {
    const elToRemove = document.getElementById(socketId);

    if (elToRemove) {
        elToRemove.remove();
    }
});

let isAlreadyCalling = false;
socket.on("answer-made", async data => {
    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
    );

    if (!isAlreadyCalling) {
        callUser(data.socket);
        isAlreadyCalling = true;
    }
});

socket.on("call-made", async data => {
    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer)
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

    socket.emit("make-answer", {
        answer,
        to: data.socket
    });
});

function updateUserList(socketIds) {
    const activeUserContainer = document.getElementById("active-user-container");
    socketIds.forEach(socketId => {
        const alreadyExistingUser = document.getElementById(socketId);
        if (!alreadyExistingUser) {
            const userContainerEl = createUserVideoItemContainer(socketId);
            activeUserContainer.appendChild(userContainerEl);

        }
    });
}

function createUserVideoItemContainer(socketId) {
    const userVideoContainerEl = document.createElement("div");
    const userVideoEl = document.createElement("video");
    userVideoContainerEl.setAttribute("class", "active-user-video");
    userVideoEl.setAttribute("id", socketId);
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

function start() {
    console.log('Requesting local stream');
    navigator.mediaDevices
        .getUserMedia({
            audio: true,
            video: true
        })
        .then(gotStream)
        .catch(e => console.log('getUserMedia() error: ', e));
}

function gotStream(stream) {
    console.log('Received local stream');
    const localVideo = document.getElementById("local-video");
    localVideo.srcObject = stream;
    window.localStream = stream;
}

async function postChatMessage(str) {
    console.log("Uploaded message: " + str);
}

async function callUser(socketId) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

    socket.emit("call-user", {
        offer,
        to: socketId
    });
}