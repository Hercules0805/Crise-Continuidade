module.exports = {
  // O Jest roda só os testes das regras (precisam do emulador). Os demais
  // *.test.js são node:test (node --test) -- uma lista de exclusão aqui deixava
  // passar todo arquivo novo e o "npm test" acusava dezenas de suites quebradas.
  testPathIgnorePatterns: ['/node_modules/'],
  testEnvironment: 'node',
  testMatch: ['**/firestore.rules.test.js'],
  rootDir: __dirname,
};
