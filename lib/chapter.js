const Path = require('path');
const fileurl = require('file-url');
const { setVerbosity: setLogVerbosity, log } = require('./log');


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
        const htmlPath = await this.getFileAbsolutePath('tests.html');
        const page = await browser.newPage();
        const url = fileurl(htmlPath);
        
        await page.goto(url);
        const result = await page.evaluate('shell.runTests()');
    
        return result;
    }

    get isModified()
    {
        return (async () => {
            log(`Checking if chapter ${this.id} is modified`);

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
        })();
    }

    async getFileAbsolutePath(filename)
    {
        return Path.resolve(await this.absolutePath, filename);
    }

    async addStudentJs()
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

    async upload()
    {
        
        await this.addStudentJs();
    }
}


module.exports = Chapter;