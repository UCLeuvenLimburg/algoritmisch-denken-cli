async function asyncFilter(xs, predicate)
{
    const result = [];

    for ( let x of xs )
    {
        if ( await predicate(x) )
        {
            result.push(x);
        }
    }

    return result;
}

async function asyncMap(xs, f)
{
    const result = [];

    for ( let x of xs )
    {
        result.push(await f(x));
    }

    return result;
}

async function asyncAll(xs, f)
{
    for ( let x of xs )
    {
        if ( !(await f(x)) )
        {
            return false;
        }
    }

    return true;
}

async function asyncAny(xs, f)
{
    for ( let x of xs )
    {
        if ( await f(x) )
        {
            return true;
        }
    }

    return false;
}


module.exports = { asyncFilter, asyncMap, asyncAll, asyncAny };
