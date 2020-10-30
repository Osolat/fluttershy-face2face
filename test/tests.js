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
    page
        .on('console', message =>
            console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
        .on('pageerror', ({message}) => console.log(message))
        .on('response', response =>
            console.log(`${response.status()} ${response.url()}`))
        .on('requestfailed', request =>
            console.log(`${request.failure().errorText} ${request.url()}`))

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

async function testCreateRoomAndJoin(groupName, password) {
    const browser = await puppeteer.launch({
        args: [
            '--use-fake-ui-for-media-stream',
        ]
    });
    let page = await createNewRoom(browser, groupName, password);
    await browser.close();
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
    // const page = await browser.newPage();
    // page
    //     .on('console', message =>
    //         console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
    //     .on('pageerror', ({message}) => console.log(message))
    //     .on('response', response =>
    //         console.log(`${response.status()} ${response.url()}`))
    //     .on('requestfailed', request =>
    //         console.log(`${request.failure().errorText} ${request.url()}`))
    //
    // await page.goto('http://localhost/');
    // await page.click('aria/button[name="CREATE ROOM"]');
    // await page.click('aria/textbox[name="Enter ID"]');
    // await page.type('aria/textbox[name="Enter ID"]', groupName);
    // await page.type('aria/textbox[name="Enter Room Password"]', password);
    // await page.type('aria/textbox[name="Enter Matching Room Password"]', password);
    // await page.click('aria/button[name="CREATE"]');
    // await page.waitForNavigation();
    // await page.screenshot({path: 'test-dls/exampleGroup.png'});
    // await page.click('aria/button[name="Video"]');
    // await page.click('aria/button[name="Document"]');
    // await page.click('aria/button[name="Homework/TODO"]');
    // await page.click('aria/button[name="Settings"]');
    // await page.click('aria/button[name="Video"]');
    // await page.click('#chat-text-input');
    // await page.waitFor(5000);
    // await page.screenshot({path: 'test-dls/exampleGroup.png'});
    // await browser.close();
}

screenCapMainPage().then(r => console.log("screenCapMainPage test done"));
testCreateRoom("Russian Land", "1234").then(r => console.log("testCreateRoomAndJoin test done"));
