const git = require('simple-git/promise');
const repo = git('.');


async function main()
{
    const r = await repo.checkIsRepo();

    if ( r )
    {
        console.log(`Current directory is a repo!`);
    }
    else
    {
        console.log(`Current directory is not a repo...`);
    }
}


main()