var express = require('express');
var router = express.Router();
var path = require('path');
const fs = require('fs');
/* GET home page. */
router.get('/', function (req, res, next) {
    res.sendFile(path.join(__dirname + '/../public/frontPage.html'));
});

function addGroupToDataBase(id, password) {
    console.log("Group ID: " + id);
    console.log("Password: " + password);

    fs.readFile('./database.json', (err, data) => {
        if (err) throw err;
        let groupData = JSON.parse(data);
        groupData[id] = {password: password}

        fs.writeFile('./database.json', JSON.stringify(groupData), (err) => {
            if (err) throw err;
            console.log('New group data written to local json database');
            console.log(groupData);
        });
    });
}

router.post('/', express.json({type: '*/*'}), (req, res) => {
    if (req.body.hasOwnProperty('group-id') && req.body.hasOwnProperty('password')) {
        addGroupToDataBase(req.body['group-id'], req.body.password)
    }
    res.json(req.body);
})
module.exports = router;
