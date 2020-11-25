const puppeteer = require('puppeteer');

async function screenCapMainPage() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost/');
    await page.screenshot({path: 'test-dls/example.png'});
    await browser.close();
}

async function createNewRoom(browser, groupName, password) {
    const page = await browser.newPage();
    if (logging) {
        page
            .on('console', message =>
                console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
            .on('pageerror', ({message}) => console.log(message))
            .on('response', response =>
                console.log(`${response.status()} ${response.url()}`))
            .on('requestfailed', request =>
                console.log(`${request.failure().errorText} ${request.url()}`))
    }
    await page.goto('http://localhost/');
    await page.click('aria/button[name="CREATE ROOM"]');
    await page.click('aria/textbox[name="Enter ID"]');
    await page.type('aria/textbox[name="Enter ID"]', groupName);
    await page.type('aria/textbox[name="Enter Room Password"]', password);
    await page.type('aria/textbox[name="Enter Matching Room Password"]', password);
    await page.click('aria/button[name="CREATE"]');
    await page.waitForNavigation();
    await page.screenshot({path: 'test-dls/exampleGroup.png'});
    await page.click('aria/button[name="Video"]');
    await page.click('aria/button[name="Document"]');
    await page.click('aria/button[name="Homework/TODO"]');
    await page.click('aria/button[name="Settings"]');
    await page.click('aria/button[name="Video"]');
    await page.click('#chat-text-input');
    await page.waitFor(8000);
    return page;
}

async function joinExisting(joinerBrowser, groupName, password) {
    const joinerPage = await joinerBrowser.newPage();
    if (logging) {
        joinerPage
            .on('console', message =>
                console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
            .on('pageerror', ({message}) => console.log(message))
            .on('response', response =>
                console.log(`${response.status()} ${response.url()}`))
            .on('requestfailed', request =>
                console.log(`${request.failure().errorText} ${request.url()}`))
    }
    await joinerPage.goto('http://localhost/');
    await joinerPage.click('aria/button[name="JOIN"]');
    await joinerPage.click('aria/textbox[name="Enter Room ID"]');
    await joinerPage.type('aria/textbox[name="Enter Room ID"]', groupName);
    await joinerPage.type('aria/textbox[name="Enter Nickname"]', 'Cotton Eye John');
    await joinerPage.type('aria/textbox[name="Enter Room Password"]', password);
    joinerPage.on('dialog', async dialog => {
        console.log(dialog.accept());
    });
    await joinerPage.click('aria/button[name="ENTER"]');
    await joinerPage.waitForNavigation();
    console.log("Did this");
    return joinerPage;
}

async function testCreateRoomAndJoin(groupName, password) {
    const browser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
        ]
    });
    let page = await createNewRoom(browser, groupName, password);
    const joinerBrowser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
        ]
    });

    let joinerPage = await joinExisting(joinerBrowser, groupName, password);
    //To establish webRTCConnection
    await page.waitFor(8000);
    await joinerPage.screenshot({path: 'test-dls/testCreateRoomAndJoin.png'});
    await joinerBrowser.close();
    await browser.close();
}

async function joinPreExistingRoom(groupName, password) {
    const joinerBrowser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
        ]
    });
    let joinerPage = joinExisting(joinerBrowser, groupName, password)
    await joinerPage.screenshot({path: 'test-dls/joinExisting.png'});
    await joinerBrowser.close();
}

async function joinPreExistingRoomAndHang(groupName, password) {
    const joinerBrowser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream'
        ]
    });
    let joinerPage = joinExisting(joinerBrowser, groupName, password)
    await joinerPage.screenshot({path: 'test-dls/joinExistingHang.png'});
    await joinerBrowser.close();
}

async function testCreateRoom(groupName, password) {
    const browser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
        ]
    });
    let page = await createNewRoom(browser, groupName, password);
    await page.screenshot({path: 'test-dls/exampleGroup.png'});
    await browser.close();
}

let logging = false;
joinPreExistingRoom("Russia", "1234").then(r => console.log("blyat"));
/*
screenCapMainPage().then(r => console.log("screenCapMainPage test done"));
testCreateRoom("Communism Carnival", "1234").then(r => console.log("testCreateRoom test done"));
testCreateRoomAndJoin("Putin Zone", "1234").then(_ => console.log("testCreateRoomAndJoin test done"))*/
