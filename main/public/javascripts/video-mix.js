let canvasMix = document.getElementById('mix-canvas');
canvasMix.addEventListener('mousedown', clickMixCenter, false);
canvasMix.addEventListener('mousemove', moveMixCenter, false);

let ctxMix = canvasMix.getContext('2d');
ctxMix.fillStyle = 'rgb(128, 192, 128)';
let mixStream = null;
let animationId = null;

// for audio
let audioContext = new window.AudioContext();
let micNodes = [];
let outputNodes = [];
let audioMixStreams = [];

// mixed video stream
mixStream = canvasMix.captureStream(15);
animationId = window.requestAnimationFrame(drawCanvas)

function onMemberStreamJoin(id, stream, isRemoteVoiceOnly) {
    muteRemoteVideos();

    let audioTracks = stream.getAudioTracks();
    let videoTracks = stream.getVideoTracks();
    if (audioTracks && (audioTracks.length > 0)) {
        console.log('stream has audioStream. audio track count = ' + audioTracks.length);
        console.log(' stream.id=' + stream.id + ' , track.id=' + audioTracks[0].id);

        // --- prepare audio mic node ---
        let micNode = audioContext.createMediaStreamSource(stream);
        micNodes[id] = micNode;

        for (let key in outputNodes) {
            if (key === id) {
                console.log('skip output(id=' + key + ') because same id=' + id);
            } else {
                let otherOutputNode = outputNodes[key];
                micNode.connect(otherOutputNode);
            }
        }

    } else if (videoTracks && (videoTracks.length > 0)) {
        console.log('stream is video only stream.');
    }
}

function muteRemoteVideos() {
    remoteVideo0.volume = 0;
    remoteVideo1.volume = 0;
    remoteVideo2.volume = 0;
    remoteVideo3.volume = 0;
}

function onMemberStreamLeave(id, stream) {

    // clear
    clearMixCanvas();

    // --- remove outputNode ---
    let thisOutputNode = outputNodes[id];
    if (thisOutputNode) {
        for (let key in micNodes) {
            if (key === id) {
                console.log('skip disconnecting mic, because key=id (not connected)');
            } else {
                let micNode = micNodes[key];
                micNode.disconnect(thisOutputNode);
            }
        }

        thisOutputNode = null;
        delete outputNodes[id];
    } else {
        console.warn('micNode missed');
    }
    delete audioMixStreams[id];

    // --- disconnect mic from ohter output ---
    let thisMicNode = micNodes[id];
    if (thisMicNode) {
        for (let key in outputNodes) {
            if (key === id) {
                console.log('skip disconnecting output, because key=id (not connected)');
            } else {
                let outputNode = outputNodes[key];
                thisMicNode.disconnect(outputNode);
            }
        }
        thisMicNode = null;
        delete micNodes[id];
    } else {
        console.warn('micNode missed');
    }
}

function onPrepareLocalStream(id, peer) {
    console.log('--- prepare local stream --- id=' + id);

    // -- video stream ---
    peer.addStream(mixStream);

    // -- audio stream --
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
    peer.addStream(newAudioMixStream);
}

// ---- mix video ----
let videoPositionSet = [];
let mixWidth = 640;
let mixHeight = 480;
let halfWidth = mixWidth / 2;
let halfHeight = mixHeight / 2;
let smallWidth = mixWidth / 4;
let smallHeight = mixHeight / 4;
let largeWidth = mixWidth - smallWidth;
let largeheight = mixHeight - smallHeight;
let mixMode = 'matrix'; // 'stripe', 'horz-stripe', 'matrix-fusion', '3d'
resetVideoPosition();

function drawCanvas() {
    if (mixMode === 'stripe') {
        drawCanvasStripe();
    } else if (mixMode === 'horz-stripe') {
        drawCanvasHorzStripe();
    } else if (mixMode === 'matrix-fusion') {
        drawCanvasMatrixFusion();
    } else if (mixMode === 'cross') {
        drawCanvasCross();
    } else {
        drawCanvasMatrix();
    }

    // animation frame will be drop down, when window is hidden.
    animationId = window.requestAnimationFrame(drawCanvas);
}

function drawCanvasMatrix() {
    drawVideo(remoteVideo0, 0);
    drawVideo(remoteVideo1, 1);
    drawVideo(remoteVideo2, 2);
    drawVideo(remoteVideo3, 3);
}

function drawVideo(videoElement, index) {
    ctxMix.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight,
        videoPositionSet[index].left, videoPositionSet[index].top, videoPositionSet[index].width, videoPositionSet[index].height);
    ctxMix.fillText('member' + (index + 1), videoPositionSet[index].left + 2, videoPositionSet[index].top + 10);
}

function resetVideoPosition() {
    mixMode = 'matrix';

    videoPositionSet[0] = {left: 0, top: 0, width: halfWidth, height: halfHeight};
    videoPositionSet[1] = {left: 320, top: 0, width: halfWidth, height: halfHeight};
    videoPositionSet[2] = {left: 0, top: 240, width: halfWidth, height: halfHeight};
    videoPositionSet[3] = {left: 320, top: 240, width: halfWidth, height: halfHeight};

    // clear
    clearMixCanvas();
}

function clearMixCanvas() {
    ctxMix.fillRect(0, 0, mixWidth, mixHeight);
}

function setMixMode(mode) {
    mixMode = mode;
    console.log('set MixMode to:' + mode);

    // clear
    clearMixCanvas();
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


function drawCanvasStripe() {
    drawVideoStripe(remoteVideo0, 0);
    drawVideoStripe(remoteVideo1, 1);
    drawVideoStripe(remoteVideo2, 2);
    drawVideoStripe(remoteVideo3, 3);
}

function drawVideoStripe(videoElement, index) {
    let srcLeft = videoElement.videoWidth * (3.0 / 8.0);
    let srcTop = 0;
    let srcWidth = videoElement.videoWidth / 4;
    let srcHeight = videoElement.videoHeight;

    let destLeft = mixWidth / 4 * index;
    let destTop = 0;
    let destWidth = mixWidth / 4;
    let destHeight = mixHeight;

    ctxMix.drawImage(videoElement, srcLeft, srcTop, srcWidth, srcHeight, destLeft, destTop, destWidth, destHeight);
    ctxMix.fillText('member' + (index + 1), destLeft + 2, destTop + 10);
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
    drawVideoMatrixFusion(remoteVideo0, 0);
    drawVideoMatrixFusion(remoteVideo1, 1);
    drawVideoMatrixFusion(remoteVideo2, 2);
    drawVideoMatrixFusion(remoteVideo3, 3);
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