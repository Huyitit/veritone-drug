const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./dalCollection.js')(serviceContext);
const contextUser = mockUtil.makeContext();
describe('dalCollection.js', function () {
  describe('#require', function () {
    it('should have correct function exports', function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(28);
    });
  });
  describe('#getCollectionMention', function () {
    it('should error on missing id', async function () {
      try {
        await dal.getCollectionMention(mockUtil.makeContext(), {});
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include(
          'folderId or mentionId must be specified'
        );
      }
    });
    it('should retrieve collection mention', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '123',
          mention_id: '456'
        }
      ]);

      const cm = await dal.getCollectionMention(mockUtil.makeContext(), {
        folderId: 123,
        mentionId: 456
      });
      chaiExpect(cm.folderId).to.equal('123');
      chaiExpect(cm.mentionId).to.equal('456');
    });
  });

  describe('#getCollectionMentions', function () {
    it('should error on missing folderId', async function () {
      try {
        await dal.getCollectionMentions(mockUtil.makeContext(), {});
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include(
          'folderId or mentionId must be specified'
        );
      }
    });
    it('should retrieve collection mention', async function () {
      const now = moment().toISOString();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '123',
          mention_id: '456',
          description: 'td',
          created_date_time: now,
          modified_date_time: now
        },
        {
          folder_id: '789',
          mention_id: '012'
        }
      ]);

      const cm = await dal.getCollectionMentions(mockUtil.makeContext(), {
        folderId: 123,
        mentionId: 456,
        orderBy: { field: 'mentionDate', direction: 'desc' }
      });
      chaiExpect(cm.count).to.equal(2);
      chaiExpect(cm.records[0].folderId).to.equal('123');
      chaiExpect(cm.records[0].mentionId).to.equal('456');
      chaiExpect(cm.records[0].createdDateTime).to.equal(now);
      chaiExpect(cm.records[0].modifiedDateTime).to.equal(now);
      chaiExpect(cm.records[0].description).to.equal('td');
      chaiExpect(cm.records[1].folderId).to.equal('789');
      chaiExpect(cm.records[1].mentionId).to.equal('012');
    });

    it('should throw internal_error, if orderBy field is not valid', async function () {
      try {
        await dal.getCollectionMentions(mockUtil.makeContext(), {
          folderId: 123,
          orderBy: { field: 'mentionTime', direction: 'desc' }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('internal_error');
        chaiExpect(_.toString(err)).to.include(
          'An internal server configuration error in collection mentions order by processing has occurred.'
        );
      }
    });
  });

  describe('#updateCollectionMentions', function () {
    it('should error on missing collection mention', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.updateCollectionMention(mockUtil.makeContext(), {
          input: {
            folderId: 123,
            mentionId: 456
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
        chaiExpect(_.toString(err)).to.include('Collection Mention not found');
      }
    });
    it('should update collection mention', async function () {
      const now = moment().toISOString();
      const updatedDate = moment().add(1, 's').toISOString();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '123',
          mention_id: '456',
          description: 'td',
          created_date_time: now,
          modified_date_time: now
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push([
        {
          folder_id: '123',
          mention_id: '456',
          description: 'updated',
          created_date_time: now,
          modified_date_time: updatedDate
        }
      ]);

      const cm = await dal.updateCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId: 123,
          mentionId: 456
        },
        organizationId: 12345
      });
      chaiExpect(cm.folderId).to.equal('123');
      chaiExpect(cm.mentionId).to.equal('456');
      chaiExpect(cm.createdDateTime).to.equal(now);
      chaiExpect(cm.modifiedDateTime).to.equal(updatedDate);
      chaiExpect(cm.description).to.equal('updated');
    });
  });

  describe('#createCollectionMention', function () {
    it('should error on missing folderId', async function () {
      try {
        await dal.createCollectionMention(mockUtil.makeContext(), {
          input: {}
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('folderId');
      }
    });
    it('should error on missing mentionId', async function () {
      try {
        await dal.createCollectionMention(mockUtil.makeContext(), {
          input: {
            folderId: '123'
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('mentionId');
      }
    });
    it('should error on missing organizationId', async function () {
      try {
        await dal.createCollectionMention(mockUtil.makeContext(), {
          input: {
            folderId: '123',
            mentionId: '456'
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('organizationId');
      }
    });
    it('should createCollectionMention with no shares', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: folderId,
            mentionId: mentionId,
            organizationId: organizationId
          }
        ],
        false
      );

      serviceContext.dal.mention = {
        getMention: () => {
          return {
            mentionId,
            createdDateTime: now,
            modifiedDateTime: now
          };
        }
      };

      serviceContext.dal.share = {
        getShares: () => []
      };

      const cm = await dal.createCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
    });
    it('should createCollectionMention with 2 shares', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: folderId,
            mentionId: mentionId,
            organizationId: organizationId
          }
        ],
        false
      );

      serviceContext.dal.mention = {
        getMention: () => {
          return {
            mentionId,
            createdDateTime: now,
            modifiedDateTime: now
          };
        }
      };

      let emitCounter = 0;
      serviceContext.dal.share = {
        sharedCollectionUpdateType: {
          AddMentions: 'AddMentions'
        },
        emitUpdateSharedCollectionEvent: () => {
          emitCounter++;
        },
        getShares: () => [
          {
            shareId: '123',
            folderId: '567'
          },
          {
            shareId: '543',
            folderId: '878'
          }
        ]
      };

      const cm = await dal.createCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
      chaiExpect(emitCounter).to.equal(2);
    });
  });

  describe('#_createCollectionMention', function () {
    it('should error on missing options', async function () {
      try {
        await dal._createCollectionMention('not object');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Mention instance)'
        );
      }
    });
    it('should error when missing folderId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._createCollectionMention(new model.Mention({}));
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.folderId');
      }
    });
    it('should error when missing mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._createCollectionMention({
          folderId: '123',
          constructor: model.Mention
        });
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should error when missing organizationId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._createCollectionMention({
          mentionId: '123',
          folderId: '123',
          constructor: model.Mention
        });
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.organizationId');
      }
    });
    it('should error when dbResult.length != 1', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        serviceContext.dbConnections['media_platform'].write._push([]);
        await dal._createCollectionMention({
          mentionId: '123',
          folderId: '123',
          organizationId: '7682',
          constructor: model.Mention
        });
      } catch (error) {
        chaiExpect(error.message).to.contain('Expected 1 result but received');
      }
    });
  });

  describe('#createCollectionMentions', function () {
    it('should error on invalid folderIds', async function () {
      serviceContext.dbConnections['media_platform'].read._push([], false);

      serviceContext.dal.mention = {
        getMentions: () => {
          return [];
        }
      };

      try {
        await dal.createCollectionMentions(mockUtil.makeContext(), {
          input: {
            folderIds: [1, 2],
            mentionIds: [3, 4]
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('folderIds');
      }
    });
    it('should error on invalid mentionIds', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: '1'
          }
        ],
        false
      );

      serviceContext.dal.mention = {
        getMentions: () => {
          return {
            count: 0,
            records: []
          };
        }
      };

      try {
        await dal.createCollectionMentions(mockUtil.makeContext(), {
          input: {
            mentionIds: [1, 2],
            folderIds: [4, 5]
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('mentionIds');
      }
    });
    it('should createCollectionMentions with no shares', async function () {
      const now = moment().toISOString();

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f1'
          },
          {
            folder_id: 'f2'
          }
        ],
        false
      );

      serviceContext.dal.mention = {
        getMentions: () => {
          return {
            count: 2,
            records: [
              {
                id: 1,
                createdDateTime: now,
                modifiedDateTime: now
              },
              {
                id: 2,
                createdDateTime: now,
                modifiedDateTime: now
              }
            ]
          };
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([
        {
          folder_id: 'f1',
          mention_id: 1
        },
        {
          folder_id: 'f2',
          mention_id: 2
        },
        {
          folder_id: 'f1',
          mention_id: 1
        },
        {
          folder_id: 'f2',
          mention_id: 2
        }
      ]);

      serviceContext.dal.share = {
        getShares: () => []
      };
      const cm = await dal.createCollectionMentions(mockUtil.makeContext(), {
        input: {
          folderIds: ['f1', 'f2'],
          mentionIds: [1, 2]
        }
      });
      chaiExpect(cm).to.have.length(4);
    });
    it('should createCollectionMentions with 2 shares', async function () {
      const now = moment().toISOString();

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f1'
          },
          {
            folder_id: 'f2'
          }
        ],
        false
      );

      serviceContext.dal.mention = {
        getMentions: () => {
          return {
            count: 2,
            records: [
              {
                id: 1,
                createdDateTime: now,
                modifiedDateTime: now
              },
              {
                id: 2,
                createdDateTime: now,
                modifiedDateTime: now
              }
            ]
          };
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([
        {
          folder_id: 'f1',
          mention_id: 1
        },
        {
          folder_id: 'f2',
          mention_id: 2
        },
        {
          folder_id: 'f1',
          mention_id: 1
        },
        {
          folder_id: 'f2',
          mention_id: 2
        }
      ]);

      let emitCounter = 0;
      serviceContext.dal.share = {
        getShares: () => [{ shareId: 's1' }, { shareId: 's2' }],
        sharedCollectionUpdateType: {
          AddMentions: 'AddMentions'
        },
        emitUpdateSharedCollectionEvent: () => {
          emitCounter++;
        }
      };
      const cm = await dal.createCollectionMentions(mockUtil.makeContext(), {
        input: {
          folderIds: ['f1', 'f2'],
          mentionIds: [1, 2]
        }
      });
      chaiExpect(cm).to.have.length(4);
      chaiExpect(emitCounter).to.equal(8);
    });
  });

  describe('#deleteMentionComment', function () {
    it('should throw invalid_input, if validation is failed', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: true,
          commentId: 'commentId'
        }
      };

      try {
        res = await dal.deleteMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    // it('should throw error, if delete mention comment fail', async function() {
    //   let res, err;
    //   const args = {
    //     input: {
    //       mentionId: 'mentionIdError',
    //       commentId: 'commentId'
    //     }
    //   };
    //   serviceContext.dbConnections['media_platform'].write._push([], false);
    //   serviceContext.dbConnections['media_platform'].write._push([], false);

    //   try {
    //     res = await dal.deleteMentionComment(contextUser, args);
    //   } catch (error) {
    //     err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    //   }

    //   chaiExpect(err).to.exist;
    //   chaiExpect(res).to.be.undefined;
    // });

    it('should delete mention comment', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionId',
          commentId: 'commentId'
        }
      };
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);

      try {
        res = await dal.deleteMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('commentId');
      chaiExpect(res.message).to.equal('Deleted Successfully');
    });
  });

  describe('#_deleteMentionComment', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._deleteMentionComment('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Comment instance)'
        );
      }
    });
    it('should throw error when missing options.mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: null }),
          () => {}
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should throw error when missing options.commentId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: null }),
          () => {}
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.commentId');
      }
    });
    it('should throw error when deleteMentionComment step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // deleteMentionComment
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Mention-Comment not found');
      }
    });
    it('should throw error when deleteMentionComment step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // createComment
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 mention-comment to be deleted but'
        );
      }
    });
    it('should throw error when query of deleteMentionComment step fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}],
        false,
        [],
        null,
        true
      ); // createComment fails
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });
    it('should throw error when deleteComment step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // deleteMentionComment
      serviceContext.dbConnections['media_platform'].write._push([], false); // deleteComment
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Comment not found');
      }
    });
    it('should throw error when deleteComment step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // createMentionComment
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // deleteComment
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 comment to be deleted but'
        );
      }
    });
    it('should throw error when query of deleteComment step fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // createMentionComment
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        null,
        true
      ); // deleteComment
      try {
        await dal._deleteMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });
  });

  describe('#_createMentionRating', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._createMentionRating('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Rating instance)'
        );
      }
    });
    it('should throw error when missing options.mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._createMentionRating(
          new model.Rating({ mentionId: null }),
          () => {}
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should throw error when verifyRatingNonExistent step return result', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // verifyRatingNonExistent
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Rating for the given user already exists'
        );
      }
    });
    it('should throw error when verifyRatingNonExistent fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        null,
        true
      ); // verifyRatingNonExistent
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });
    it('should throw error when createRating step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push([], false); // createRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Failed to create rating');
      }
    });
    it('should throw error when createRating step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // createRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 rating to be created but'
        );
      }
    });
    it('should throw error when createRating step validates fail', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: null
          }
        ],
        false
      ); // createRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Failed to validate returned rating'
        );
      }
    });
    it('should throw error when query of createRating step fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false,
        [],
        null,
        true
      ); // createRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });

    it('should throw error when createMentionRating step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push([], false); // createMentionRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Failed to create mention-rating');
      }
    });
    it('should throw error when createMentionRating step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // createMentionRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 mention-rating to be created but'
        );
      }
    });
    it('should throw error when query of createMentionRating step fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        null,
        true
      ); // createMentionRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });
    it('should throw error when updateOverallRating step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // createMentionRating
      serviceContext.dbConnections['media_platform'].write._push([], false); // updateOverallRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Mention not found');
      }
    });
    it('should throw error when updateOverallRating step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // createMentionRating
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // updateOverallRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 mention to be updated but'
        );
      }
    });
    it('should throw error when query of updateOverallRating step fails', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // verifyRatingNonExistent
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // createRating
      serviceContext.dbConnections['media_platform'].write._push([{}], false); // createMentionRating
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        null,
        true
      ); // createMentionRating
      try {
        await dal._createMentionRating(new model.Rating({ mentionId: '123' }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Error: Query fails');
      }
    });
  });

  describe('#createMentionRating', function () {
    it('should throw error when validate fails', async function () {
      try {
        const _context = {
          requestContext: {
            userInfo: {
              userId: null
            }
          }
        };

        await dal.createMentionRating(_context, {
          input: {
            mentionId: '123'
          }
        });
      } catch (err) {
        chaiExpect(err).to.exist;
      }
    });
    it('should create mention rating', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].write._push([], false); // DELETE query
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            ratingId: 1234,
            mentionId: mentionId,
            userId: 1234
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            ratingId: 1234,
            mentionId: mentionId,
            userId: 1234
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            ratingId: 1234,
            mentionId: mentionId,
            userId: 1234
          }
        ],
        false
      );
      try {
        await dal.createMentionRating(mockUtil.makeContext(), {
          input: {
            mentionId: mentionId
          }
        });
      } catch (err) {
        chaiExpect(err).to.not.exist;
      }
    });
  });
  describe('#updateWidget', function () {
    it('should convert empty seoTags array', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: '123'
          }
        ],
        true,
        ['seo_tags'],
        (sql, args) => {
          if (args[0] != '123') return false;
          // needs to be literal '{}' for pg to avoid type error
          if (args[1] != '{}') return false;
          return true;
        }
      );
      const res = await dal.updateWidget(
        {
          input: {
            seoTags: [],
            id: '123',
            widgetId: '123'
          }
        },
        mockUtil.makeContext()
      );
    });
    it('should preserve non-empty seoTags array', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: '123'
          }
        ],
        true,
        ['seo_tags'],
        (sql, args) => {
          if (args[0] != '123') return false;
          if (!(_.isArray(args[1]) && args[1].length === 2)) return false;
          return true;
        }
      );
      const res = await dal.updateWidget(
        {
          input: {
            seoTags: ['tag1', 'tag2'],
            id: '123',
            widgetId: '123'
          }
        },
        mockUtil.makeContext()
      );
    });
  });
  describe('#deleteCollection', function () {
    it('should error on no org ID', async function () {
      try {
        await dal.deleteCollection(mockUtil.makeContext(), {});
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });
    it('dalFolder.unfileObject throw an error', async function () {
      try {
        const serviceCtx = require('../test/serviceContext.mock.js')();
        serviceCtx.dal.folder.unfileObject = async (
          context,
          args,
          objectType
        ) => {
          throw new Error('(unfileObject) Failed to unfile');
        };

        serviceCtx.dbConnections['media_platform'].read._push(
          [
            {
              collection_id: '123'
            }
          ],
          false
        );
        serviceCtx.dbConnections['media_platform'].write._push([], false);
        serviceCtx.dbConnections['media_platform'].write._push([], false);
        serviceCtx.dbConnections['media_platform'].write._push([], false);
        serviceCtx.dbConnections['media_platform'].write._push([{}], false);
        serviceCtx.dbConnections['media_platform'].write._push([{}], false);
        serviceCtx.dbConnections['media_platform'].write._push([{}], false);

        const dalCollection = require('./dalCollection.js')(serviceCtx);
        const funcCtx = mockUtil.makeContext();
        const args = {
          id: '123',
          organizationId: 'c8b7a92f-6757-4dcb-a4d4-687c27dd6f7b'
        };
        await dalCollection.deleteCollection(mockUtil.makeContext(), args);
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(`${err}`).to.contain('(unfileObject) Failed to unfile');
      }
    });
    it('should delete collection successfully', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            collection_id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      try {
        await dal.deleteCollection(mockUtil.makeContext(), {
          id: '123',
          organizationId: '7682'
        });
      } catch (err) {
        chaiExpect(err).to.not.exist;
      }
    });
    it('should throw error when collection not found', async function () {
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);

      try {
        await dal.deleteCollection(mockUtil.makeContext(), {
          id: '123',
          organizationId: '7682'
        });
      } catch (err) {
        chaiExpect(err).to.exist;
        chaiExpect(err.name).to.equal('not_found');
        // chaiExpect(err.name).to.equal('resource_conflict');
        // chaiExpect(_.toString(err)).to.include(
        //   'cannot be deleted because it contains'
        // );
      }
    });
  });
  describe('#createWidget', function () {
    beforeAll(function () {
      serviceContext.dal.share = {
        getShares: () => [
          {
            shareId: '123',
            folderId: '567'
          },
          {
            shareId: '543',
            folderId: '878'
          }
        ]
      };
    });
    it('should error on no nextButtonColor', async function () {
      try {
        await dal.createWidget(
          {
            input: {
              collectionId: '123'
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err.message)).to.include('nextButtonColor');
      }
    });

    it('should throw error: validate widget instance fails', async function () {
      try {
        await dal.createWidget(
          {
            input: {
              nextButtonColor: '000000',
              width: 0,
              numberOfMentionsToShow: 1,
              displayCollectionName: false,
              displayCollectionDescription: false,
              displayLogo: false,
              displayMentionIntro: false,
              displayTranscription: false,
              displayMentionDescription: false
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal(
          'The provided input failed validation checks.'
        );
      }
    });

    it('should throw error: violates unique constraint', async function () {
      try {
        serviceContext.dbConnections['media_platform'].write._push(
          [
            {
              widgetId: 123,
              organizationId: 123,
              collectionId: 123
            }
          ],
          false
        );
        const _serviceContext = _.cloneDeep(serviceContext);
        _serviceContext.dbConnections[
          'media_platform'
        ].write.query = async () => {
          throw new Error('violates unique constraint');
        };
        const _dal = require('./dalCollection.js')(_serviceContext);
        await _dal.createWidget(
          {
            input: {
              collectionId: '123',
              nextButtonColor: '000000',
              width: 0,
              numberOfMentionsToShow: 1,
              displayCollectionName: false,
              displayCollectionDescription: false,
              displayLogo: false,
              displayMentionIntro: false,
              displayTranscription: false,
              displayMentionDescription: false
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('resource_conflict');
        chaiExpect(err.message).to.equal(
          'A widget with the supplied name already exists in the target folder.'
        );
      }
    });

    it('should throw error: other errors', async function () {
      try {
        serviceContext.dbConnections['media_platform'].write._push(
          [
            {
              widgetId: 123,
              organizationId: 123,
              collectionId: 123
            }
          ],
          false
        );
        const _serviceContext = _.cloneDeep(serviceContext);
        _serviceContext.dbConnections[
          'media_platform'
        ].write.query = async () => {
          throw new Error('query fails');
        };
        const _dal = require('./dalCollection.js')(_serviceContext);
        await _dal.createWidget(
          {
            input: {
              collectionId: '123',
              nextButtonColor: '000000',
              width: 0,
              numberOfMentionsToShow: 1,
              displayCollectionName: false,
              displayCollectionDescription: false,
              displayLogo: false,
              displayMentionIntro: false,
              displayTranscription: false,
              displayMentionDescription: false
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.message).to.equal('query fails');
      }
    });

    it('should create widget successfully', async function () {
      // mock out pg.connect, which is the first thing called in the
      // core-collection-server DAL createWidget
      try {
        serviceContext.dbConnections['media_platform'].write._push(
          [
            {
              widgetId: 123,
              organizationId: 123,
              collectionId: 123
            }
          ],
          false
        );
        await dal.createWidget(
          {
            input: {
              collectionId: '123',
              nextButtonColor: '000000',
              width: 0,
              numberOfMentionsToShow: 1,
              displayCollectionName: false,
              displayCollectionDescription: false,
              displayLogo: false,
              displayMentionIntro: false,
              displayTranscription: false,
              displayMentionDescription: false
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err).to.not.exist;
      }
    });

    it('should work when getShares return empty value', async function () {
      serviceContext.dal.share = {
        getShares: async () => {
          return null;
        },
        shareCollection: async () => {
          return null;
        }
      };
      try {
        serviceContext.dbConnections['media_platform'].write._push(
          [
            {
              widgetId: 123,
              organizationId: 123,
              collectionId: 123
            }
          ],
          false
        );
        await dal.createWidget(
          {
            input: {
              collectionId: '123',
              nextButtonColor: '000000',
              width: 0,
              numberOfMentionsToShow: 1,
              displayCollectionName: false,
              displayCollectionDescription: false,
              displayLogo: false,
              displayMentionIntro: false,
              displayTranscription: false,
              displayMentionDescription: false
            },
            organizationId: '7682'
          },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err).to.not.exist;
      }
    });
  });

  describe('#_createWidget', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._createWidget('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Widget instance)'
        );
      }
    });

    it('should throw error when missing dbResult array', async function () {
      try {
        const _serviceContext = _.cloneDeep(serviceContext);
        _serviceContext.dbConnections[
          'media_platform'
        ].write.query = async () => {
          return null;
        };
        const _dal = require('./dalCollection')(_serviceContext);
        const model = require('../modules/core-collection-server/model')(
          _serviceContext.config
        );
        await _dal._createWidget(new model.Widget({}));
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing dbResult array');
      }
    });
    it('should throw error when length of dbResult array is not equal to 1', async function () {
      try {
        const _serviceContext = _.cloneDeep(serviceContext);
        _serviceContext.dbConnections[
          'media_platform'
        ].write.query = async () => {
          return [{}, {}];
        };
        const _dal = require('./dalCollection')(_serviceContext);
        const model = require('../modules/core-collection-server/model')(
          _serviceContext.config
        );
        await _dal._createWidget(new model.Widget({}));
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 widget to be created but'
        );
      }
    });
  });

  describe('#createMentionComment', function () {
    it('should throw error invalid_input, if the input comment was not valid', async function () {
      let res, err;
      const args = {
        input: { mentionId: true }
      };

      // mock getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'userId',
            user_name: 'userName',
            kvp: { firstName: 'user', lastName: 'name' }
          }
        ],
        false
      );

      try {
        res = await dal.createMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should create a mention comment', async function () {
      let res, err;
      const args = {
        input: { mentionId: '123' }
      };

      // mock getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 'userId',
            user_name: 'userName',
            kvp: { firstName: 'user', lastName: 'name', image: 'myImage' }
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: 123,
            mentionId: 123,
            commentId: 123
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: 123,
            mentionId: 123,
            commentId: 123
          }
        ],
        false
      );

      try {
        res = await dal.createMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.userImage).to.equal('myImage');
      chaiExpect(res.firstName).to.equal('user');
      chaiExpect(res.lastName).to.equal('name');
      chaiExpect(res.commentId).to.equal('123');
      chaiExpect(res.mentionId).to.equal('123');
    });
  });

  describe('#_createMentionComment', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._createMentionComment('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Comment instance)'
        );
      }
    });
    it('should throw error when missing options.mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._createMentionComment(new model.Comment({ mentionId: null }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should throw error when createComment step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // createComment
      try {
        await dal._createMentionComment(
          new model.Comment({ mentionId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Failed to create comment');
      }
    });
    it('should throw error when createComment step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // createComment
      try {
        await dal._createMentionComment(
          new model.Comment({ mentionId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 comment to be created but'
        );
      }
    });
    it('should throw error when createMentionComment step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ userId: '123' }],
        false
      ); // createComment
      serviceContext.dbConnections['media_platform'].write._push([], false); // createMentionComment

      try {
        await dal._createMentionComment(
          new model.Comment({ mentionId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Failed to create mention-comment');
      }
    });
    it('should throw error when createMentionComment step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ userId: '123' }],
        false
      ); // createComment
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // createMentionComment

      try {
        await dal._createMentionComment(
          new model.Comment({ mentionId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 mention-comment to be created but'
        );
      }
    });
  });

  describe('#_updateMentionComment', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._updateMentionComment('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Comment instance)'
        );
      }
    });
    it('should throw error when missing options.mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._updateMentionComment(
          new model.Comment({ mentionId: null }),
          () => {}
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should throw error when missing options.commentId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._updateMentionComment(
          new model.Comment({
            mentionId: '123',
            commentId: null
          }),
          () => {}
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.commentId');
      }
    });
    it('should throw error when updateComment step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false);
      try {
        await dal._updateMentionComment(
          new model.Comment({
            mentionId: '123',
            commentId: '123'
          })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Failed to create comment');
      }
    });
    it('should throw error when createComment step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // updateComment

      try {
        await dal._updateMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 comment to be updated but'
        );
      }
    });
    it('should throw error when createComment step validates fail', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{ userId: null }],
        false
      ); // updateComment
      try {
        await dal._updateMentionComment(
          new model.Comment({ mentionId: '123', commentId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Failed to validate returned comment'
        );
      }
    });
  });

  describe('#updateMentionComment', function () {
    it('should throw invalid_input, if validation is failed', async function () {
      let res, err;
      const args = { input: { mentionId: true } };

      try {
        res = await dal.updateMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should update mention comment', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: '123',
          commentId: '123',
          commentText: 'test'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: 123,
            mentionId: 123,
            commentId: 123
          }
        ],
        false
      );

      try {
        res = await dal.updateMentionComment(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.commentId).to.equal('123');
      chaiExpect(res.mentionId).to.equal('123');
    });
  });

  describe('#getWidget', function () {
    it('should throw error not_found, if widget is not exists', async function () {
      let res, err;
      const args = {
        id: 'widgetId',
        collectionId: 'collectionId',
        organizationId: 7682
      };

      // mock data getWidgets
      serviceContext.dbConnections['media_platform'].read._push([]);

      try {
        res = await dal.getWidget(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.be.undefined;
    });

    it('should get widget by id and some optional param', async function () {
      let res, err;
      const args = {
        id: 'widgetId',
        collectionId: 'collectionId',
        organizationId: 7682
      };

      // mock data getWidgets
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 'widgetId', organization_id: 7682, collection_id: 'collectionId' }
      ]);

      try {
        res = await dal.getWidget(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('widgetId');
      chaiExpect(res.organizationId).to.equal(7682);
      chaiExpect(res.collectionId).to.equal('collectionId');
    });
  });

  describe('#getWidgets', function () {
    it('should get list widgets, when limit and offset was passed in', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        folderId: 9361,
        limit: 20,
        offset: 1
      };

      // mock data getWidgets
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'Qa2Z5LJTQseqa1ioq_vkZQ',
          organization_id: 7682,
          collection_id: 9361
        },
        {
          id: 'H6_xxOFFQ6uh_zBuHqJ6vw',
          organization_id: 7682,
          collection_id: 9361
        }
      ]);

      try {
        res = await dal.getWidgets(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.offset).to.equal(1);
      chaiExpect(res.limit).to.equal(20);
      chaiExpect(res.records.length).to.equal(2);
    });

    it('should get list widgets, if limit and offset was not passed', async function () {
      let res, err;
      const args = {
        organizationId: 7682,
        folderId: 9361
      };

      // mock data getWidgets
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'Qa2Z5LJTQseqa1ioq_vkZQ',
          organization_id: 7682,
          collection_id: 9361
        },
        {
          id: 'H6_xxOFFQ6uh_zBuHqJ6vw',
          organization_id: 7682,
          collection_id: 9361
        }
      ]);

      try {
        res = await dal.getWidgets(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
      chaiExpect(res.records.length).to.equal(2);
    });
  });

  describe('#updateMentionRating', function () {
    it('should throw invalid_input error, if validation is fail', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionId',
          ratingId: 'ratingId',
          ratingValue: false
        }
      };

      try {
        res = await dal.updateMentionRating(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.ratingValue.message).to.equal('should be a Number');
      chaiExpect(res).to.be.undefined;
    });

    it('should update a mention rating', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: '123',
          ratingId: '123',
          ratingValue: 5
        }
      };

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            mentionId: 123,
            userId: 123,
            ratingId: 123,
            ratingValue: 5
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            mentionId: 123,
            userId: 123,
            ratingId: 123,
            ratingValue: 5
          }
        ],
        false
      );

      try {
        res = await dal.updateMentionRating(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.mentionId).to.equal('123');
      chaiExpect(res.ratingId).to.equal('123');
      chaiExpect(res.ratingValue).to.equal(5);
    });
  });

  describe('#_updateMentionRating', function () {
    it('should throw error when options is not type of object', async function () {
      try {
        await dal._updateMentionRating('undefined');
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Missing options (should be a model.Rating instance)'
        );
      }
    });
    it('should throw error when missing options.mentionId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._updateMentionRating(new model.Rating({ mentionId: null }));
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.mentionId');
      }
    });
    it('should throw error when missing options.ratingId', async function () {
      try {
        const model = require('../modules/core-collection-server/model')(
          serviceContext.config
        );
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: null })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Missing options.ratingId');
      }
    });
    it('should throw error when updateRating step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push([], false); // updateRating
      try {
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Rating not found');
      }
    });
    it('should throw error when updateRating step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // updateRating
      try {
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 rating to be updated but'
        );
      }
    });
    it('should throw error when updateRating step validates fail', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: null
          }
        ],
        false
      ); // updateRating
      try {
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Failed to validate returned rating'
        );
      }
    });
    it('should throw error when updateOverallRating step return no results', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // updateRating
      serviceContext.dbConnections['media_platform'].write._push([], false); // updateOverallRating
      try {
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.equal('Mention not found');
      }
    });
    it('should throw error when updateOverallRating step return 2 results at least', async function () {
      const model = require('../modules/core-collection-server/model')(
        serviceContext.config
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            userId: '123'
          }
        ],
        false
      ); // updateRating
      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // updateOverallRating
      try {
        await dal._updateMentionRating(
          new model.Rating({ mentionId: '123', ratingId: '123' })
        );
      } catch (error) {
        chaiExpect(error.message).to.contain(
          'Expected 1 mention to be updated but'
        );
      }
    });
  });

  describe('#deleteMentionRating', function () {
    it('should throw invalid_input error, if validation is fail', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionId',
          ratingId: false
        }
      };

      try {
        res = await dal.deleteMentionRating(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.ratingId.message).to.equal('should be a String');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error, if delete mention rating fail', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionIdError',
          ratingId: 'ratingId'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false);

      try {
        res = await dal.deleteMentionRating(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error, if delete mention rating fail in case mentionId is empty', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: '',
          ratingId: 'ratingId'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);

      try {
        res = await dal.deleteMentionRating(contextUser, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.message).to.equal('Failed to delete mention rating');
    });

    it('should throw error, if delete mention rating fail in case ratingId is empty', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionId',
          ratingId: ''
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      try {
        res = await dal.deleteMentionRating(contextUser, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.message).to.equal('Failed to delete mention rating');
    });

    it('should delete a mention rating', async function () {
      let res, err;
      const args = {
        input: {
          mentionId: 'mentionId',
          ratingId: 'ratingId'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);

      try {
        res = await dal.deleteMentionRating(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('ratingId');
      chaiExpect(res.message).to.equal('Deleted Successfully');
    });
  });
  describe('#createCollection', function () {
    it('should throw invalid_input, if missing organizationId', async function () {
      let res, err;
      const args = { input: {} };

      try {
        res = await dal.createCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw invalid_input, if validation is fail', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          name: 'folder name',
          folderDescription: 'description',
          image: true
        }
      };

      try {
        res = await dal.createCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.detail.image.message).to.equal('should be a String');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error, if create collection fail', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          name: 'errorName',
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };
      serviceContext.dbConnections['media_platform'].write._push([], false);

      try {
        res = await dal.createCollection(contextUser, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.message).to.equal(
        'Failed to create collection'
      );
      chaiExpect(res).to.be.undefined;
    });

    it('should create collection', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          name: 'folder name',
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: 123
          }
        ],
        false
      );

      try {
        res = await dal.createCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.folderId).to.equal(123);
    });
  });

  describe('#deleteCollectionMention', function () {
    it('should error on missing folderId', async function () {
      try {
        await dal.deleteCollectionMention(mockUtil.makeContext(), {
          input: {}
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('folderId');
      }
    });
    it('should error on missing mentionId', async function () {
      try {
        await dal.deleteCollectionMention(mockUtil.makeContext(), {
          input: {
            folderId: '123'
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(_.toString(err)).to.include('mentionId');
      }
    });
    it('should throw error when validate fails', async function () {
      try {
        const _context = _.cloneDeep(mockUtil.makeContext());
        _.set(
          _context,
          'requestContext.userInfo.organization.organizationId',
          null
        );
        await dal.deleteCollectionMention(_context, {
          input: {
            folderId: '123',
            mentionId: '123',
            organizationId: 7682
          }
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.equal('Missing organizationId');
      }
    });
    it('should throw err', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].write._push([], false); // DELETE query
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      ); // DELETE query

      serviceContext.dal.share = {
        getShares: () => []
      };

      const cm = await dal.deleteCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
    });
    it('should deleteCollectionMention with no shares', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].write._push([], false); // DELETE query
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      ); // DELETE query

      serviceContext.dal.share = {
        getShares: () => []
      };

      const cm = await dal.deleteCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
    });
    it('should deleteCollectionMention with 2 shares', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      // serviceContext.dbConnections['media_platform'].write._push(
      //   [
      //     {
      //       folder_id: folderId,
      //       created_date_time: now,
      //       modified_date_time: now
      //     }
      //   ],
      //   false
      // );

      serviceContext.dbConnections['media_platform'].write._push([], false); // DELETE query
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      ); // DELETE query

      serviceContext.dal.mention = {
        getMention: () => {
          return {
            mentionId,
            createdDateTime: now,
            modifiedDateTime: now
          };
        }
      };

      let emitCounter = 0;
      serviceContext.dal.share = {
        sharedCollectionUpdateType: {
          DeleteMentions: 'DeleteMentions'
        },
        emitUpdateSharedCollectionEvent: () => {
          emitCounter++;
        },
        getShares: () => [
          {
            shareId: '123',
            folderId: '567'
          },
          {
            shareId: '543',
            folderId: '878'
          }
        ]
      };

      const cm = await dal.deleteCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
      chaiExpect(emitCounter).to.equal(2);
    });
    it('should deleteCollectionMention with 2 shares in case deleteMentionFromCollectionFunc return data', async function () {
      const now = moment().toISOString();
      const folderId = '123';
      const mentionId = '456';
      const organizationId = 7682;

      serviceContext.dbConnections['media_platform'].write._push(
        [{}, {}],
        false
      ); // DELETE query
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: folderId,
            created_date_time: now,
            modified_date_time: now
          }
        ],
        false
      ); // DELETE query

      serviceContext.dal.mention = {
        getMention: () => {
          return {
            mentionId,
            createdDateTime: now,
            modifiedDateTime: now
          };
        }
      };

      let emitCounter = 0;
      serviceContext.dal.share = {
        sharedCollectionUpdateType: {
          DeleteMentions: 'DeleteMentions'
        },
        emitUpdateSharedCollectionEvent: () => {
          emitCounter++;
        },
        getShares: () => [
          {
            shareId: '123',
            folderId: '567'
          },
          {
            shareId: '543',
            folderId: '878'
          }
        ]
      };

      const cm = await dal.deleteCollectionMention(mockUtil.makeContext(), {
        input: {
          folderId,
          mentionId,
          organizationId
        }
      });
      chaiExpect(cm.folderId).to.equal(folderId);
      chaiExpect(cm.mentionId).to.equal(mentionId);
      chaiExpect(cm.organizationId).to.equal(organizationId);
      chaiExpect(emitCounter).to.equal(2);
    });
  });

  describe('#updateCollection', function () {
    it('should throw invalid_input, if missing organizationId', async function () {
      let res, err;
      const args = { input: {} };

      try {
        res = await dal.updateCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });
    it('should throw invalid_input, if validation is fail', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          name: 'folder name',
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };
      try {
        res = await dal.updateCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.folderId.message).to.equal(
        'Invalid folderId format. An id cannot be null.'
      );
      chaiExpect(res).to.be.undefined;
    });
    it('should throw invalid_input, if validation is fail', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          folderId: 111,
          name: 'folder name',
          folderDescription: 'description',
          image: true
        }
      };
      try {
        res = await dal.updateCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.image.message).to.equal('should be a String');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error, if update collection fail', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          name: 'errorName',
          folderId: 3232,
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };
      const _serviceContext = _.cloneDeep(serviceContext);
      const _dalCollection = require('./dalCollection.js')(_serviceContext);

      _serviceContext.dbConnections[
        'media_platform'
      ].write.query = async () => {
        throw new Error('error when update collection');
      };

      try {
        res = await _dalCollection.updateCollection(contextUser, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.message).to.equal('Failed to update collection');
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error not_found, if folderId is not exist in database', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          folderId: 1,
          name: 'folder name',
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([], false);

      try {
        res = await dal.updateCollection(contextUser, args);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.message).to.equal('Failed to update collection');
      chaiExpect(res).to.be.undefined;
    });

    it('should update collection', async function () {
      let res, err;
      const args = {
        input: {
          organizationId: 7682,
          folderId: 123,
          name: 'folder name',
          folderDescription: 'description',
          image: 'http://localhost'
        }
      };

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: 123
          }
        ],
        false
      );

      try {
        res = await dal.updateCollection(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.folderId).to.equal(123);
    });
  });
});
