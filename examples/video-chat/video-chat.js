const express = require('express')

const app = express()
const port = 3000
const path = require("path");
const http = require('http').createServer(app);
http.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
})
const io = require('socket.io')(http);

activeSockets = [];

io.on("connection", socket => {
    const existingSocket = activeSockets.find(
        existingSocket => existingSocket === socket.id
    );

    if (!existingSocket) {
        activeSockets.push(socket.id);
        socket.broadcast.emit("update-user-list", {
            users: [socket.id]
        });
        socket.on("disconnect", () => {
            activeSockets = activeSockets.filter(
                existingSocket => existingSocket !== socket.id
            );
            socket.broadcast.emit("remove-user", {
                socketId: socket.id
            });
        });
        socket.emit("update-user-list", {
            users: activeSockets.filter(
                existingSocket => existingSocket !== socket.id
            )
        });
        socket.on("call-user", data => {
            socket.to(data.to).emit("call-made", {
                offer: data.offer,
                socket: socket.id
            });
        });
        socket.on("make-answer", data => {
            socket.to(data.to).emit("answer-made", {
                socket: socket.id,
                answer: data.answer
            });
        });
    }
});


app.use(express.static(path.join(__dirname, "/public")));

