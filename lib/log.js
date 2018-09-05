let verbose = false;

function setVerbosity(b)
{
    verbose = b;
}

function log(message)
{
    if ( verbose )
    {
        console.log(message);
    }
}

module.exports = { log, setVerbosity };