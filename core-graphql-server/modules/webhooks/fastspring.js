const _ = require('lodash');
const { v4 } = require('uuid');
const crypto = require('crypto');

module.exports = class Fastspring {
  constructor(serviceContext) {
    this.serviceContext = serviceContext;
    this.handleEvents = this.handleEvents.bind(this);
  }

  isValidSignature(req, secret) {
    if (req.rawBody === undefined) {
      return false;
    }
    const fsSignature = req.headers['x-fs-signature'];
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest()
      .toString('base64');
    return fsSignature === computedSignature;
  }

  async handleOrderCompleted(event) {
    const orgId = event.data.tags.orgId;
    const subscriptionId = event.data.items[0].subscription;
    const mediaLimit = _.get(event, 'data.items[0].attributes.mediaLimit');
    const period = _.get(event, 'data.items[0].attributes.period');
    const allowMediaOverage =
      _.get(event, 'data.items[0].attributes.allowMediaOverage') === 'true';

    const org = await this.serviceContext.dal.organization.getOrganization(
      {
        /* fake/mock context works for now */
      },
      {
        id: orgId
      }
    );

    // Check if org profile is sss-redact-* if not then don't process
    const accProfile = _.get(org, 'kvp.accountProfile');
    if (accProfile.indexOf('sss-redact') === -1) {
      return false;
    }

    const sql = `UPDATE organization
      SET kvp = $1
      WHERE organization_id = $2
      RETURNING organization_id, kvp, date_created`;
    const args = [
      _.merge(org.kvp, {
        features: {
          mediaLengthLimitMs: parseInt(mediaLimit),
          allowMediaOverage: allowMediaOverage
        },
        accountProfile: 'sss-redact-business',
        billing: {
          type: period
        }
      }),
      orgId
    ];

    try {
      const updatedOrg = await this.serviceContext.dbConnections[
        'media_platform'
      ].write.query(sql, args);
      // check successful update
      return updatedOrg[0]['organization_id'] === orgId;
    } catch (err) {
      return false;
    }
  }

  handleEvents(req, res) {
    // Only check for unprocessed events with an orgId tag of type 'subscription'ç
    // if (!this.isValidSignature(req, 'veritone-self-service')) {
    //   return res.status(403).send('Key mismatch');
    // }

    if (_.isEmpty(req.body)) {
      return res.status(400).send('No body detected');
    }

    const events = _.filter(
      req.body.events,
      (event) =>
        !event.processed &&
        _.get(event, 'data.tags.orgId') &&
        _.get(event, 'data.items[0].attributes.type') === 'subscription'
    );

    if (events.length < 1) {
      return res
        .status(400)
        .send(
          'No processable events found. Please make sure all events contain the appropriate fields.'
        );
    }

    const processedIds = [];
    _.forEach(events, (event) => {
      switch (event.type) {
        case 'order.completed':
          // Process order, if successful return true and add to list of returned ids
          if (this.handleOrderCompleted(event)) {
            processedIds.push(event.id);
          }
          return;

        // case 'subscription.updated':
        // case 'subscription.canceled':

        default:
          return;
      }
    });
    // return 202 w/ individual ids to confirm processing
    return res.status(202).send(processedIds.join(String.fromCharCode(10)));
  }
};
