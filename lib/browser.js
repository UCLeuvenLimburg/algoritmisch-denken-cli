const puppeteer = require('puppeteer');


async function createBrowser()
{
    return await puppeteer.launch({headless: true});
}

async function withBrowser(f)
{
    const browser = await createBrowser();

    try
    {
        return await f(browser);
    }
    finally
    {
        browser.close();
    }
}


module.exports = {
    createBrowser,
    withBrowser,
};