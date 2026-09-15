/**
 * No-op. Used to force schema authors to declare that a given field
 * is not subject to authentication. The default is to apply the
 * auth directive.
 */

module.exports = function create(directiveContext) {
  return {
    name: 'noAuth',
    before: true,
    resolver(directiveArgs, fieldArgs, context, info) {
      let authInfo =
        context.requestContext.userInfo || context.requestContext.tokenInfo;
      if (authInfo && authInfo.tokenType) {
        authInfo = authInfo.data;
      }
      if (authInfo) {
        context._authInfo = authInfo;
      }
    }
  };
};
