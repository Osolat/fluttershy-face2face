var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var favIconRouter = require('./routes/favicon');
var roomsRouter = require('./routes/rooms');

const port = 80
var app = express();
const http = require('http').createServer(app);
http.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
})

const io = require('socket.io')(http);
activeSockets = {};

io.on("connection", socket => {
    const roomID = socket.handshake.query['group-id'];
    if (!activeSockets.hasOwnProperty(roomID)) {
        activeSockets[roomID] = []
    }
    const existingSocket = activeSockets[roomID].find(
        existingSocket => existingSocket === socket.id
    );
    socket.on("request-user-list", (id) => {
        socket.emit("update-user-list", {
            users: activeSockets[id].filter(
                existingSocket => existingSocket !== socket.id
            )
        });
    })
    if (!existingSocket) {
        activeSockets[roomID].push(socket.id);
        socket.join(roomID);
        socket.to(roomID).emit("update-user-list", {
            users: [socket.id]
        });
        socket.on("disconnect", () => {
            activeSockets[roomID] = activeSockets[roomID].filter(
                existingSocket => existingSocket !== socket.id
            );
            socket.to(roomID).emit("remove-user", {
                socketId: socket.id
            });
        });
        socket.emit("update-user-list", {
            users: activeSockets[roomID].filter(
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

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/rooms', roomsRouter);
app.use('/favicon.ico', favIconRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
