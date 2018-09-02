const git = require('simple-git/promise');
const repo = git(__dirname);


async function main()
{
    const r = await repo.checkIsRepo();

    if ( r )
    {
        console.log(`It is a repo!`);
    }
    else
    {
        console.log(`It is not a repo...`);
    }
}


main()