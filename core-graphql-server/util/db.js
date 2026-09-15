module.exports = function createFunction(serviceContext) {
  async function dbWriteTx(dbName, openTx) {
    const ssoDbConn = openTx
      ? openTx.client
      : await serviceContext.dbConnections[dbName].write.connect();
    const noop = () => {};
    return {
      client: ssoDbConn,
      begin: openTx ? noop : () => ssoDbConn.query('BEGIN'),
      commit: openTx ? noop : () => ssoDbConn.query('COMMIT'),
      rollback: openTx ? noop : () => ssoDbConn.query('ROLLBACK'),
      done: openTx ? noop : () => ssoDbConn.done()
    };
  }

  return {
    dbWriteTx
  };
};
