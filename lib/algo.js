const path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const program = require('commander');
const fileurl = require('file-url');
const repo = git('.');
const { withBrowser } = require('./browser');
const { setVerbosity: setLogVerbosity, log } = require('./log');
const { asyncFilter, asyncAll, asyncAny, asyncMap } = require('./async-util');
const { subdirectories, inDirectory, fileExists } = require('./fs-util');



class Repository
{
    constructor(git)
    {
        this.git = git;
    }

    get rootDirectory()
    {
        return this.__cachedRootDirectory = this.__cachedRootDirectory || (async () =>
        {
            log('Looking for root directory...');
            const result = (await repo.revparse(["--show-toplevel"])).trim();
            log(`Root directory found: ${result}`);

            return result;
        })();
    }

    get chaptersDirectory()
    {
        return this.__cachedChaptersDirectory = this.__cachedChaptersDirectory || (async () =>
        {
            const rootDirectory = await this.rootDirectory;

            return path.resolve(rootDirectory, 'chapters');
        })();
    }

    async chapterDirectory(id)
    {
        const result = path.resolve(await this.chaptersDirectory, id);

        log(`Expected path for chapter ${id} is ${result}`);

        return result;
    }

    get chapters()
    {
        return (async () =>
        {
            const chaptersDirectory = await this.chaptersDirectory;
            const subdirs = await subdirectories(chaptersDirectory);
            const chapterSubdirs = await asyncFilter(subdirs, async (id) => this.isChapterDirectory( await this.chapterDirectory(id) ) );

            return asyncMap( chapterSubdirs, (id) => this.createChapter(id) );
        })();
    }

    async isChapterDirectory(parentPath)
    {
        log(`Checking if ${parentPath} is a chapter directory`);

        const relativePath = await this.relativeToRoot(parentPath);
        if ( !/^chapters[\\/](.+)$/.exec(relativePath) )
        {
            log(`${relativePath} does not have the required chapter/<id> pattern`);
            return false;
        }
        else
        {
            const result = await asyncAll( ['student.js', 'tests.html', 'bundle.js'], (filename) => {
                const filePath = path.resolve(parentPath, filename);

                return fileExists(filePath);
            });

            if ( result )
            {
                log(`Chapter found at ${parentPath}`);

                return true;
            }
            else
            {
                log(`Chapter NOT found at ${parentPath}`);

                return false;
            }
        }
    }

    async createChapter(id)
    {
        return new Chapter(this, id);
    }

    async relativeToRoot(p)
    {
        log(`Determining path relative to repository root of ${p}`);
        const relativePath = path.relative(await this.rootDirectory, p);
        log(`Relative path of ${p} found: ${relativePath}`);

        return relativePath;
    }

    async toAbsolutePath(p)
    {
        return path.resolve(await this.rootDirectory, p);
    }

    async getAbsolutePathsOfModifiedFiles()
    {
        log(`Determining absolute paths of files modified according to git`);

        log(`Getting git status`);
        const status = await this.git.status();
        const modifiedFiles = status.modified;
        const result = await asyncMap(modifiedFiles, modifiedFile => this.toAbsolutePath(modifiedFile));

        log(`Files modified according to git:\n  ${result.join("\n  ")}`);
        return result;
    }

    async chapterFromDirectory(chapterPath)
    {
        log(`Trying to deduce chapter from path ${chapterPath}`);
        log(`First checking if ${chapterPath} is a chapter directory`);

        if ( await this.isChapterDirectory(chapterPath) )
        {
            log(`${chapterPath} is a chapter directory`);

            const relativePath = await this.relativeToRoot(chapterPath);

            log(`Checking relative path ${relativePath} for validity`);
            if ( /^chapters\/[^\\/]+\/$/.exec(relativePath) )
            {
                console.error(`Relative path ${relativePath} cannot be used as chapter id`);
                process.exit(-1);
            }
            else
            {
                log(`Relative path ${relativePath} has been found valid`);
                return await this.createChapter(relativePath);
            }
        }
        else
        {
            log(`${chapterPath} is not a chapter directory`);

            return undefined;
        }
    }
}

class Chapter
{
    constructor(parentRepository, id)
    {
        this.parentRepository = parentRepository;
        this.id = id;
    }
    
