var express = require('express');
var router = express.Router();
var path = require('path');

/* GET fav icon. */
router.get('/favicon.ico', function (req, res, next) {
    res.sendFile(path.join(__dirname + '/../public/favicon.ico'));
});

module.exports = router;
