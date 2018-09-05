const path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const program = require('commander');
const util = require('util');
const fileurl = require('file-url');
const repo = git('.');
const { withBrowser } = require('./browser');
const { setVerbosity: setLogVerbosity, log } = require('./log');
const { asyncFilter, asyncAll, asyncMap } = require('./async-util');
const { subdirectories, inDirectory, fileExists } = require('./fs-util');

const promisify = util.promisify;


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

    get chapters()
    {
        return (async () =>
        {
            const rootDirectory = await this.rootDirectory;
            const subdirs = await subdirectories(rootDirectory);
            const chapterSubdirs = await asyncFilter(subdirs, id => this.isChapterDirectory( path.resolve(rootDirectory, id) ) );

            return asyncMap( chapterSubdirs, (id) => this.createChapter(id) );
        })();
    }

    async isChapterDirectory(parentPath)
    {
        log(`Checking if ${parentPath} contains chapter`);

        const result = await asyncAll( ['student.js', 'tests.html', 'bundle.js'], (filename) => {
            const filenPath = path.resolve(parentPath, filename);

            return fileExists(filenPath);
        });

        if ( result )
        {
            log(`Chapter found at ${parentPath}`);
        }
        else
        {
            log(`Chapter NOT found at ${parentPath}`);
        }

        return result;
    }

    async createChapter(id)
    {
        return new Chapter(id, path.resolve(await this.rootDirectory, id));
    }

    get modifiedChapters()
    {
        return (async () => {
            const status = await this.git.status();
            const modifiedChapters = [];

            for ( let modifiedFile of status.modified )
            {
                const match = /^(.+)\/student\.js$/.exec(modifiedFile);

                if ( match )
                {
                    const chapterId = match[1];
                    const chapter = this.createChapter(chapterId);

                    modifiedChapters.push(chapter);
                }
            }

            return modifiedChapters;
        });
    }

    async chapterFromDirectory(chapterPath)
    {
        if ( await this.isChapterDirectory(chapterPath) )
        {
            const rootDirectory = await this.rootDirectory;
            const relativePath = path.relative(rootDirectory, chapterPath);

            console.log(relativePath);
        }
    }
}

class Chapter
{
    constructor(id, path)
    {
        this.id = id;
        this.path = path;
    }

    async test(browser)
    {
        const htmlPath = path.resolve(this.path, 'tests.html');
        const page = await browser.newPage();
        const url = fileurl(htmlPath);
        
        await page.goto(url);
        const result = await page.evaluate('shell.runTests()');
    
        return result;
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



async function listChapters()
{
    const repo = await repositoryAtCurrentLocation();
    const chapters = await repo.chapters;

    for ( let chapter of chapters )
    {
        console.log(chapter.id);
    }
}

async function runTests(options)
{
    const repo = await repositoryAtCurrentLocation();

    withBrowser(async (browser) => {
        if ( options.all )
        {
            const chapters = await repo.chapters;
            
            for ( let chapter of chapters )
            {
                const results = await chapter.test(browser);
                printTestResults(chapter.id, results);
            }
        }
        else
        {
            const currentDirectory = process.cwd();

            repo.chapterFromDirectory(currentDirectory);
        }
    });


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

async function main()
{
    program
        .option('-v, --verbose', 'Verbose output');

    program
        .command('chapters')
        .description(`Lists chapters`)
        .action((options) => {
            processGlobalArguments(options.parent);
            listChapters();
        });

    program
        .command('test')
        .description(`Runs tests`)
        .option('-a, --all', 'Run tests from all chapters')
        .action((options) => {
            processGlobalArguments(options.parent);
            runTests(options);
        });

    program.parse(process.argv);

    // const repo = await repositoryAtCurrentLocation();
    // const chapters = await repo.chapters;

    //console.log(await repo.modifiedChapters());

    // withBrowser(async (browser) => {
    //     for ( let chapter of chapters )
    //     {
    //         console.log(await chapter.grade(browser));
    //     }
    // });


    function processGlobalArguments(args)
    {
        if ( args.verbose )
        {
            setLogVerbosity(true);
        }
    }
}

main()