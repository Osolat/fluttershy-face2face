export {
    createChannel,
    onSendChannelStateChange,
    receiveChannelCallback,
    configureChannel,
    fileEmpty,
    sendData,
    makeDownloadLink,
    byteCount
}

'use strict';

let remoteConnection;
let dataChannels = [];
let fileReader;
const bitrateDiv = document.querySelector('div#bitrate');
const fileInput = document.querySelector('input#fileInput');
const abortButton = document.querySelector('button#abortButton');
const downloadAnchor = document.querySelector('a#download');
const sendProgress = document.querySelector('progress#sendProgress');
const receiveProgress = document.querySelector('progress#receiveProgress');
const statusMessage = document.querySelector('span#status');
const sendFileButton = document.querySelector('button#sendFile');


let receiveBuffer = [];
let receivedSize = 0;

let bytesPrev = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let bitrateMax = 0;


fileInput.addEventListener('change', handleFileInputChange, false);
abortButton.addEventListener('click', () => {
    if (fileReader && fileReader.readyState === 1) {
        console.log('Abort read!');
        fileReader.abort();
    }
});


async function handleFileInputChange(event) {
    const file = fileInput.files[0]
    if (!file) {
        console.log('No file chosen');
    } else {
        sendFileButton.disabled = false;
    }
}

async function createChannels(...localConnections) {
    console.log(localConnections)
    abortButton.disabled = false;
    sendFileButton.disabled = true;
    localConnections.forEach(createChannel)
    console.log(localConnections)
    console.log(dataChannels)
    await dataChannels.forEach(configureChannel)
}

function createChannel(connection, id) {
    let channel = connection.createDataChannel('sendDataChannel');
    console.log("Channel in create: " + channel)
    channel.addEventListener('open', onSendChannelStateChange(channel));
    channel.addEventListener('close', onSendChannelStateChange(channel));
    channel.addEventListener('error', error => console.error('Error in sendChannel to: ' + id, error));
    return channel
}

async function configureChannel(dataChannel, id) {
    dataChannel.binaryType = 'arraybuffer'
    dataChannel.addEventListener('open', onSendChannelStateChange(dataChannel));
    dataChannel.addEventListener('close', onSendChannelStateChange(dataChannel));
    dataChannel.addEventListener('error', error => console.error('Error in sendChannel:' + id, error));
}


function encode(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function makeDownloadLink(received, metadata, sender) {
    //downloadAnchor.href = URL.createObjectURL(received)
    //downloadAnchor.download = metadata.name;
    //downloadAnchor.textContent =
    //    `Click to download '${metadata.name}' (${metadata.size} bytes)`;
    //downloadAnchor.style.display = 'block';
    var ts = Date.now();
    var h = new Date(ts).getHours();
    var m = new Date(ts).getMinutes();
    var s = new Date(ts).getSeconds();
    h = (h < 10) ? '0' + h : h;
    m = (m < 10) ? '0' + m : m;
    s = (s < 10) ? '0' + s : s;
    var formattedTime = h + ':' + m + ':' + s + "  ";
    const chatEntryItem = document.createElement("li");
    chatEntryItem.innerHTML = '<p class="timestamp-chat">' + formattedTime + '(' + sender + ') ' +
        '<a href=' + URL.createObjectURL(received) + ' download=' + metadata.name + '>' + '<span class="chat-message">' + metadata.name + '</span>' + '</a>' + '</p>'
    console.log(chatEntryItem.innerHTML)
    const chatloglist = document.getElementById("chat-log-list");
    if (chatloglist) {
        chatloglist.appendChild(chatEntryItem);
    }
}

function byteCount(s) {
    return encodeURI(s).split(/%..|./).length - 1;
}

function sendData(sendChannels, hash, sender) {
    const file = fileInput.files[0];
    console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);
    let fileBuffer = []
    let bufferSize = 0;
    // Handle 0 size files.
    statusMessage.textContent = '';
    downloadAnchor.textContent = '';
    sendProgress.max = file.size;
    receiveProgress.max = file.size;
    const chunkSize = 16384;
    fileReader = new FileReader();
    let offset = 0;
    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
            console.log('FileRead.onload ', e);
            let buffer = e.target.result;
            let chunkView = new Uint8Array(buffer);
            console.log(chunkView);
            fileBuffer.push(chunkView);
            let strCode = encode(chunkView);
            console.log(strCode);
            let JSONdata = JSON.stringify({
                type: "file",
                hash: hash,
                payload: strCode
            })
            for (const [_, dc] of Object.entries(sendChannels)) {
                dc.send(JSONdata)
            }
            ;
            offset += buffer.byteLength;
            sendProgress.value = offset;
            if (offset < file.size) {
                readSlice(offset);
            } else {
                let metadata = {}
                metadata.name = file.name;
                metadata.size = file.size;
                metadata.type = file.type;
                let blob = new Blob(fileBuffer)
                console.log(blob)
                makeDownloadLink(blob, metadata, sender)
            }
        }
    );
    const readSlice = o => {
        console.log('readSlice ', o);
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
}