    get path()
    {
        return (async () => {
            const rootDirectory = await this.parentRepository.rootDirectory;
            
            return path.resolve(rootDirectory, 'chapters', this.id);
        })();
    }

    async test(browser)
    {
        const htmlPath = path.resolve(await this.path, 'tests.html');
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

            const studentJsPath = path.resolve(await this.path, 'student.js');
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
}


async function repositoryAtCurrentLocation()
{
    log(`Looking for repository at current location ${process.cwd()}`);

    const gitRepo = git('.');

    if ( await gitRepo.checkIsRepo() )
    {
        return new Repository(gitRepo);
    }
    else
    {
        console.error(`No git repository found at current location ${process.cwd()}. SAD!`);
        process.exit(-1);
    }
}

async function listChapters(options)
{
    const repo = await repositoryAtCurrentLocation();
    const chapters = await repo.chapters;

    for ( let chapter of chapters )
    {
        const isModified = await chapter.isModified;
        const prefix = isModified ? `*` : `.`;

        if ( !options.modified || isModified )
        {
            console.log(`${prefix} ${chapter.id}`);
        }
    }
}

async function runTests(options)
{
    const repo = await repositoryAtCurrentLocation();

    if ( options.all )
    {
        await runAllTests();
    }
    else
    {
        await runTestsInCurrentDirectory();
    }

    async function runTestsInCurrentDirectory()
    {
        const currentDirectory = process.cwd();
        log(`Running tests in current directory ${currentDirectory}`);

        log(`Getting chapter associated with current directory ${currentDirectory}`);
        const chapter = await repo.chapterFromDirectory(currentDirectory);

        if ( !chapter )
        {
            console.error(`Current directory ${currentDirectory} is not a chapter directory`);
            process.exit(-1);
        }
        else
        {
            log(`Chapter found in ${currentDirectory}; running tests`);

            withBrowser(async (browser) => {
                const testResults = await chapter.test(browser);
                printTestResults(chapter.id, testResults);
            });
        }
    }

    async function runAllTests()
    {
        log(`Running all tests`);

        withBrowser(async (browser) => {
            const chapters = await repo.chapters;
            
            for ( let chapter of chapters )
            {
                const results = await chapter.test(browser);
                printTestResults(chapter.id, results);
            }
        });
    }

    function printTestResults(chapterId, testResults)
    {
        for ( let section of Object.keys(testResults.results) )
        {
            const slug = `${chapterId}/${section}`;
            const score = testResults.results[section];
            
            console.log(`${slug} ${score.grade} ${score.maximum}`);
        }
    }
}

async function upload(options)
{
    const repo = await repositoryAtCurrentLocation();

    if ( options.all )
    {
        await uploadAll();
    }
    else
    {
        await uploadCurrentChapter();
    }

    async function uploadCurrentChapter()
    {
        const currentDirectory = process.cwd();

        log(`Getting chapter associated with current directory ${currentDirectory}`);
        const chapter = await repo.chapterFromDirectory(currentDirectory);

        if ( !chapter )
        {
            console.error(`Current directory ${currentDirectory} is not a chapter directory`);
            process.exit(-1);
        }
        else
        {
            console.log(await chapter.isModified);
        }
    }

    async function uploadAll()
    {
        // TODO
    }
}

async function main()
{
    program
        .option('-v, --verbose', 'Verbose output');

    program
        .command('chapters')
        .description(`list chapters`)
        .option('-m, --modified', `show only modified chapters`)
        .action((options) => {
            processGlobalArguments(options.parent);
            listChapters(options);
        });

    program
        .command('test')
        .description(`run tests`)
        .option('-a, --all', 'run tests from all chapters')
        .action((options) => {
            processGlobalArguments(options.parent);
            runTests(options);
        });

    program
        .command('upload')
        .description(`uploads solution`)
        .option('-a, --all', 'run tests from all chapters')
        .action((options) => {
            processGlobalArguments(options.parent);
            upload(options);
        });

    program.parse(process.argv);


    function processGlobalArguments(args)
    {
        if ( args.verbose )
        {
            setLogVerbosity(true);
        }
    }
}

main()