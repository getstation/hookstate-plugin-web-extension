module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: './tests/.*\\.spec\\.ts',
  setupFilesAfterEnv: ['jest-sinon']
};