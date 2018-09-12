const Path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const program = require('commander');
const { withBrowser } = require('./browser');
const { setVerbosity: setLogVerbosity, log, context } = require('./log');
const Repository = require('./repository');
const request = require('request-promise-native');



const UPSTREAM_URL = 'https://github.com/UCLeuvenLimburg/algoritmisch-denken-oefeningen-1819.git';

async function findRepositoryAtCurrentLocation()
{
    return await context(`Looking for repository at current location ${process.cwd()}`, async () => {
        const gitRepo = git('.');

        if ( await gitRepo.checkIsRepo() )
        {
            const remotes = await gitRepo.getRemotes(true);
            let foundUpstream = false;

            for ( let { name, refs } of remotes )
            {
                if ( name === 'upstream' )
                {
                    if ( refs.fetch !== UPSTREAM_URL )
                    {
                        console.error(`Remote 'upstream' is linked to wrong URL`);
                        console.error(`This doesn't seem to be an algoritmisch-denken repo`);
                        process.exit(-1);
                    }
                    else
                    {
                        foundUpstream = true;
                    }
                }
            }

            if ( !foundUpstream )
            {
                console.error(`No remote 'upstream' found`);
                console.error(`This doesn't seem to be an algoritmisch-denken repo`);
                process.exit(-1);
            }

            return new Repository(gitRepo);
        }
        else
        {
            console.error(`No git repository found at current location ${process.cwd()}.`);
            process.exit(-1);
        }
    });
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

async function gatherTestResults(repo)
{
    return context(`Running all tests`, async () => {
        return withBrowser(async (browser) => {
            const result = {};
            const chapters = await repo.chapters;
            
            for ( let chapter of chapters )
            {
                console.error(`Running tests from chapter ${chapter.id}`);

                const results = await chapter.test(browser);
                result[chapter.id] = results;
            }

            return result;
        });
    });
}

async function runTests(options)
{
    const repo = await findRepositoryAtCurrentLocation();
    const testResults = await gatherTestResults(repo);

    if ( options.show === 'exercise' )
    {
        for ( let chapterId of Object.keys(testResults) )
        {
            const chapterTestResults = testResults[chapterId].results;

            for ( let testId of Object.keys(chapterTestResults) )
            {
                const { grade, maximum } = chapterTestResults[testId];

                console.log(`${chapterId} ${testId} ${grade} ${maximum}`);
            }
        }
    }
    else if ( options.show === 'chapter' )
    {
        for ( let chapterId of Object.keys(testResults) )
        {
            const chapterTestResults = testResults[chapterId].results;
            let totalGrade = 0;
            let totalMaximum = 0;

            for ( let testId of Object.keys(chapterTestResults) )
            {
                const { grade, maximum } = chapterTestResults[testId];

                totalGrade += grade;
                totalMaximum += maximum;
            }

            console.log(`${chapterId} ${totalGrade} ${totalMaximum}`);
        }
    }
    else if ( options.show === 'total' )
    {
        let totalGrade = 0;
        let totalMaximum = 0;

        for ( let chapterId of Object.keys(testResults) )
        {
            const chapterTestResults = testResults[chapterId].results;

            for ( let testId of Object.keys(chapterTestResults) )
            {
                const { grade, maximum } = chapterTestResults[testId];

                totalGrade += grade;
                totalMaximum += maximum;
            }
        }

        console.log(`${totalGrade} ${totalMaximum}`);
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
        console.log(`Committing solutions for chapter ${chapter.id}...`);

        await chapter.addAndCommit();

        console.log(`Pushing commits to origin`);
        await repo.push();

        console.log(`Commits have been pushed`);
    }

    async function uploadAll()
    {
        const chapters = await repo.chapters;

        for ( let i = 0; i !== chapters.length; ++i )
        {
            const chapter = chapters[i];
            console.log(`Committing chapter ${chapter.id} (${i + 1} out of ${chapters.length})`);

            await chapter.addAndCommit();
        }

        console.log(`Pushing commits to origin`);
        await repo.push();

        console.log(`All commits have been pushed`);
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
    g.addRemote('upstream', UPSTREAM_URL);

    console.log(`Done!`);
}

async function pullUpdatesFromOrigin(options)
{
    const repo = await findRepositoryAtCurrentLocation();

    console.log(`Pulling in data from origin remote`);
    await repo.git.pull('origin', 'master');
}

async function pullUpdatesFromUpstream(options)
{
    const repo = await findRepositoryAtCurrentLocation();

    console.log(`Pulling in data from upstream remote`);
    await repo.git.pull('upstream', 'master');

    console.log(`Pushing to origin`);
    await repo.git.push('origin', 'master');
}

function getPackageInfo()
{
    return require('../package.json');
}

function fetchVersion()
{
    return getPackageInfo().version;
}

async function fetchOnlineVersion()
{
    return await context(`Looking if a newer version is available...`, async () => {
        log(`Fetching package info`);
        const packageInfo = getPackageInfo();

        const gitUrl = packageInfo.repository.url;
        log(`Extract git repository URL from package.json; got ${gitUrl}`);

        const match = /^git\+https:\/\/github.com\/(.*).git$/.exec(gitUrl);

        if ( !match )
        {
            console.error(`Did not recognize URL format: ${gitUrl}`);
            process.exit(-1);
        }
        else
        {
            const suburl = match[1];
            const url = `https://raw.githubusercontent.com/${suburl}/master/package.json`
            log(`Online package.json url: ${url}`);

            log(`Fetching online package info at ${url}`);
            const onlinePackageInfo = await request(url);
            log(`Received package.json:\n${onlinePackageInfo}`);

            log(`Parsing package.json`);
            const parsed = JSON.parse(onlinePackageInfo);

            const onlineVersion = parsed.version;
            log(`Latest version available: ${onlineVersion}`);

            return onlineVersion;
        }
    });
}

async function updateSelf(options)
{
    const localVersion = fetchVersion();
    log(`Locally installed version: ${localVersion}`);

    const onlineVersion = await fetchOnlineVersion();
    log(`Latest version available online: ${onlineVersion}`);

    if ( localVersion === onlineVersion )
    {
        console.log(`You have the latest version installed (${localVersion}).`);
    }
    else
    {
        console.log(`You currently have version ${localVersion} installed.`)
        console.log(`A newer version (${onlineVersion}) of this script is available.`);
        console.log(`Please run the following command:`);
        console.log(`  npm update -g algoritmisch-denken`);
        process.exit(-1);
    }
}

async function fullMonty(options)
{
    if ( !options.skipUpdateSelf )
    {
        await updateSelf({});
    }

    await pullUpdatesFromOrigin({});
    await pullUpdatesFromUpstream({});

    if ( !options.skipTests )
    {
        console.log(`Running all tests`);
        const repo = await findRepositoryAtCurrentLocation();
        await gatherTestResults(repo);
    }

    await upload({ all: true });

    console.log(`Done!`);
}

async function main()
{
    program
        .version(fetchVersion())
        .option('-v, --verbose', 'Verbose output');

    program
        .command('go')
        .description(`combination of update-self, update, upload`)
        .option('--skip-tests', 'skips running the tests')
        .option('--skip-update-self', 'skips checking for newer version')
        .action((options) => {
            processGlobalArguments(options.parent);
            fullMonty(options);
        });

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
        .option('-s, --show [level]', 'determines output (exercise|chapter|total)', /^(exercise|chapter|total)$/, 'total')
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
        .command('update')
        .description(`fetches updates from central repository`)
        .action((options) => {
            processGlobalArguments(options.parent);
            pullUpdatesFromUpstream(options);
        });

    program
        .command('update-self')
        .description(`updates this script`)
        .action((options) => {
            processGlobalArguments(options.parent);
            updateSelf(options);
        });

    program
        .command('git-status')
        .description(`shows git status`)
        .action((options) => {
            processGlobalArguments(options.parent);
            gitStatus(options);
        });

    program.parse(process.argv);

    if ( process.argv.length < 3 )
    {
        fullMonty( {} );
    }

    function processGlobalArguments(args)
    {
        if ( args.verbose )
        {
            setLogVerbosity(true);
        }
    }
}

main()