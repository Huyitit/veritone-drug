'use strict';

var createModel = require('../util/create-model');
var embeddedModel = require('../util/embedded-model');
var embeddedModelArray = require('../util/embedded-model-array');

var Comment = require('../comment');
var Rating = require('../rating');

var MentionSnippet = require('./mention-snippet');
var MentionUserSnippet = require('./user-snippet');
var MentionAdCreative = require('./ad-creative');
var MentionFingerprint = require('./fingerprint');

var Mention = createModel({
  _postgresConfig: {
    schemaName: 'mention',
    tableName: 'mention',
    fields: {
      mention_id: 'mentionId'  
    },
    primaryKey: 'mention_id'
  },
  // String fields:
  mentionId: { type: 'string' },
  folderId: { type: 'string' },
  organizationId: {
    type: 'string',
    validate: { length: { minimum: 1 }, presence: true }
  },
  mediaSourceTypeId: { type: 'string', userEditable: true },
  mediaSourceId: { type: 'string', userEditable: true },
  programId: { type: 'string', userEditable: true },
  mediaId: { type: 'string', userEditable: true },
  advertiserId: { type: 'string', userEditable: true },
  brandId: { type: 'string', userEditable: true },
  campaignId: { type: 'string', userEditable: true },
  trackingUnitId: { type: 'string', userEditable: true },
  mentionStatusId: { type: 'string', userEditable: true },
  complianceStatusId: { type: 'string', userEditable: true },
  spotTypeId: { type: 'string', userEditable: true },
  organization: { type: 'string' },
  advertiser: { type: 'string' },
  brand: { type: 'string' },
  campaign: { type: 'string' },
  trackingUnit: { type: 'string' },
  mediaSourceType: { type: 'string' },
  mediaSource: { type: 'string' },
  programName: { type: 'string' },
  programImage: { type: 'string' },
  programFormatId: { type: 'string' },
  programLiveImage: { type: 'string' },
  programFormat: { type: 'string' },
  externalId: { type: 'string' },
  fileLocation: { type: 'string' },
  fileType: { type: 'string' },
  mentionStatus: { type: 'string' },
  spotType: { type: 'string' },
  description: { type: 'string' },
  // Number fields:
  audienceMarketCount: { type: 'number' },
  audienceAffiliateCount: { type: 'number' },
  mentionHitCount: { type: 'number' },
  audience: { type: 'number' },
  mentionRating: { type: 'number' },
  malePercent: { type: 'number' },
  femalePercent: { type: 'number' },
  age6to11Percent: { type: 'number' },
  age12to17Percent: { type: 'number' },
  age18to24Percent: { type: 'number' },
  age25to34Percent: { type: 'number' },
  age35to44Percent: { type: 'number' },
  age45to49Percent: { type: 'number' },
  age50to54Percent: { type: 'number' },
  age55to64Percent: { type: 'number' },
  age65PlusPercent: { type: 'number', dbKey: 'age_65plus_percent' },
  // Boolean fields:
  isMatch: { type: 'boolean', userEditable: true },
  isNational: { type: 'boolean' },
  // Date fields:
  mentionDate: { type: 'date', userEditable: true },
  mentionEndDate: { type: 'date', userEditable: true },
  mediaStartTime: { type: 'date' },
  previousStartTime: { type: 'date' },
  nextStopTime: { type: 'date' },
  // JSON fields:
  metadata: { type: 'json', userEditable: true },
  mentionSnippets: embeddedModelArray({
    model: MentionSnippet,
    modelName: 'MentionSnippet',
    userEditable: true
  }),
  userSnippets: embeddedModelArray({
    model: MentionUserSnippet,
    modelName: 'MentionUserSnippet',
    userEditable: true
  }),
  adCreative: embeddedModel({
    model: MentionAdCreative,
    modelName: 'MentionAdCreative',
    userEditable: true
  }),
  fingerprint: embeddedModel({
    model: MentionFingerprint,
    modelName: 'MentionFingerprint',
    userEditable: true
  }),
  cognitiveEngineResults: { type: 'json', userEditable: true },
  comments: embeddedModelArray({
    model: Comment,
    modelName: 'Comment',
    dbKey: 'mention_comments'
  }),
  ratings: embeddedModelArray({
    model: Rating,
    modelName: 'Rating',
    dbKey: 'mention_ratings'
  })
});

module.exports = Mention;
