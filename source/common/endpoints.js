// Uses the envvar ENDPOINT_TYPE to determine which set
// of names to return.
module.exports = () => {
    let nameSet;
    let servicePrefix;
    let spanTag;
    let accumulators;

    if (process.env.ENDPOINT_TYPE === 'BORING') {
        nameSet = [
            'login',
            'payment',
            'account',
            'cart',
            'health',
            'fastcache',
        ];
        servicePrefix = 'eStore';
        spanTag = 'endpoint';
        accumulators = [
            1,
            4,
            5,
            2,
            3,
            6,
        ];
    } else {
        nameSet = [
            'unicorn',
            'manticore',
            'illithid',
            'owlbear',
            'beholder',
        ];
        servicePrefix = 'mythical';
        spanTag = 'beast';
        accumulators = [
            1,
            23,
            13,
            32,
            153,
        ];
    }

    return {
        nameSet,
        servicePrefix,
        spanTag,
        accumulators,
    };
};
