const { GenerateSW } = require('workbox-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const path = require('node:path');
const isHMR = process.env.WEBPACK_SERVE;
const { URL_PLACEHOLDERS, THEME_PLACEHOLDER } = require('./src/constants');

const prodPlugins = [];

/**
 * @type {import('webpack').Configuration}
 */
module.exports = (env, argv) => {
  // for development mode
  const isDev = argv.mode === 'development';
  const dotenvOpts = isDev ? { path: `./.env.${argv.mode}` } : {};
  const graphqlPath = env.gqlPath || 'graphql';
  const graphqlInternalPath = env.gqlInternalPath || 'vgraphql';
  const publicPath = graphqlPath + '/public/';

  if (!isHMR) {
    prodPlugins.push(
      new GenerateSW({
        maximumFileSizeToCacheInBytes: 1024 * 1024 * 20,
        modifyURLPrefix: {
          [publicPath]: './',
          [graphqlInternalPath + '/public/']: './'
        }
      })
    );
  }

  return {
    entry: isDev
      ? [
          'react-hot-loader/patch', // activate HMR for React
          'webpack-dev-server/client?http://localhost:8080', // bundle the client for webpack-dev-server and connect to the provided endpoint
          'webpack/hot/only-dev-server', // bundle the client for hot reloading, `only-` means to only hot reload for successful updates
          './src/index.jsx' // the entry point of our app
        ]
      : './src/index.jsx',
    mode: process.env.NODE_ENV ?? 'development',
    devtool: 'inline-source-map',
    performance: {
      hints: false
    },
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: '[name].[contenthash].js',
      clean: true,
      publicPath: publicPath
    },
    module: {
      rules: [
        {
          test: /\.html$/,
          use: ['file?name=[name].[ext]']
        },
        // for graphql module, which uses mjs still
        {
          type: 'javascript/auto',
          test: /\.mjs$/,
          use: [],
          include: /node_modules/
        },
        {
          test: /\.(js|jsx)$/,
          use: [
            {
              loader: 'babel-loader',
              options: {
                presets: [
                  ['@babel/preset-env', { modules: false }],
                  '@babel/preset-react'
                ]
              }
            }
          ]
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.svg$/,
          use: [{ loader: 'svg-inline-loader' }]
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          use: ['file-loader']
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.json', '.jsx', '.css', '.mjs']
    },
    plugins: [
      ...prodPlugins,
      new Dotenv(dotenvOpts),
      new CopyPlugin({
        patterns: [{ from: 'public' }]
      }),
      new HtmlWebpackPlugin({
        template: path.join(__dirname, '/index.html.ejs'),
        templateParameters: {
          urlPlaceholders: URL_PLACEHOLDERS,
          themePlaceholder: THEME_PLACEHOLDER
        }
      }),
      new WebpackManifestPlugin({
        seed: {
          name: 'GraphiQL PWA',
          icons: [
            {
              src: 'logo.svg',
              sizes: '48x48 72x72 96x96 128x128 256x256 512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            }
          ],
          background_color: '#ffffff',
          theme_color: '#D60590',
          start_url: './index.html',
          display: 'standalone',
          display_override: ['fullscreen', 'minimal-ui'],
          'logo.svg': 'auto/logo.svg'
        }
      })
    ],
    devServer: {
      hot: true
    }
  };
};
