const helpers = require('../helpers/index.js');

const config = helpers.config;
var fs = require('fs');

var token;
var apiToken;
var env = config.env;
var authUrl = 'https://api.' + env + '.veritone.com/v1';
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var signinResult;
var tdoId;
var assetId;
const userAgent = config.userAgent || 'core-graphql-server test';

var debug = config.debug && config.debug == true;



describe('authenticate', () => {
  beforeAll(() => {
    var signinData = {
      userName: config.userName,
      password: config.password
    };
    var signinUrl = authUrl + '/admin/login';
    console.log('signing in to ' + signinUrl + ' as ' + config.userName);
    signinResult = chakram.post(signinUrl, signinData);

    return signinResult.then(function(respObj) {
      if (respObj.body) {
        token = respObj.body.token;
        apiToken = respObj.body.apiToken || config.apiToken || token;
      }
      if (!config.ci) console.log('got token ' + apiToken + ' ' + token);
    });
  });

  it('signin should return 200', () => {
    return expect(signinResult).to.have.status(200);
  });

  it('should have API token in response', () => {
    return expect(apiToken).toBeDefined();
  });

  it('should have token in response', () => {
    return expect(token).toBeDefined();
  });
});

var response = null;
/* disable - this times out.
describe('big engine query', function() {
  var recResult;
  var errors = null;
  var records = null;

  before('request', function() {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
      }
    };

    var query = ` query {
      engines {
    records {
      id
      name
      ownerOrganizationId
      deploymentModel
      isPublic
      builds {
        records {
          id
          name
          executeUri
          validateUri

          version
          createdDateTime
          modifiedDateTime
          runtime
          engineId
          price
          status
        }
        count
        offset
        limit
      }
      tasks {
        records {
          id
          name
          status
          description
          createdDateTime
          modifiedDateTime
          queuedDateTime
          completedDateTime
          targetId
          applicationId
          order
        }
        count
        offset
        limit
      }
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    //recResult = chakram.post(recUrl, data, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
        console.log(JSON.stringify(errors));
      }
      if (respObj.body && respObj.body.data && respObj.body.data.libraryTypes) {
        records = respObj.body.data.libraryTypes;
        console.log(records);
      }
    });
  });

  it('return 200', function() {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', function() {
    console.log(JSON.stringify(errors));
    return expect(errors).to.be.null;
  });
});
*/
describe('Library query', () => {
  var recResult;
  var errors = null;
  var records = null;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
  libraries {
    records {
      libraryType {
        id
      }
      id
      name
      description
      entities {
        records {
          id
          name
          libraryId
          identifiers {
            records {
              identifierType {
                id
              }
              id
              createdDateTime
            }
          }
          profileImageUrl

          modifiedDateTime
          createdDateTime

        }
      }
      createdDateTime
      modifiedBy
      engineModels {
        records {
        id
        trainJobId
        trainStatus
        dataUrl
        modifiedDateTime
        createdDateTime
      }
      }
      security {
			global
      }
      collaborators {
        records {
          organizationId
          status
          organization {
            id
            name
          }
          createdDateTime

          modifiedDateTime
          libraryId
          permissions

        }
      }
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    //recResult = chakram.post(recUrl, data, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
        console.log(JSON.stringify(errors));
      }
      if (respObj.body && respObj.body.data && respObj.body.data.libraries) {
        records = respObj.body.data.libraries.records;
        console.log(records);
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return expect(errors).to.be.null;
  });
});

describe('User query', () => {
  var recResult;
  var errors = null;
  var records = null;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = ` query {
      users(name: "smalabarba") {
    records {
      id
      name
      id
      organization {
        applications {
          records {
            id
            name
            category
            deploymentModel
            url
            description
            createdDateTime
            modifiedDateTime
            iconSvg
            iconUrl
          }
          count


        }
        id
        name
        jsondata
        collections {
          records {
            id
            typeId
          }
          count
          offset
          limit
        }
        watchlistFolder: rootFolder(type: watchlist) {
          id
          name
          subfolders {
            id
            name
          }
          ownerId
          createdDateTime
          modifiedDateTime
          organizationId
          status
        }
        cmsFolder: rootFolder(type: cms) {
          id
          name
          description
          maxDepth
          subfolders {
            id
            name
          }
        }
        collectionFolder: rootFolder(type: collection) {
          id
          name
          description
          subfolders {
            id
            name
          }
        }
        blacklist {
          engines {
            id
            name
            categoryId
            state
            price
            asset
            description
          }
          engineCategories {
            engineIds
            totalEngines
            id
            name
            description
            iconClass
            editable
          }
        }
        users {
          count


          records {
            id
            name
            roles {
              id
              name
              permissions {
                records {
                  id
                  name
                  description
                }
                count
                limit
              }
            }
          }
        }
      }
    }
  }
}


        `;
    recResult = chakram.post(url, { query: query }, options);
    //recResult = chakram.post(recUrl, data, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
        console.log(JSON.stringify(errors));
      }
      if (respObj.body.data && respObj.body.data.libraries) {
        records = respObj.body.data.libraries.records;
        console.log(records);
      }
    });
  });

  it('return 200', () => {
    return expect(recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return expect(errors).to.be.null;
  });
});
