const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { asyncFilter } = require('./async-util');


async function subdirectories(parentPath)
{
    const children = await promisify(fs.readdir)(parentPath);

    return await asyncFilter(children, async (child) => {
        const absolutePath = path.resolve(parentPath, child);
        const stats = await promisify(fs.lstat)(absolutePath);

        return stats.isDirectory();
    });
}

async function inDirectory(path, f)
{
    const directory = process.cwd();

    try
    {
        log(`Temporarily moving to ${path}`);
        process.chdir(path);
        return await f();
    }
    finally
    {
        log(`Returning to ${directory}`);
        process.chdir(directory);
    }
}

function fileExists(path)
{
    return new Promise((accept, reject) => fs.access(path, fs.constants.F_OK, err => accept(!err)));
}

module.exports = { subdirectories, inDirectory, fileExists };