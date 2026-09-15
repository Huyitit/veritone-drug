const { get } = require('lodash');

async function helpCreateWatchList(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation createWa ($input: CreateWatchlist!) {
    createWatchlist (input: $input){
      id
      name
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);

  return get(result, 'createWatchlist');
}

async function helpDeleteWatchList(client, { watchlistId }) {
  const { gqlClient, options } = client;

  const query = `mutation deleteWa {
    deleteWatchlist (id: "${watchlistId}"){
      id
    }
  }`;

  const result = await gqlClient.query(query, {}, options);

  return get(result, 'deleteWatchlist');
}

async function helpGetWatchlistById(client, { watchlistId }) {
  const { gqlClient, options } = client;

  const query = `query getWatch {
    watchlist (id: "${watchlistId}") {
      id
      name
    }
  }`;

  const result = await gqlClient.query(query, {}, options);

  return get(result, 'watchlist');
}

async function getWatchlists (client, input) {
  const { gqlClient, options } = client;
  const query = `query getW (
      $id: ID
      $maxStopDateTime: DateTime
      $minStopDateTime: DateTime
      $minStartDateTime: DateTime
      $maxStartDateTime: DateTime
      $name: String
      $offset: Int = 0
      $limit: Int = 30
      $orderBy: WatchlistOrderBy = createdDateTime
      $orderDirection: OrderDirection = desc
      $isDisabled: Boolean
      $names: [String]
      $nameMatch: StringMatch = contains
  ) {
    watchlists (
      id: $id
      maxStopDateTime: $maxStopDateTime
      minStopDateTime: $minStopDateTime
      minStartDateTime: $minStartDateTime
      maxStartDateTime: $maxStartDateTime
      name: $name
      offset: $offset
      limit: $limit
      orderBy: $orderBy
      orderDirection: $orderDirection
      isDisabled: $isDisabled
      names: $names
      nameMatch: $nameMatch
    ) {
      records {
        id
        name
      }
    }
  }`;
  const result = await gqlClient.query(query, input, options);
  return result.watchlists && result.watchlists.records ? result.watchlists.records : [];
}

module.exports = {
  helpCreateWatchList,
  helpDeleteWatchList,
  helpGetWatchlistById,
  getWatchlists
};
