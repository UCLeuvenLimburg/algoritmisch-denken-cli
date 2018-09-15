const Path = require('path');
const fileurl = require('file-url');
const { log, context } = require('./log');


class Chapter
{
    constructor(parentRepository, id)
    {
        this.parentRepository = parentRepository;
        this.id = id;
    }
    
    get absolutePath()
    {
        return (async () => {
            const rootDirectory = await this.parentRepository.rootDirectory;
            
            return Path.resolve(rootDirectory, 'chapters', this.id);
        })();
    }

    async test(browser)
    {
        return await context(`Running tests for chapter ${this.id}`, async () => {
            const htmlPath = await this.getFileAbsolutePath('tests.html');
            log(`Path of html: ${htmlPath}`);
            
            const url = fileurl(htmlPath);
            log(`Url: ${url}`);

            log(`Creating new browser page`);
            const page = await browser.newPage();

            log(`Browsing to ${url}`);
            await page.goto(url);

            log(`Evaluating tests`);
            const result = await page.evaluate('shell.runTests()');
        
            return result;
        });
    }

    get isModified()
    {
        return context(`Checking if chapter ${this.id} is modified`, async () => {
            const studentJsPath = await this.getFileAbsolutePath('student.js');
            const modifiedFiles = await this.parentRepository.getAbsolutePathsOfModifiedFiles();

            log(`Checking if ${studentJsPath} has been modified according to git`);
            const result = modifiedFiles.some( modifiedFile => modifiedFile === studentJsPath );

            if ( result )
            {
                log(`Chapter ${this.id} has been modified`);
                return true;
            }
            else
            {
                log(`Chapter ${this.id} hasn't been modified`);
                return false;
            }
        });
    }

    async getFileAbsolutePath(filename)
    {
        return Path.resolve(await this.absolutePath, filename);
    }

    async addAndCommit()
    {
        return await context(`Uploading chapter ${this.id}`, async () => {

            if ( this.isModified )
            {
                log(`Getting absolute path of student.js of chapter ${this.id}`);
                const studentJsPath = await this.getFileAbsolutePath('student.js');
                log(`Absolute path of student.js of chapter ${this.id} is ${studentJsPath}`);

                const git = this.parentRepository.git;

                log(`Git-adding ${studentJsPath}`);
                await git.add(studentJsPath);

                log(`Git-committing`);
                const message = `${this.id}/student.js`;
                await git.commit(message);
            }
            else
            {
                log(`No need to commit ${this.id}`);
            }
        });
    }
}


module.exports = Chapter;