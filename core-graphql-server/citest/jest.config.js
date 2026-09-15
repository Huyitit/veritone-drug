const path = require('node:path');

module.exports = {
  testSequencer: './citest-sequencer.js',
  setupFilesAfterEnv: ['jest-expect-message', './jest.setup.js'],
  globalSetup: './jest.global.setup.js',
  globalTeardown: './jest.global.teardown.js',
  testPathIgnorePatterns: ['/broken', '/obsolete', '/rewrite', '/sideEffect', '/sendEmail.spec.js'],
  /**
   * Depth-independent module aliases for the graphql-api tool's specs.
   *
   * ts-jest does not read the `paths` block from a tsconfig, so this mirrors
   * tools/graphql-api/tsconfig.json — that file is what `bun test` and the IDE
   * use, this is what CI uses. Adding an alias means editing BOTH.
   */
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/tools/graphql-api/$1',
    '^@citest/(.*)$': '<rootDir>/$1',
    '^@server/(.*)$': '<rootDir>/../$1'
  },
  transformIgnorePatterns: ['/node_modules/(?!.*graphql-request)'],
  transform: {
    '^.+\\.tsx?$': [
      require.resolve('ts-jest'),
      {
        tsconfig: path.resolve(__dirname, 'tools/graphql-api/tsconfig.json'),
        isolatedModules: true
      }
    ],
    '^.+\\.jsx?$': [
      require.resolve('babel-jest'),
      {
        babelrc: false,
        configFile: path.resolve(__dirname, 'babel.config.js')
      }
    ]
  }
};
