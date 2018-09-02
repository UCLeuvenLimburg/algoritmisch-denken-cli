const path = require('path');
const webpack = require('webpack');


module.exports = [
    {
        entry: path.resolve(__dirname, 'src', 'index.ts'),
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'index.js',
            library: '',
            libraryTarget: 'commonjs'
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: [
                        'ts-loader',
                    ],
                    exclude: /node_modules/
                },
             ]
        },
        resolve: {
            extensions: ['.ts' ],
        },
        plugins: [
            new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true })
        ],
    },
];
