describe('#gqlLogUtil.js', () => {
  const gqlLoggingUtil = require('./gqlLogUtil.js')();
  it('test parse', () => {
    const astDoc =
      '{"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","variableDefinitions":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me","loc":{"start":10,"end":12}},"arguments":[],"directives":[],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name","loc":{"start":17,"end":21}},"arguments":[],"directives":[],"loc":{"start":17,"end":21}}],"loc":{"start":13,"end":24}},"loc":{"start":10,"end":24}}],"loc":{"start":6,"end":26}},"loc":{"start":0,"end":26}}],"loc":{"start":0,"end":26}}';
    expect(gqlLoggingUtil.printGraphqlRequestDoc(JSON.parse(astDoc))).toEqual(
      '{me{name}}'
    );
  });
});
