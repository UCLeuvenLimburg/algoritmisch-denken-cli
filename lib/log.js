let verbose = false;

let depth = 0;

function setVerbosity(b)
{
    verbose = b;
}

function setDepth(n)
{
    depth = n;
}

function print(message)
{
    let output = '';

    for ( let i = 0; i !== depth; ++i )
    {
        output += ' ';
    }

    output += message;

    console.log(output);
}

function log(message)
{
    if ( verbose )
    {
        print(message);
    }
}

async function context(message, f)
{
    try
    {
        log(message);
        depth++;
        return await f();
    }
    finally
    {
        depth--;
    }
}

module.exports = { log, setVerbosity, context };