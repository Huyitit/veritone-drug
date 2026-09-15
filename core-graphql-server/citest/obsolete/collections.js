const helpers = require('../helpers/index');

const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const moment = require('moment');

const util = require('../../util.js')({});

describe('Collections', () => {
  let testContext;

  beforeAll(() => {
    testContext = {};
  });

  let options;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;
  let mentionId, mentionId2, mentionId3;

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  describe.skip('Collections', function() {
    let folderId, folderId2;
    let collectionName;
    let collectionShareId;
    let collectionShareObject;

    beforeAll(done => {
      createMentions(url, options)
        .then(({ tdoId, mentionIds }) => {
          testContext.tdoId = tdoId;
          mentionId = mentionIds[0];
          mentionId2 = mentionIds[1];
          mentionId3 = mentionIds[2];
          done();
        })
        .catch(err => done(err));
    });

    describe('Create Collection', () => {
      it('should throw an error if "name" is not provided', async () => {
        const query = `
          mutation {
            createCollection(input: {
              hello: "hello",
            }) {
              id,
              name
            }
          }`;
        const result = await gqlClient.query(query);
        expect(response).to.have.status(400);
        expect(response.body.errors[0].message).to.contain('name');
      });

      it('should throw an error if "name" is not a String', async () => {
        const query = `
          mutation {
            createCollection(input: {
              name: 1
            }) {
              id,
              name
            }
          }`;
        const result = await gqlClient.query(query);
        expect(response).to.have.status(400);
        expect(response.body.errors[0].message).to.contain('name');
      });

      it('should throw an error if "parentFolderId" is not provided', async () => {
        const query = `
          mutation {
            createCollection(input: {
              name: "hello",
            }) {
              id,
              name
            }
          }`;
        const result = await gqlClient.query(query);
        expect(response).to.have.status(400);
        expect(response.body.errors[0].message).to.contain('parentFolderId');
      });

      it('should throw an error if "parentFolderId" is not valid', async () => {
        const query = `
          mutation {
            createCollection(input: {
              name: "hello",
              parentFolderId: "not-valid-id"
            }) {
              id,
              name
            }
          }`;
        const result = await gqlClient.query(query);
        expect(response.body.errors[0].message).to.contain('validation');
        expect(response.body.errors[0].data['parentFolderId']).toBeDefined();
      });

      it('should create a new collection', async () => {
        const query = `
          mutation {
            createCollection(input: {
              name: "hello",
              image: "https://s3.amazonaws.com/dev-api.veritone.com/testphoto.jpg",
              parentFolderId: ""
            }) {
              id,
              name,
              imageUrl,
              signedImageUrl
            }
            collection2: createCollection(input: {
              name: "citest2",
              image: "https://s3.amazonaws.com/dev-api.veritone.com/testphoto.jpg",
              parentFolderId: ""
            }) {
              id
            }
          }`;
        const result = await gqlClient.query(query);

        expect(response.body.data.createCollection.id).toBeDefined();
        expect(response.body.data.createCollection.imageUrl).toBeDefined();
        expect(
          response.body.data.createCollection.signedImageUrl
        ).toBeDefined();
        folderId = response.body.data.createCollection.id;
        folderId2 = _.get(result, 'collection2.id');
        collectionName = response.body.data.createCollection.name;
      });
    });
  });

  describe('Update Collection', () => {
    it('should throw an error if "folderId" is not provided', async () => {
      const query = `
          mutation {
            updateCollection(input: {
              name: "goodbye"
            }) {
              id,
              name
            }
          }`;
      const result = await gqlClient.query(query);
      expect(response).to.have.status(400);
      expect(response.body.errors[0].message).to.contain('folderId');
    });

    it('should throw an error if Collection is not found', async () => {
      const query = `
          mutation {
            updateCollection(input: {
              folderId: 11111111,
              name: "goodbye"
            }) {
              id,
              name
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].name).toEqual('not_found');
    });

    it('should update the collection', async () => {
      const query = `
          mutation {
            updateCollection(input: {
              folderId: ${folderId},
              name: "goodbye"
            }) {
              id,
              name
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.data.updateCollection.name).toEqual('goodbye');
      collectionName = response.body.data.updateCollection.name;
    });
  });

  describe('Create Collection Mention', () => {
    it('should throw an error if "folderId" is not provided', async () => {
      const query = `
          mutation {
            createCollectionMention(input: {
              mentionId: ${mentionId}
            }) {
              folderId,
              mentionId
            }
          }`;
      const result = await gqlClient.query(query);
      expect(response).to.have.status(400);
      expect(response.body.errors[0].message).to.contain('folderId');
    });

    it('should throw an error if mentionId does not exist', async () => {
      const query = `
          mutation {
            createCollectionMention(input: {
              folderId: ${folderId},
              mentionId: "-${mentionId}"
            }) {
              folderId,
              mentionId
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].message).to.contain('Mention not found');
    });

    it('should add mention to collection', async () => {
      const query = `
          mutation {
            createCollectionMention(input: {
              folderId: ${folderId},
              mentionId: ${mentionId}
            }) {
              folderId
              mentionId
              organizationId
              collection {
                id 
              }
              mention {
                id 
              }
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMention = _.get(
        response,
        'body.data.createCollectionMention',
        {}
      );
      expect(collectionMention.folderId).toEqual(folderId);
      expect(collectionMention.mentionId).toEqual(mentionId);
      expect(collectionMention.organizationId).toBeDefined();
      expect(collectionMention.collection.id).toEqual(folderId);
      expect(collectionMention.mention.id).toEqual(mentionId);
    });

    it('should update mention description in a collection', async () => {
      const query = `
          mutation {
            updateCollectionMention(input: {
              folderId: ${folderId},
              mentionId: ${mentionId},
              description: "test description"
            }) {
              folderId
              mentionId
              description
              createdDateTime
              modifiedDateTime
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMention = _.get(
        response,
        'body.data.updateCollectionMention',
        {}
      );
      expect(collectionMention.folderId).toEqual(folderId);
      expect(collectionMention.mentionId).toEqual(mentionId);
      expect(collectionMention.description).toEqual('test description');
      expect(collectionMention.createdDateTime).to.not.equal(
        collectionMention.modifiedDateTime
      );
    });

    it('should get collection mention', async () => {
      const query = `
          query {
            collectionMention(
              folderId: ${folderId},
              mentionId: ${mentionId}
            ) {
              folderId
              mentionId
              description
              createdDateTime
              modifiedDateTime
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMention = _.get(
        response,
        'body.data.collectionMention',
        {}
      );
      expect(collectionMention.folderId).toEqual(folderId);
      expect(collectionMention.mentionId).toEqual(mentionId);
      expect(collectionMention.description).toEqual('test description');
      expect(collectionMention.createdDateTime).to.not.equal(
        collectionMention.modifiedDateTime
      );
    });

    it('should get collection mentions', async () => {
      const query = `
          query {
            collectionMentions(
              folderId: ${folderId}
            ) {
              count
              records {
                folderId
                mentionId
                description
              }
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMentions = _.get(
        response,
        'body.data.collectionMentions',
        {}
      );
      expect(collectionMentions.count).toEqual(1);
      expect(collectionMentions.records[0].mentionId).toEqual(mentionId);
      expect(collectionMentions.records[0].folderId).toEqual(folderId);
      expect(collectionMentions.records[0].description).toEqual(
        'test description'
      );
    });

    it('should add mentions to collection', async () => {
      const query = `
          mutation {
            createCollectionMentions(input: {
              folderIds: [${folderId}, ${folderId2}],
              mentionIds: [${mentionId}, ${mentionId2}]
            }) {
              folderId,
              mentionId
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMentions = _.get(
        response.body.data,
        'createCollectionMentions'
      );
      expect(collectionMentions).toHaveLength(4);
      expect(collectionMentions.map(cm => cm.folderId)).to.include.members([
        folderId,
        folderId2
      ]);
      expect(collectionMentions.map(cm => cm.mentionId)).to.include.members([
        mentionId,
        mentionId2
      ]);
    });

    it('should get collection mentions with orderBy', async () => {
      const query = `
          query {
            collectionMentions(
              folderId: ${folderId},
              orderBy: {
                field: mentionDate
              }
            ) {
              count
              records {
                folderId
                mentionId
                description
              }
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;

      const collectionMentions = _.get(
        response,
        'body.data.collectionMentions',
        {}
      );
      expect(collectionMentions.count).toEqual(2);
      expect(collectionMentions.records[0].mentionId).toEqual(mentionId2);
      expect(collectionMentions.records[0].folderId).toEqual(folderId);
      expect(collectionMentions.records[1].mentionId).toEqual(mentionId);
      expect(collectionMentions.records[1].folderId).toEqual(folderId);
    });

    it('should throw an error when too many mentions are added to collection', async () => {
      const mentionIds = _.range(0, 101, 1);
      const query = `
            mutation {
              createCollectionMentions(input: {
                folderIds: [${folderId}, ${folderId2}],
                mentionIds: [${mentionIds.join(',')}]
              }) {
                folderId,
                mentionId
              }
            }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].message).to.contain('exceeds');
      expect(response.body.data).to.be.null;
    });
  });

  describe('Share Collection', () => {
    it('should throw an error if "folderId" is not provided', async () => {
      const query = `
          mutation {
            shareCollection(input:{folderId: null}) {
              id
              shareMessage
              recipients
            }
          }`;
      const result = await gqlClient.query(query);
      expect(response).to.have.status(400);
      expect(response.body.errors[0].message).to.contain('folderId');
    });

    it('should throw an error if Collection is not found', async () => {
      const query = `
          mutation {
            shareCollection(input:{folderId: 111111111}) {
              id
              shareMessage
              recipients
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].name).toEqual('not_found');
    });

    it('should share the collection', async () => {
      const query = `
          mutation {
            shareCollection(input:{
            folderId: ${folderId},
            shareOptions: {showComments: true}
            }) {
              id
              folderId
              shareOptionsJson
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.data.shareCollection.id).toBeDefined();
      expect(response.body.data.shareCollection.folderId).toEqual(
        `${folderId}`
      );
      collectionShareId = response.body.data.shareCollection.id;
    });

    function getSharedCollection(shareId) {
      const query = `
          query ($shareId: ID!) {
            sharedCollection(shareId: $shareId) {
              shareInfo {
                id
                shareOptionsJson
                type
              }
              name
              programCount
              createdDateTime
              modifiedDateTime
              folderId
              description
              signedImageUrl
              itemCount
              mentions (limit: 5, offset: 0) {
                count
                records {
                  id
                  organizationId
                  mentionHitCount
                  share {
                    id
                    mediaShare {
                      isSegmented
                      token
                      
                    }
                    shareOptionsJson
                  }
                  description
                }
              }
            }
          }`;
      return chakram
        .post(url, { query, variables: { shareId } }, options)
        .then(response => {
          return _.get(result, 'sharedCollection');
        });
    }

    it('should get a shared collection', async () => {
      const eventingEnabled = helpers.canTestEventing();
      if (eventingEnabled) {
        // wait for core-eventing to process adding shared mentions
        await util.sleep(5000);
      }
      const sharedCollection = await getSharedCollection(collectionShareId);
      expect(sharedCollection.folderId).toBeDefined();
      expect(sharedCollection.folderId).toEqual(`${folderId}`);
      expect(sharedCollection.shareInfo.id).toEqual(`${collectionShareId}`);
      collectionShareObject = sharedCollection;

      expect(sharedCollection.name).toEqual('goodbye');
      expect(sharedCollection.programCount).toEqual(1);
      expect(sharedCollection.signedImageUrl).toBeDefined();
      expect(sharedCollection.createdDateTime).toBeDefined();
      expect(sharedCollection.modifiedDateTime).toBeDefined();
      expect(sharedCollection.itemCount).to.be.above(0);

      if (eventingEnabled) {
        // validate core eventing in some envs
        console.log('Testing core eventing occurred with Shared Mentions...');
        expect(sharedCollection.mentions.count).toEqual(2);
        sharedCollection.mentions.records.forEach(mention => {
          expect([mentionId, mentionId2]).to.include(mention.id);
          expect(mention.share.mediaShare).toBeDefined();
          expect(mention.mentionHitCount).toEqual(1);
        });
      }
    });

    it('should create the shared collection history', async () => {
      // use get to test create
      const query = `
          query {
            sharedCollectionHistory(
              folderId: ${folderId},
              shareId: "${collectionShareId}"
            ) {
              records {
                id
                type
                folderId
                shareId
                status
                mentionId
                retryCount
                createdDateTime
                modifiedDateTime
              }
            }
          }
        `;
      const result = await gqlClient.query(query);

      expect(response.body.errors).to.not.exist;
      expect(response.body.data.sharedCollectionHistory.records.length).toEqual(
        1
      );

      const result = response.body.data.sharedCollectionHistory.records[0];
      expect(result.id).toBeDefined();

      historyId = result.id;
      expect(result.type).toEqual('New');
      expect(result.folderId).toEqual(folderId);
      expect(result.shareId).toEqual(collectionShareId);
      if (helpers.canTestEventing()) {
        expect(result.status).toEqual('Complete');
      } else {
        expect(result.status).toEqual('New');
      }
      expect(result.mentionId).to.not.exist;
      expect(result.retryCount).toEqual(0);
      expect(result.createdDateTime).toBeDefined();
      expect(result.modifiedDateTime).toBeDefined();
    });
  });

  it('should update the shared collection history', async () => {
    const query = `
          mutation {
            updateSharedCollectionHistory(input: {
              id: ${historyId},
              status: InProgress,
              statusNote: "just a note",
              retryCount: 1
            }) {
              id
              type
              folderId
              shareId
              status
              mentionId
              retryCount
              createdDateTime
              modifiedDateTime
            }
          }
        `;
    const result = await gqlClient.query(query);

    expect(response.body.errors).to.not.exist;

    const result = response.body.data.updateSharedCollectionHistory;
    expect(result.status).toEqual('InProgress');
    expect(result.retryCount).toEqual(1);
    expect(result.modifiedDateTime).to.not.equal(result.createdDateTime);
  });

  it('should add a new shared mention', async () => {
    // this will use core eventing to add the new mention to shared collection
    let query = `mutation {
            createCollectionMentions(input: {
              folderIds: [${folderId}],
              mentionIds: [${mentionId3}]
            }) {
              folderId,
              mentionId
            }
          }`;
    let response = await chakram.post(url, { query }, options);

    helpers.expect(response.body.errors, 'response.body.errors').to.be;

    if (helpers.canTestEventing()) {
      await util.sleep(5000);
    } else {
      query = `mutation {
            updateSharedCollectionMentions(
              shareId: "${collectionShareId}",
              mentionIds: [${mentionId3}],
              type: AddMentions
            ) {
              id
            }
          }`;
      let response = await chakram.post(url, { query }, options);

      helpers.expect(response.body.errors, 'response.body.errors').to.be;
    }
    const sharedCollection = await getSharedCollection(collectionShareId);
    helpers.expect(response.body.errors, 'response.body.errors').to.be;

    const curSharedMentionCount = collectionShareObject.mentions.count;
    expect(sharedCollection.mentions.count).toEqual(curSharedMentionCount + 1);
    expect(sharedCollection.mentions.records.map(m => m.id)).to.include(
      mentionId3
    );
    expect(
      sharedCollection.mentions.records[0].share.mediaShare.token
    ).toBeDefined();
  });

  it('should not add existing shared mentions', async () => {
    // add same mention
    const query = `mutation {
          updateSharedCollectionMentions(
            shareId: "${collectionShareId}",
            mentionIds: [${mentionId3}],
            type: AddMentions
          ) {
            id
          }
        }`;
    let response = await chakram.post(url, { query }, options);

    helpers.expect(response.body.errors, 'response.body.errors').to.be;

    // verify with a get
    return getSharedCollection(collectionShareId).then(sharedCollection => {
      const curSharedMentionCount = collectionShareObject.mentions.count;
      expect(sharedCollection.mentions.count).toEqual(
        curSharedMentionCount + 1
      );
    });
  });

  it('should remove shared mentions', async () => {
    const query = `mutation {
          updateSharedCollectionMentions(
            shareId: "${collectionShareId}",
            mentionIds: [${mentionId3}],
            type: RemoveMentions
          ) {
            id
          }
        }`;
    let response = await chakram.post(url, { query }, options);

    helpers.expect(response.body.errors, 'response.body.errors').to.be;

    // verify with a get
    return getSharedCollection(collectionShareId).then(sharedCollection => {
      const curSharedMentionCount = collectionShareObject.mentions.count;
      // core eventing would have added mentions in here
      expect(sharedCollection.mentions.count).to.be.at.least(
        curSharedMentionCount
      );
    });
  });
});

describe('list Collections', () => {
  it('should return collections with all fields', async () => {
    const query = `
        query {
        collections (limit:4){
        records
          {
            id
            typeId
            imageUrl
            signedImageUrl
            isActive
            ownerId
            description
            organizationId
            organization {
            	id
            }
            orgSharing
            createdDateTime
            modifiedDateTime
            itemCount
            programCount

          }
        }
        }
        `;
    const result = await gqlClient.query(query);

    helpers.expect(response.body.errors, 'response.body.errors').to.be;
  });

  it('should be fuzzy searchable by name', async () => {
    const nameSubstr = collectionName.substr(0, collectionName.length / 2);
    const query = `
        query {
          collections(name: "${nameSubstr}") {
            records {
              name
            }
          }
        }
        `;
    const result = await gqlClient.query(query);

    helpers.expect(response.body.errors, 'response.body.errors').to.be;

    expect(response.body.data.collections.records).toBeDefined();
    const records = response.body.data.collections.records;
    expect(records.length).to.be.greaterThan(0);
    expect(
      records.find(e => {
        return e.name === collectionName;
      })
    ).toBeDefined();
  });

  it('should return collections by mentionId with all field', () => {
    const query = `
          query {
            collections(mentionId: ${mentionId}, limit: 4) {
              records {
                id
                name
                imageUrl
                signedImageUrl
                ownerId
                description
                organization {
                  id
                }
                organizationId
                orgSharing
                createdDateTime
                modifiedDateTime
                programCount
                itemCount
                typeId
                isActive
                widgets {
                  records {
                    id
                  }
                }
              }
            }
          }
        `;

    chakram.post(url, { query }, options).then(response => {
      expect(response.body.data.collections.records).toBeDefined();
      helpers.expect(response.body.errors, 'response.body.errors').to.be;
    });
  });
});

describe('Delete Collection Mention', () => {
  it('should throw an error if "mentionId" is not provided', async () => {
    const query = `
          mutation {
            deleteCollectionMention(input: {
              folderId: ${folderId}
            }) {
              folderId,
              mentionId
            }
          }`;
    const result = await gqlClient.query(query);
    expect(response).to.have.status(400);
    expect(response.body.errors[0].message).to.contain('mentionId');
  });

  it('should delete mention from collection', async () => {
    const query = `
          mutation {
            deleteCollectionMention(input: {
              folderId: ${folderId},
              mentionId: ${mentionId}
            }) {
              folderId,
              mentionId
            }
          }`;
    const result = await gqlClient.query(query);

    expect(response.body.data.deleteCollectionMention.folderId).toBeDefined();
    expect(response.body.data.deleteCollectionMention.mentionId).toBeDefined();
  });
});

describe('clean up tdo with mentions', done => {
  const queryCreateTdo = `mutation {
        deleteTDO(id: "") {
          id
        }
      }`;
  chakram.post(url, { query: queryCreateTdo }, options).then(response => {
    expect(response.body.errors).to.not.exist;
    done();
  });

  let widgetId;
  describe('Create Widget', () => {
    it('Should create a widget ', () => {
      const query = `
        mutation ($input: CreateWidget!) {
          createWidget(input: $input) {
            adScript
            backgroundColor
            borderColor
            collectionId
            createdDateTime
            displayCollectionName
            displayCollectionDescription
            displayLogo
            displayMentionDescription
            displayMentionIntro
            displayTranscription
            nextButtonColor
            numberOfMentionsToShow
            organizationId
            seoTags
            textColor
            id
            width
          }
        }`;
      const variables = {
        input: {
          adScript: '<br>',
          backgroundColor: 'FFFFFF',
          borderColor: 'D8D8D8',
          collectionId: folderId,
          displayCollectionDescription: false,
          displayCollectionName: true,
          displayLogo: false,
          displayMentionDescription: true,
          displayMentionIntro: true,
          displayTranscription: true,
          nextButtonColor: '2196F3',
          numberOfMentionsToShow: 10,
          seoTags: ['something'],
          textColor: '000000',
          width: 300
        }
      };
      return chakram.post(url, { query, variables }, options).then(response => {
        expect(response.body.data.createWidget).toBeDefined();
        expect(response.body.errors).to.not.exist;
        const widget = response.body.data.createWidget;
        expect(widget.id).to.be.a('string');
        widgetId = widget.id;
        expect(widget).to.include(_.omit(variables.input, 'seoTags')); //array has to be checked separately
        expect(widget.seoTags).to.include(variables.input.seoTags[0]);
      });
    });
  });

  describe('Update Widget', () => {
    it('Should update the widget ', () => {
      const query = `
        mutation ($input: UpdateWidget!) {
          updateWidget(input: $input) {
            adScript
            backgroundColor
            borderColor
            collectionId
            createdDateTime
            displayCollectionName
            displayCollectionDescription
            displayLogo
            displayMentionDescription
            displayMentionIntro
            displayTranscription
            nextButtonColor
            numberOfMentionsToShow
            organizationId
            seoTags
            textColor
            id
            width
          }
        }`;
      const variables = {
        input: {
          backgroundColor: '000000',
          borderColor: 'A8A8A8',
          id: widgetId,
          displayCollectionDescription: true,
          displayCollectionName: false,
          seoTags: ['else'],
          textColor: 'FFFFFF',
          width: 600
        }
      };
      return chakram.post(url, { query, variables }, options).then(response => {
        expect(response.body.data.updateWidget).toBeDefined();
        expect(response.body.errors).to.not.exist;
        const widget = response.body.data.updateWidget;
        expect(widget.id).toEqual(widgetId);
        expect(widget).to.include(_.omit(variables.input, 'seoTags')); //array equality has to be checked separately
        expect(widget.seoTags).to.include(variables.input.seoTags[0]);
        //verify old properties that weren't set are not modified;
        expect(widget).to.include({
          adScript: '<br>',
          collectionId: folderId,
          displayLogo: false,
          displayMentionDescription: true,
          displayMentionIntro: true,
          displayTranscription: true,
          nextButtonColor: '2196F3',
          numberOfMentionsToShow: 10
        });
      });
    });
  });

  describe('Get Collection Widget', () => {
    // Need to rely on preexisting watchlist until other watchlists api are functional
    const date = new Date();
    date.setMilliseconds(0);

    it('Should get widgets for collection ', () => {
      const query = `
        query ($id: ID!) {
          collection(id: $id) {
            widgets {
              count
              records {
                adScript
                backgroundColor
                borderColor
                collectionId
                createdDateTime
                displayCollectionName
                displayCollectionDescription
                displayLogo
                displayMentionDescription
                displayMentionIntro
                displayTranscription
                nextButtonColor
                numberOfMentionsToShow
                organizationId
                seoTags
                textColor
                id
                width
              }
            }
          }
        }`;
      return chakram
        .post(url, { query, variables: { id: folderId } }, options)
        .then(response => {
          expect(response.body.data.collection.widgets).toBeDefined();
          expect(response.body.errors).to.not.exist;
          const widgets = response.body.data.collection.widgets;
          expect(widgets.count).toEqual(1);
          expect(widgets.records[0]).to.include({
            adScript: '<br>',
            collectionId: folderId,
            displayLogo: false,
            displayMentionDescription: true,
            displayMentionIntro: true,
            displayTranscription: true,
            nextButtonColor: '2196F3',
            numberOfMentionsToShow: 10,
            backgroundColor: '000000',
            borderColor: 'A8A8A8',
            id: widgetId,
            displayCollectionDescription: true,
            displayCollectionName: false,
            textColor: 'FFFFFF',
            width: 600
          });
        });
    });
  });

  describe('Get Widget noAuth', () => {
    // Need to rely on preexisting watchlist until other watchlists api are functional
    const date = new Date();
    date.setMilliseconds(0);

    it('Should get widgets for collection ', () => {
      const query = `
        query ($widgetId: ID!, $limit: Int, $offset: Int) {
          widget(id: $widgetId) {
            id
            adScript
            backgroundColor
            borderColor
            collectionId
            createdDateTime
            displayCollectionDescription
            displayCollectionName
            displayLogo
            displayMentionDescription
            displayMentionIntro
            displayMentionTranscription: displayTranscription
            nextButtonColor
            numberOfMentionsToShow
            organizationId
            seoTags
            textColor
            width
            collectionJSON
            mentions (limit: $limit, offset: $offset) {
              count
              records {
                id
              }
            }
          }
        }`;
      return chakram
        .post(
          url,
          { query, variables: { widgetId: widgetId } },
          {
            'Content-Type': 'application/json'
          }
        )
        .then(response => {
          expect(response.body.data.widget).toBeDefined();
          expect(response.body.errors).to.not.exist;
          const widget = response.body.data.widget;
          expect(widget).to.include({
            adScript: '<br>',
            collectionId: folderId,
            displayLogo: false,
            displayMentionDescription: true,
            displayMentionIntro: true,
            nextButtonColor: '2196F3',
            numberOfMentionsToShow: 10,
            backgroundColor: '000000',
            borderColor: 'A8A8A8',
            id: widgetId,
            displayCollectionDescription: true,
            displayCollectionName: false,
            textColor: 'FFFFFF',
            width: 600
          });
          expect(widget.collectionJSON).toBeDefined();
          expect(widget.collectionJSON.id.toString()).toEqual(folderId);
          expect(widget.collectionJSON.name).toEqual('goodbye');
          expect(widget.mentions).toBeDefined();
        });
    });
  });

  describe('Delete Collection', () => {
    it('should throw an error if "folderId" is not provided', async () => {
      const query = `
          mutation {
            deleteCollection {
              id,
              message
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].message).toEqual(
        'The provided input failed validation checks.'
      );
      expect(response.body.errors[0].name).toEqual('invalid_input');
    });

    it('should throw an error if Collection is not found', async () => {
      const query = `
          mutation {
            deleteCollection(id: 111111111) {
              id,
              message
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.errors[0].name).toEqual('not_found');
    });

    it('should delete the collection', async () => {
      const query = `
          mutation {
            deleteCollection(id: ${folderId}) {
              id,
              message
            }
            delete2: deleteCollection(id: ${folderId2}) {
              id,
              message
            }
          }`;
      const result = await gqlClient.query(query);

      expect(response.body.data.deleteCollection.id).toEqual(`${folderId}`);
      expect(response.body.data.delete2.id).toEqual(`${folderId2}`);
      expect(response.body.data.deleteCollection.message).toEqual(
        'Deleted Successfully'
      );
    });
  });
});

async function createMentions(url, options) {
  // create TDO
  const time = moment.utc().subtract(2, 'day');
  const queryCreateTdo = `mutation {
    createTDO(input: {
      status: "uploaded",
      isPublic: true,
      startDateTime: "${time.toISOString()}",
      stopDateTime: "${time.add(3, 'm').toISOString()}"
    }) {
      id
    }
  }`;

  let response = await chakram.post(url, { query: queryCreateTdo }, options);

  const tdoId = _.get(result, 'createTDO.id', null);
  expect(tdoId).not.to.be.null;

  // create mentions
  const queryCreateMention = `mutation (
      $mention1: CreateMention!,
      $mention2: CreateMention!,
      $mention3: CreateMention!
    ) {
    mention1:createMention(input: $mention1) {
      id
    }
    mention2:createMention(input: $mention2) {
      id
    }
    mention3:createMention(input: $mention3) {
      id
    }
  }`;

  const variables = {
    mention1: {
      mediaId: tdoId,
      programId: -1,
      mentionDateTime: time.toISOString(),
      mentionHitCount: 1,
      hitStartDateTime: time.toISOString(),
      hitEndDateTime: time.add(5, 's').toISOString(),
      snippetsString: `[{"startTime":334.179,"endTime":390.179,"text":"Snippet 1"}]`
    },
    mention2: {
      mediaId: tdoId,
      programId: -1,
      mentionDateTime: time.add(5, 's').toISOString(),
      mentionHitCount: 1,
      hitStartDateTime: time.add(5, 's').toISOString(),
      hitEndDateTime: time.add(10, 's').toISOString(),
      snippetsString: `[{"startTime":334.179,"endTime":390.179,"text":"Snippet 2"}]`
    },
    mention3: {
      mediaId: tdoId,
      programId: -1,
      mentionDateTime: time.add(10, 's').toISOString(),
      mentionHitCount: 1,
      hitStartDateTime: time.add(10, 's').toISOString(),
      hitEndDateTime: time.add(20, 's').toISOString(),
      snippetsString: `[{"startTime":334.179,"endTime":390.179,"text":"Snippet 3"}]`
    }
  };
  response = await chakram.post(
    url,
    { query: queryCreateMention, variables },
    options
  );

  const createdMention1 = _.get(result, 'mention1');
  const createdMention2 = _.get(result, 'mention2');
  const createdMention3 = _.get(result, 'mention3');
  expect(createdMention1).toBeDefined();
  expect(createdMention2).toBeDefined();
  expect(createdMention3).toBeDefined();
  return {
    tdoId,
    mentionIds: [createdMention1.id, createdMention2.id, createdMention3.id]
  };
}
