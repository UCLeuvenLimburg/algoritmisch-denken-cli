const Path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const program = require('commander');
const fileurl = require('file-url');
const { withBrowser } = require('./browser');
const { setVerbosity: setLogVerbosity, log } = require('./log');
const Repository = require('./repository');




async function findRepositoryAtCurrentLocation()
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

async function getChapterAtCurrentLocation(repo)
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
        log(`Chapter ${chapter.id} found in ${currentDirectory}`);
        return chapter;
    }
}

async function listChapters(options)
{
    const repo = await findRepositoryAtCurrentLocation();
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
    const repo = await findRepositoryAtCurrentLocation();

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
        const chapter = await getChapterAtCurrentLocation(repo);

        log(`Running tests`);

        withBrowser(async (browser) => {
            const testResults = await chapter.test(browser);
            printTestResults(chapter.id, testResults);
        });
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
    const repo = await findRepositoryAtCurrentLocation();

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
        const chapter = await getChapterAtCurrentLocation(repo);
        console.log(`Uploading solutions for chapter ${chapter.id}...`);

        await chapter.upload();

        console.log(`Done!`);
    }

    async function uploadAll()
    {
        const chapters = await repo.chapters;

        for ( let i = 0; i !== chapters.length; ++i )
        {
            const chapter = chapters[i];
            console.log(`Uploading chapter ${chapter.id} (${i} out of ${chapters.length})`);

            chapter.upload();
        }

        console.log(`Done!`);
    }
}

async function gitStatus(options)
{
    const repo = await findRepositoryAtCurrentLocation();
    const status = await repo.git.status();
    
    console.log(status);
}

async function initialize(url, options)
{
    const target = options.directory || 'algoritmisch-denken';

    try
    {
        console.log(`Cloning repository at ${url} to ${target}`);
        const g = git();
        await g.clone(url, target);
    }
    catch ( e )
    {
        console.error(`An error occurred while cloning.`);
        console.error(`Check the url or ask for help.`);
        process.exit(-1);
    }

    console.log(`Adding remote upstream`);
    const g = git(target);
    g.addRemote('upstream', 'E:/repos/ucll/algo/test/upstream'); // TODO!!

    console.log(`Done!`);
}

async function main()
{
    program
        .option('-v, --verbose', 'Verbose output');

    program
        .command('initialize [url]')
        .description(`fetches a student repository`)
        .option('-d, --directory <path>', `target directory (default: algoritmisch-denken)`)
        .action((url, options) => {
            processGlobalArguments(options.parent);
            initialize(url, options);
        });

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

    program
        .command('git-status')
        .description(`shows git status`)
        .action((options) => {
            processGlobalArguments(options.parent);
            gitStatus(options);
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