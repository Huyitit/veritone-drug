const helpers = require('./helpers/index');

const config = helpers.config;
const env = config.env;
const _ = require('lodash');



describe('Referenced asset test', () => {
  

  let options, userOptions;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const assetUri1 = 's3://vtn-core-api-test/movie.mp4';
  const assetUri2 = 's3://vtn-core-api-test/movie_clip.mov';
  const getAssetUrl1 =
    'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4';
  const getAssetUrl2 =
    'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie_clip.mov';
  const url = config.graphql_url || authUrl;
  let tdoId, assetId1, assetId2;

  const supertest = require('supertest')(url);

  console.log('URL:  ' + url);
  beforeAll(done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, appId }) => {
        options = helpers.requestOptions(apiToken);
        userOptions = helpers.requestOptions(token);
        done();
      })
      .catch(err => done(err));
  });

  it('should create a TDO', () => {
    const query = `
mutation {
  createTDO(input: {
    status: "uploaded",
    startDateTime: 1476726655,
    stopDateTime: 1476726655
    assets: [{
      assetType: "media"
      contentType: "video/mp4"
      uri: "${assetUri1}",
      storeAsReference: true
    }]
  }) {
    id
    isPublic
    organizationId
    organization {
      id
    }
    assets {
      records {
        id
      }
    }
  }
}`;
    const result = await gqlClient.query(query);
      
      tdoId = _.get(result, 'createTDO.id', null);
      assetId1 = _.get(
        response,
        'body.data.createTDO.assets.records[0].id',
        null
      );
      expect(tdoId).toBeDefined();
      console.log('Your TDO ID is ' + tdoId);
      expect(_.get(result, 'createTDO.isPublic')).toEqual(false);
      expect(_.get(result, 'createTDO.organizationId')).toBeDefined();
      expect(_.get(result, 'createTDO.organization.id')).toBeDefined();
      expect(assetId1).toBeDefined();
    });
  });

  it('should create an asset as reference', () => {
    const query = `
    mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "video/quicktime"
        description: "my test asset"
        jsondata: {
          size: 978455
          fileName: "movie_clip.mov"
        }
        assetType: "media"
        uri: "${assetUri2}"
        storeAsReference: true
      }) {
        id
        uri
        assetType
        signedUri
        jsondata
      }
    }`;
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .expect(200)
      .then(response => {
        assetId2 = _.get(result, 'createAsset.id', null);
        expect(assetId2).toBeDefined();
        expect(
          _.get(result, 'createAsset.jsondata.storeAsReference')
        ).to.be.equal(true);
        console.log('Your asset ID is ' + assetId2);
        console.log(
          'Your asset URI is ' +
            assetUri2 +
            ' or ' +
            _.get(result, 'createAsset.uri', null)
        );
      });
  });

  it('should retrieve tdo with referenced asset', () => {
    const query = `query {
      temporalDataObject(id:"${tdoId}") {
        id
        details
        assets {
          records {
            id
            uri
          }
        }
      }
    }`;

    return chakram.post(url, { query: query }, options).then(response => {
      
      expect(
        _.get(result, 'temporalDataObject.assets.records[0].id')
      ).toBeDefined();
      expect(
        _.get(result, 'temporalDataObject.assets.records[0].uri')
      ).toBeDefined();
      expect(
        _.get(result, 'temporalDataObject.assets.records[1].id')
      ).toBeDefined();
      expect(
        _.get(result, 'temporalDataObject.assets.records[1].uri')
      ).toBeDefined();
    });
  });

  it(
    'should retrieve asset created along with TDO with storeAsReference in jsondata',
    () => {
      const query = `query {
        asset(id:"${assetId1}") {
          id
          name
          jsondata
          uri
        }
      }`;

      return chakram.post(url, { query: query }, options).then(response => {
        
        expect(_.get(result, 'asset.uri')).to.be.equal(assetUri1);
        expect(_.get(result, 'asset.jsondata')).toBeDefined();
        expect(
          _.get(result, 'asset.jsondata.storeAsReference')
        ).to.be.equal(true);
      });
    }
  );

  it(
    'should retrieve asset added to TDO with storeAsReference in jsondata',
    () => {
      const query = `query {
        asset(id:"${assetId2}") {
          id
          name
          jsondata
          uri
        }
      }`;

      return chakram.post(url, { query: query }, options).then(response => {
        
        expect(_.get(result, 'asset.uri')).to.be.equal(assetUri2);
        expect(_.get(result, 'asset.jsondata')).toBeDefined();
        expect(
          _.get(result, 'asset.jsondata.storeAsReference')
        ).to.be.equal(true);
      });
    }
  );

  it('cannot update storeAsReference via updateAsset', () => {
    const query = `
    mutation {
      updateAsset(input: {
        id: "${assetId1}"
        description: "my test asset"
        details: {
          storeAsReference: false
        }
      }) {
        id
        jsondata
      }
    }`;
    return chakram.post(url, { query: query }, options).then(response => {
      
      expect(
        _.get(result, 'updateAsset.jsondata.storeAsReference')
      ).to.be.equal(true);
      expect(
        _.get(
          response,
          'body.data.updateAsset.jsondata.details.storeAsReference'
        )
      ).to.be.equal(false);
    });
  });

  it('should delete search index data', () => {
    const query = `
mutation {
  cleanupTDO(id: "${tdoId}", options: [searchIndex]) {
    id
    message
  }
}
`;
    const result = await gqlClient.query(query);
      
      helpers.expect(response.body.errors, 'response.body.errors').to.be

      expect(_.get(result, 'cleanupTDO.id')).toEqual(tdoId);
    });
  });

  it('should delete asset data', () => {
    const query = `
mutation {
  cleanupTDO(id: "${tdoId}", options: [storage]) {
    id
    message
  }
}
`;
    const result = await gqlClient.query(query);
      
      helpers.expect(response.body.errors, 'response.body.errors').to.be

      expect(_.get(result, 'cleanupTDO.id')).toEqual(tdoId);
    });
  });

  it('should find initial reference S3 object', () => {
    return chakram.get(getAssetUrl1).then(response => {
      
    });
  });

  it('should find added reference S3 object', () => {
    return chakram.get(getAssetUrl2).then(response => {
      
    });
  });

  it('should find initial asset content deleted but not asset', () => {
    const query = `
query {
  asset(id:"${assetId1}") {
    id
    uri
    signedUri
  }
  temporalDataObject(id:"${tdoId}") {
    id
  }
}
`;
    const result = await gqlClient.query(query);
      
      helpers.expect(response.body.errors, 'response.body.errors').to.be

      expect(_.get(result, 'temporalDataObject.id')).toEqual(
        tdoId
      );
      expect(_.get(result, 'asset.id')).to.be.equal(assetId1);
      expect(_.get(result, 'asset.uri')).to.be.equal(assetUri1);
    });
  });

  it('should find added asset content deleted but not asset', () => {
    const query = `
query {
  asset(id:"${assetId2}") {
    id
    uri
    signedUri
  }
  temporalDataObject(id:"${tdoId}") {
    id
  }
}
`;
    const result = await gqlClient.query(query);
      
      helpers.expect(response.body.errors, 'response.body.errors').to.be

      expect(_.get(result, 'temporalDataObject.id')).toEqual(
        tdoId
      );
      expect(_.get(result, 'asset.id')).to.be.equal(assetId2);
      expect(_.get(result, 'asset.uri')).to.be.equal(assetUri2);
    });
  });

  it('should delete the TDO', () => {
    const query = `
  mutation {
    deleteTDO(id: "${tdoId}") {
      id
      message
    }
  }
  `;
    const result = await gqlClient.query(query);
      
      helpers.expect(response.body.errors, 'response.body.errors').to.be

      expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
    });
  });

  it('should find TDO and asset to be deleted', () => {
    const query = `
  query {
    temporalDataObject(id:"${tdoId}") {
      id
    }
    asset(id:"${assetId2}") {
      id
      uri
      signedUri
    }
  }
  `;
    const result = await gqlClient.query(query);
      
      expect(_.get(result, 'temporalDataObject')).to.be.null;
      expect(_.get(result, 'asset')).to.be.null;
    });
  });

  it('should find initial referenced S3 object', () => {
    return chakram.get(getAssetUrl1).then(response => {
      
    });
  });

  it('should find second referenced S3 object', () => {
    return chakram.get(getAssetUrl2).then(response => {
      
    });
  });
});
