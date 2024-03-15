// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) 2023 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
    const defaultAppConfig = path.join(__dirname, 'src/config.tsx');
    const defaultPlugins = ['plugins/sam'];

    const sourceMapsDisabled = (process.env.DISABLE_SOURCE_MAPS || 'false').toLocaleLowerCase() === 'true';
    const appConfigFile = process.env.UI_APP_CONFIG ? process.env.UI_APP_CONFIG : defaultAppConfig;
    const pluginsList = process.env.CLIENT_PLUGINS ? [...defaultPlugins, ...process.env.CLIENT_PLUGINS.split(':')]
        .map((s) => s.trim()).filter((s) => !!s) : defaultPlugins;
    const sourceMapsToken = process.env.SOURCE_MAPS_TOKEN || '';

    const transformedPlugins = pluginsList  // .filter(箭头函数)去掉空值或false值
        .filter((plugin) => !!plugin).reduce((acc, _path, index) => ({  // .reduce 中对每个插件添加配置项
            ...acc,
            [`plugin_${index}`]: {
                dependOn: 'cvat-ui',
                // path can be absolute, in this case it is accepted as is
                // also the path can be relative to cvat-ui root directory
                import: path.isAbsolute(_path) ? _path : path.join(__dirname, _path, 'src', 'ts', 'index.tsx'),
            },
        }), {});

    console.log('Source maps: ', sourceMapsDisabled ? 'disabled' : 'enabled');
    console.log('List of plugins: ', Object.values(transformedPlugins).map((plugin) => plugin.import));

    return {
        target: 'web',
        mode: 'production',
        devtool: sourceMapsDisabled ? false : 'source-map',
        entry: {
            'cvat-ui': './src/index.tsx',
            ...transformedPlugins,
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'assets/[name].[contenthash].min.js',
            publicPath: '/',
        },
        devServer: {    // webpack 内置的工具，用于开发服务器的配置，用于在开发过程中实时重新加载更改的文件
            compress: false,
            host: process.env.CVAT_UI_HOST || 'localhost',
            client: {
                overlay: false,
            },
            port: 3000,
            historyApiFallback: true,
            static: {
                directory: path.join(__dirname, 'dist'),
            },
            headers: {
                // to enable SharedArrayBuffer and ONNX multithreading
                // https://cloudblogs.microsoft.com/opensource/2021/09/02/onnx-runtime-web-running-your-machine-learning-model-in-browser/
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'credentialless',
            },
            proxy: [    // 设置代理，无法直接从开发服务器访问的请求，主要是 API 服务，如 Django 暴露的urls。
                {
                    context: (param) =>
                        param.match(    // 按照 RESTFUL API 写的正则表达式
                            /\/api\/.*|analytics\/.*|static\/.*|admin(?:\/(.*))?.*|profiler(?:\/(.*))?.*|documentation\/.*|django-rq(?:\/(.*))?/gm,
                        ),
                    target: env && env.API_URL,
                    secure: false,
                    changeOrigin: true,
                },
            ],
        },
        resolve: {  // 配置webpack如何解析模块的导入语句
            // import myModule from 'module', 则依次从module[extensions]文件中查找 myModule, 找到就停止
            extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
            //  表示不使用 Node.js 的 fs 模块作为回退解析机制。
            //  因为在 Webpack 5 中，fs 模块默认不再作为核心模块提供，需要单独安装 fsevents 或 gracef
            fallback: {
                fs: false,
            },
            alias: {
                config$: appConfigFile,

                // when import svg modules
                // the loader transforms their to modules with JSX code
                // and adds 'import React from "react";'
                // in plugins it leads to errors because they must import '@modules/react'
                // so, this alias added to fix it
                react: '@modules/react',
                '@root': path.resolve(__dirname, 'src'),
                '@modules': path.resolve(__dirname, '..', 'node_modules'),
            },
            modules: [path.resolve(__dirname, 'src'), 'node_modules'],
        },
        module: {   // 定义不同代码文件的处理规则，如何转换代码使得代码可以在浏览器中运行。
            rules: [
                {
                    test: /\.(ts|tsx)$/,    // ts文件和tsx文件
                    use: {
                        loader: 'babel-loader',
                        options: {
                            plugins: [
                                // 支持类属性，该插件已弃用，已被移入ES标准中。
                                // 用于将类中的属性（properties）转换为类的构造函数中的字段定义
                                '@babel/plugin-proposal-class-properties',
                                // 允许在 JavaScript 中使用 ? 三元操作符。
                                '@babel/plugin-proposal-optional-chaining',
                                [
                                    'import',   // 按需导入 antd 库
                                    {
                                        libraryName: 'antd',
                                    },
                                ],
                            ],
                            presets: ['@babel/preset-env', '@babel/preset-react', '@babel/typescript'],
                            sourceType: 'unambiguous',
                        },
                    },
                },
                {
                    test: /\.(css|scss)$/,  // scss, sass: https://sass-lang.com/guide/
                    use: [
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {
                                importLoaders: 2,   // 最多两层的 @import 语句
                            },
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                postcssOptions: {
                                    plugins: [
                                        [
                                            'postcss-preset-env', {},   // 根据不同浏览器自动添加前缀和一些后处理
                                        ],
                                    ],
                                },
                            },
                        },
                        'sass-loader',  // 处理 .scss(.sass) 文件, 通常放在最后, 因为它依赖CSS的处理结果
                    ],
                },
                {
                    test: /\.svg$/,
                    exclude: /node_modules/,    // node_modules中的.svg不进行处理
                    use: [
                        'babel-loader',
                        {
                            loader: 'react-svg-loader',
                            options: {
                                svgo: {
                                    plugins: [{ pretty: true }, { cleanupIDs: false }],
                                },
                            },
                        },
                    ],
                },
                {
                    test: /\.(png|jpg|jpeg|gif)$/i,
                    type: 'asset/resource',
                },
            ],
            parser: {
                javascript: {
                    exportsPresence: 'error',   // 如果文件中没有 export 语句，则报错。
                },
            },
        },
        plugins: [
            new HtmlWebpackPlugin({     // 自动生成index.html， 使用给定的模板文件，注入到<body>... 这里<body>
                template: './src/index.html',
                inject: 'body',
            }),
            new Dotenv({    // 用于支持环境变量的插件, 可以从 .env 目录下读取，另外 systemvars: true使用系统环境变量
                systemvars: true,
            }),
            new CopyPlugin({    // 用于复制静态资源的插件，从 from 复制到 to, 默认 flatten: false, 保留源目录层级结构
                patterns: [
                    {
                        from: '../cvat-data/src/ts/3rdparty/avc.wasm',
                        to: 'assets/3rdparty/',
                    },
                    {
                        from: '../node_modules/onnxruntime-web/dist/*.wasm',
                        to  : 'assets/[name][ext]',
                    },
                    {
                        from: 'src/assets/opencv_4.8.0.js',
                        to  : 'assets/opencv_4.8.0.js',
                    },
                    {
                        from: 'plugins/**/assets/*.(onnx|js)',
                        to  : 'assets/[name][ext]',
                    }
                ],
            }),
            // source map 用于支持浏览器在未打包的源代码进行 debug
            ...(!sourceMapsDisabled && sourceMapsToken ? [new webpack.SourceMapDevToolPlugin({
                append: '\n',   // 源映射文件(.map)结尾加上换行符
                filename: `${sourceMapsToken}/[file].map`,  // 映射后的文件名称
            })] : []),
        ],
    }
};