function fileEmpty() {
    const file = fileInput.files[0];
    if (file.size === 0) {
        bitrateDiv.innerHTML = '';
        statusMessage.textContent = 'File is empty, please select a non-empty file';
        return true;
    }
    return false
}

function closeDataChannels() {
    console.log('Closing data channels');
    sendChannel.close();
    console.log(`Closed data channel with label: ${sendChannel.label}`);
    if (receiveChannel) {
        receiveChannel.close();
        console.log(`Closed data channel with label: ${receiveChannel.label}`);
    }
    // re-enable the file select
    fileInput.disabled = false;
    abortButton.disabled = true;
    sendFileButton.disabled = false;
}


function receiveChannelCallback(dataChannel) {
    console.log('Receive Channel Callback');
    dataChannel.binaryType = 'blob';
    dataChannel.onmessage = onReceiveMessageCallback;
    dataChannel.onopen = onReceiveChannelStateChange;
    dataChannel.onclose = onReceiveChannelStateChange;
    receivedSize = 0;
    bitrateMax = 0;
    downloadAnchor.textContent = '';
    downloadAnchor.removeAttribute('download');
    if (downloadAnchor.href) {
        URL.revokeObjectURL(downloadAnchor.href);
        downloadAnchor.removeAttribute('href');
    }
}


function onSendChannelStateChange(sendChannel) {
    const readyState = sendChannel.readyState;
    console.log(`Send channel state is: ${readyState}`);
    console.log(sendChannel)
}

async function onReceiveChannelStateChange(event) {
    console.log(event)
    if (event.type === 'open') {
        timestampStart = (new Date()).getTime();
        timestampPrev = timestampStart;
        //statsInterval = setInterval(displayStats, 500);
        //await displayStats();
    }
}

// display bitrate statistics.
async function displayStats() {
    if (remoteConnection && remoteConnection.iceConnectionState === 'connected') {
        const stats = await remoteConnection.getStats();
        let activeCandidatePair;
        stats.forEach(report => {
            if (report.type === 'transport') {
                activeCandidatePair = stats.get(report.selectedCandidatePairId);
            }
        });
        if (activeCandidatePair) {
            if (timestampPrev === activeCandidatePair.timestamp) {
                return;
            }
            // calculate current bitrate
            const bytesNow = activeCandidatePair.bytesReceived;
            const bitrate = Math.round((bytesNow - bytesPrev) * 8 /
                (activeCandidatePair.timestamp - timestampPrev));
            bitrateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${bitrate} kbits/sec`;
            timestampPrev = activeCandidatePair.timestamp;
            bytesPrev = bytesNow;
            if (bitrate > bitrateMax) {
                bitrateMax = bitrate;
            }
        }
    }
}

function postChatMessage(str, nickname) {
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

