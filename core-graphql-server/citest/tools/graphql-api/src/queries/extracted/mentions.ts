import { gql } from 'graphql-request';

// Mentions and watchlist management operations

export const CREATE_WATCHLIST = gql`
  mutation createWatchlist($input: CreateWatchlist!) {
    createWatchlist(input: $input) {
      id
      name
      searchIndex
      startDateTime
      stopDateTime
      sourceTypeIds
      sourceIds
      treeObjectId
      details
      query
      subscriptions {
        id
      }
      folders {
        id
      }
      cognitiveSearches {
        id
        query
        mentionStatusId
        mentionStatus {
          id
          name
        }
        profile
      }
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_WATCHLIST = gql`
  query watchlist($id: ID!) {
    watchlist(id: $id) {
      id
      name
      searchIndex
      startDateTime
      stopDateTime
      sourceTypeIds
      cognitiveSearches {
        mentionStatusId
      }
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_WATCHLISTS = gql`
  query watchlists($offset: Int, $limit: Int, $name: String) {
    watchlists(offset: $offset, limit: $limit, name: $name) {
      records {
        id
        name
        searchIndex
        startDateTime
        stopDateTime
        sourceTypeIds
        cognitiveSearches {
          mentionStatusId
        }
        createdDateTime
        modifiedDateTime
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_WATCHLIST = gql`
  mutation updateWatchlist($input: UpdateWatchlist!) {
    updateWatchlist(input: $input) {
      id
      sourceIds
      details
      searchIndex
      name
      searchIndex
      startDateTime
      stopDateTime
      sourceTypeIds
      modifiedDateTime
      createdDateTime
      isDisabled
      subscriptions {
        id
        contact {
          emailAddress
          phoneNumber
          webhookUri
        }
      }
      cognitiveSearches {
        id
      }
    }
  }
`;

export const BULK_UPDATE_WATCHLIST = gql`
  mutation bulkUpdateWatchlist(
    $input: BulkUpdateWatchlist
    $filter: BulkUpdateWatchlistFilter!
  ) {
    bulkUpdateWatchlist(input: $input, filter: $filter) {
      limit
      count
      records {
        id
        name
        organizationId
        stopDateTime
        startDateTime
      }
    }
  }
`;

export const DELETE_WATCHLIST = gql`
  mutation deleteWatchlist($id: ID!) {
    deleteWatchlist(id: $id) {
      id
      message
    }
  }
`;

export const CREATE_MENTIONS = gql`
  mutation createMentions($input: CreateMentions!) {
    createMentions(input: $input) {
      records {
        id
        mentionDate
        organizationId
        brandId
        campaignId
        spotTypeId
        audienceMarketCount
        cognitiveEngineResults
        watchlistId
        mediaId
        mentionHitCount
        hitStartDateTime
        hitEndDateTime
        mentionSnippets {
          text
          startTime
          endTime
        }
      }
      count
    }
  }
`;

export const GET_MENTION = gql`
  query mention($mentionId: ID!) {
    mention(mentionId: $mentionId) {
      id
      mentionDate
      organizationId
      brandId
      campaignId
      spotTypeId
      audienceMarketCount
      cognitiveEngineResults
      watchlistId
      mediaId
      mentionHitCount
      hitStartDateTime
      hitEndDateTime
      mentionSnippets {
        text
        startTime
        endTime
      }
      createdDateTime
      modifiedDateTime
      comments {
        count
        records {
          userId
          userImage
          firstName
          lastName
        }
      }
    }
  }
`;

export const GET_MENTIONS = gql`
  query mentions(
    $offset: Int
    $limit: Int
    $watchlistId: ID
    $folderId: ID
    $orderBy: [MentionOrderBy!]
    $dateTimeFilter: [MentionDateTimeFilter!]
  ) {
    mentions(
      offset: $offset
      limit: $limit
      watchlistId: $watchlistId
      folderId: $folderId
      orderBy: $orderBy
      dateTimeFilter: $dateTimeFilter
    ) {
      records {
        id
        mentionDate
        organizationId
        brandId
        campaignId
        spotTypeId
        audienceMarketCount
        watchlistId
        mediaId
        mentionHitCount
        hitStartDateTime
        hitEndDateTime
        mentionSnippets {
          text
          startTime
          endTime
        }
        cognitiveEngineResults
        scheduleId
        sourceId
        sourceTypeId
        statusId
      }
      count
      offset
      limit
    }
  }
`;

export const CREATE_MENTION = gql`
  mutation createMention($input: CreateMention!) {
    createMention(input: $input) {
      id
      mentionDate
      organizationId
      brandId
      campaignId
      spotTypeId
      audienceMarketCount
      cognitiveEngineResults
      mentionSnippets {
        text
        startTime
        endTime
        hits {
          endTime
          startTime
          queryTerm
        }
      }
      watchlistId
      statusId
      mentionHitCount
      mediaId
      scheduleId
      scheduledJob {
        id
      }
    }
  }
`;

export const UPDATE_MENTION = gql`
  mutation updateMention($input: UpdateMention!) {
    updateMention(input: $input) {
      id
      mentionDate
      organizationId
      modifiedDateTime
      adCreative
      complianceStatusId
      privateNote
      publicNote
      spotTypeId
      statusId
      userSnippets {
        startTime
        endTime
        text
        transcriptStartDate
        transcriptEndDate
        snippets {
          text
          startTime
          endTime
        }
      }
    }
  }
`;

export const UPDATE_MENTIONS = gql`
  mutation updateMentions($input: UpdateMentions!) {
    updateMentions(input: $input) {
      id
      statusId
      userSnippets {
        startTime
        endTime
        text
        transcriptStartDate
        transcriptEndDate
        snippets {
          text
          startTime
          endTime
        }
      }
    }
  }
`;

export const CREATE_MENTION_COMMENT = gql`
  mutation createMentionComment($input: CreateMentionComment) {
    createMentionComment(input: $input) {
      userId
      userImage
      firstName
      lastName
      commentText
      commentId
    }
  }
`;

export const SHARE_MENTION = gql`
  mutation shareMention($input: ShareMention) {
    shareMention(input: $input) {
      id
      recipients
      shareMessage
      shareOptionsJson
      folderId
      mentionId
      mediaShare {
        token
        isSegmented
      }
    }
  }
`;

export const SHARE_MENTION_IN_BULK = gql`
  mutation shareMentionInBulk($input: ShareMentionInBulk) {
    shareMentionInBulk(input: $input) {
      id
      mentionId
      mediaShare {
        token
      }
    }
  }
`;

export const GET_SHARED_MENTION = gql`
  query sharedMention($shareId: ID!) {
    sharedMention(shareId: $shareId) {
      id
      organizationId
      sourceTypeId
      sourceId
      scheduledJobId
      scheduledJob
      mediaId
      advertiserId
      brandId
      campaignId
      watchlistId
      organization
      share {
        id
      }
    }
  }
`;

export const CREATE_COLLECTION = gql`
  mutation createCollection($input: CreateCollection) {
    createCollection(input: $input) {
      id
      name
      imageUrl
      signedImageUrl
    }
  }
`;

export const CREATE_COLLECTION_MENTION = gql`
  mutation createCollectionMention($input: CollectionMentionInput) {
    createCollectionMention(input: $input) {
      folderId
      mentionId
    }
  }
`;

export const DELETE_COLLECTION = gql`
  mutation deleteCollection($id: ID) {
    deleteCollection(id: $id) {
      id
      message
    }
  }
`;

export const UPDATE_MENTION_RATING = gql`
  mutation updateMentionRating($input: UpdateMentionRating!) {
    updateMentionRating(input: $input) {
      mentionId
      ratingId
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const CREATE_MENTION_EXPORT_REQUEST = gql`
  mutation createMentionExportRequest($input: CreateMentionExportRequest!) {
    createMentionExportRequest(input: $input) {
      id
      status
      requestorId
      createdDateTime
    }
  }
`;

export const GET_EXPORT_REQUESTS = gql`
  query exportRequests(
    $id: ID
    $offset: Int
    $limit: Int
    $status: [ExportRequestStatus!]
    $event: ExportRequestEvent
  ) {
    exportRequests(
      id: $id
      offset: $offset
      limit: $limit
      status: $status
      event: $event
    ) {
      records {
        id
        status
        organizationId
        createdDateTime
        modifiedDateTime
        requestorId
        assetUri
      }
      count
      offset
      limit
    }
  }
`;

export const GET_EXPORT_REQUEST = gql`
  query exportRequest($id: ID!, $event: ExportRequestEvent) {
    exportRequest(id: $id, event: $event) {
      id
      status
      organizationId
      createdDateTime
      modifiedDateTime
      requestorId
      assetUri
    }
  }
`;

export const UPDATE_MENTION_EXPORT_REQUEST = gql`
  mutation updateMentionExportRequest($input: UpdateMentionExportRequest!) {
    updateMentionExportRequest(input: $input) {
      id
      status
      organizationId
      createdDateTime
      modifiedDateTime
      requestorId
      assetUri
    }
  }
`;

export const MENTION_STATUS_OPTION = gql`
  query mentionStatusOptions {
    mentionStatusOptions {
      id
      name
    }
  }
`;

// Notification mailbox operations

export const CREATE_NOTIFICATION_MAILBOX = gql`
  mutation notificationMailboxCreate($input: NotificationMailboxInput) {
    notificationMailboxCreate(input: $input) {
      id
      name
      paused
      lastReceiptDateTime
      latestUpdateDate
      totalCount
      unreadCount
      eventFilter {
        eventNames
        eventType
        applicationId
      }
      details
    }
  }
`;

export const GET_NOTIFICATION_MAILBOXES = gql`
  query notificationMailboxes($ids: [ID!], $name: String) {
    notificationMailboxes(ids: $ids, name: $name) {
      id
      name
      notifications {
        count
        records {
          id
          title
          body
          contentType
          flags
          createdDateTime
          updatedDateTime
          applicationId
          eventName
          eventType
        }
      }
      eventFilter {
        eventNames
        eventType
        applicationId
        conditions
      }
      notificationTemplate
      details
      paused
      lastReceiptDateTime
      latestUpdateDate
      totalCount
      unreadCount
      limit
      unseenCount
    }
  }
`;

export const POST_NOTIFICATION = gql`
  mutation notificationPost($input: NotificaionPostInput) {
    notificationPost(input: $input) {
      id
      title
      body
      contentType
      flags
      applicationId
      eventName
      eventType
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation markAllNotificationsRead($mailboxIds: [ID]!) {
    markAllNotificationsRead(mailboxIds: $mailboxIds) {
      id
      unreadCount
      notifications {
        count
      }
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_SEEN = gql`
  mutation markAllNotificationsSeen($mailboxIds: [ID]!) {
    markAllNotificationsSeen(mailboxIds: $mailboxIds) {
      id
      unseenCount
      notifications {
        count
      }
    }
  }
`;

export const PAUSE_NOTIFICATION_MAILBOX = gql`
  mutation notificationMailboxPause($id: ID!) {
    notificationMailboxPause(id: $id) {
      id
      paused
    }
  }
`;

export const DELETE_NOTIFICATION_MAILBOX = gql`
  mutation notificationMailboxDelete($id: ID!) {
    notificationMailboxDelete(id: $id) {
      id
      message
    }
  }
`;
