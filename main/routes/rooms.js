var express = require('express');
var router = express.Router();
var path = require('path');
const fs = require('fs');
/* GET home page. */

/*
router.get('/', function (req, res, next) {
    res.sendFile(path.join(__dirname + '/../public/roomPage.html'));
});
*/

router.get('/', function (req, res, next) {
    fs.readFile('./database.json', (err, data) => {
        if (err) throw err;
        let groupData = JSON.parse(data);
        if (groupData.hasOwnProperty(req.query['group-id']) && groupData[req.query['group-id']].password === req.query.password) {
            //req.query.password === groupData.(req.query['group-id']).password
            res.cookie('group-id', req.query['group-id']);
            res.cookie('password', req.query.password);
            if (req.query.name !== undefined) {
                res.cookie('name', req.query.name);
            }
            res.status(200).send();
        } else {
            res.status(500).send('Wrong input!');
        }
    });
    //res.sendFile(path.join(__dirname + '/../public/frontPage.html'));
});
module.exports = router;
