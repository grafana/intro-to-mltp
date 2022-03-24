// Uses the envvar ENDPOINT_TYPE to determine which set
// of names to return.
module.exports = () => {
    let nameSet;
    let servicePrefix;
    let spanTag;

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
    } else {
        nameSet = [
            'unicorn',
            'manticore',
            'illithid',
            'owlbear',
            'beholder',
        ];
        servicePrefix = 'mythical-beasts';
        spanTag = 'beast';
    }

    return {
        nameSet,
        servicePrefix,
        spanTag,
    };
};
