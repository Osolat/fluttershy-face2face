document.write('\
    <html lang="en"> \
    <head> \
        <meta charset="UTF-8"/> \
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/> \
        <meta http-equiv="X-UA-Compatible" content="ie=edge"/> \
        <title>Face-2-Face</title> \
        <link \
            href="https://fonts.googleapis.com/css?family=Montserrat:300,400,500,700&display=swap" \
            rel="stylesheet" \
        /> \
        <link rel="stylesheet" href="./stylesheets/style.css"/> \
        <script src="//ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js"></script> \
        <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.3.0/socket.io.js"></script> \
    </head> \
    \
    <body> \
    \
    <div id="container"> \
    \
    \
    \
        <section> \
        <div> \
            <form id="fileInfo"> \
            <input type="file" id="fileInput" name="files"/> \
            </form> \
            <button disabled id="sendFile">Send</button> \
            <button disabled id="abortButton">Abort</button> \
        </div> \
        \
        <div class="progress"> \
            <div class="label">Send progress: </div> \
            <progress id="sendProgress" max="0" value="0"></progress> \
        </div> \
        \
        <div class="progress"> \
            <div class="label">Receive progress: </div> \
            <progress id="receiveProgress" max="0" value="0"></progress> \
        </div> \
        \
        <div id="bitrate"></div> \
        <a id="download" ></a> \
        <span id="status"></span> \
        \
        </section> \
    \
    \
    </div> \
    \
    <script src="https://webrtc.github.io/adapter/adapter-latest.js"></script> \
    <script src="javascripts/filetransfer-main.js" type="module"></script> \
    \
    </body>\
    </html> \
    \
');