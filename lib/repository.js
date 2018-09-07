const Path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const repo = git('.');
const { log, context } = require('./log');
const { asyncFilter, asyncAll, asyncAny, asyncMap } = require('./async-util');
const { subdirectories, inDirectory, fileExists } = require('./fs-util');
const Chapter = require('./chapter');


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
            return await context(`Looking for repository's root directory`, async () => {
                const result = (await repo.revparse(["--show-toplevel"])).trim();
                log(`Root directory found: ${result}`);

                return result;
            });
        })();
    }

    get chaptersDirectory()
    {
        return this.__cachedChaptersDirectory = this.__cachedChaptersDirectory || (async () =>
        {
            const rootDirectory = await this.rootDirectory;

            return Path.resolve(rootDirectory, 'chapters');
        })();
    }

    async chapterDirectory(id)
    {
        const result = Path.resolve(await this.chaptersDirectory, id);

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
        return await context(`Checking if ${parentPath} is a chapter directory`, async () => {
            const gitPath = await this.deriveGitPath(parentPath);

            if ( !/^chapters[\\/](.+)$/.exec(gitPath) )
            {
                log(`Git path ${gitPath} does not have the required chapter/<id> pattern`);
                return false;
            }
            else
            {
                const result = await asyncAll( ['student.js', 'tests.html', 'bundle.js'], (filename) => {
                    const filePath = Path.resolve(parentPath, filename);

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
        });
    }

    async createChapter(id)
    {
        return new Chapter(this, id);
    }

    async deriveGitPath(path)
    {
        log(`Determining git path of ${path}`);
        const gitPath = Path.relative(await this.rootDirectory, path);
        log(`Git path of ${path} found: ${gitPath}`);

        return gitPath;
    }

    async toAbsolutePath(gitPath)
    {
        return Path.resolve(await this.rootDirectory, gitPath);
    }

    async getAbsolutePathsOfModifiedFiles()
    {
        return await context(`Determining absolute paths of files modified according to git`, async () => {
            log(`Getting git status`);
            const status = await this.git.status();
            const modifiedFiles = status.modified;
            const result = await asyncMap(modifiedFiles, modifiedFile => this.toAbsolutePath(modifiedFile));

            log(`Files modified according to git:\n  ${result.join("\n  ")}`);
            return result;
        });
    }

    async chapterFromDirectory(chapterPath)
    {
        log(`Trying to deduce chapter from path ${chapterPath}`);
        log(`First checking if ${chapterPath} is a chapter directory`);

        if ( await this.isChapterDirectory(chapterPath) )
        {
            log(`${chapterPath} is a chapter directory`);

            const gitPath = await this.deriveGitPath(chapterPath);

            log(`Checking git path ${gitPath} for validity`);
            const match = /^chapters[\\/]([^\\/]+)$/.exec(gitPath);

            if ( !match )
            {
                console.error(`Git path ${gitPath} cannot be used as chapter id`);
                process.exit(-1);
            }
            else
            {
                log(`Git path ${gitPath} has been found valid`);
                
                const id = match[1];
                log(`Chapter with git path ${gitPath} has id ${id}`);

                return await this.createChapter(id);
            }
        }
        else
        {
            log(`${chapterPath} is not a chapter directory`);

            return undefined;
        }
    }

    async push()
    {
        log(`Pushing to origin`)
        await this.git.push('origin', 'master');
    }
}


module.exports = Repository;