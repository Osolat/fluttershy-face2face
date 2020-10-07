const express = require('express')

const app = express()
const port = 80
const path = require("path");

app.get('/.well-known/pki-validation/DA61A69AFD13E662F4CD77A1E114A27C.txt', function (req, res) {
    res.sendFile(path.join(__dirname, 'DA61A69AFD13E662F4CD77A1E114A27C.txt'))
  })

 app.listen(port) 