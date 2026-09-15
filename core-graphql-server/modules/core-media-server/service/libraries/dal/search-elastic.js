const EventEmitter = require('events');

class ElasticIndexRequestEmmiter extends EventEmitter {}

function init(config, libraryDal) {
  const indexEventEmitter = new ElasticIndexRequestEmmiter();
  const es = require('./../../../../../util/elastic.js')(config).client;
  function buildElasticDocument(entity, library) {
    return {
      entityId: entity.entityId,
      entityName: entity.name,
      libraryId: library.libraryId,
      libraryName: library.name,
      libraryCoverImageUrl: library.coverImageUrl
        ? library.coverImageUrl.toString()
        : null,
      organizationId: library.ownerOrgId,
      profileImageUrl: entity.profileImageUrl
        ? entity.profileImageUrl.toString()
        : null,
      created: (entity.createdDateTime || new Date()).valueOf(),
      modified: (entity.modifiedDateTime || new Date()).valueOf(),
      identifierType: library.libraryType.entityIdentifierTypes.map(
        eit => eit.entityIdentifierTypeId
      )
    };
  }

  function indexEntity(entity, callback) {
    libraryDal
      .getLibraries({ libraryId: entity.libraryId })
      .then(function resolve(libraryResults) {
        if (libraryResults.totalResults === 1) {
          es.index(
            {
              index: config.elastic.indexName,
              type: config.elastic.indexType,
              id: entity.entityId,
              body: buildElasticDocument(entity, libraryResults.results[0])
            },
            function onInsert(err) {
              if (callback) {
                callback(err);
              }
            }
          );
        } else {
          if (callback) {
            callback(new Error('missing library: ' + entity.libraryId));
          }
        }
      });
  }

  function deleteEntity(entityId, callback) {
    es.delete(
      {
        index: config.elastic.indexName,
        type: config.elastic.indexType,
        id: entityId
      },
      function onDelete(err) {
        if (callback) {
          callback(err);
        }
      }
    );
  }

  function deleteEntityByLibrary(libraryId, callback) {
    es.deleteByQuery(
      {
        index: config.elastic.indexName,
        type: config.elastic.indexType,
        body: {
          query: {
            term: { libraryId: libraryId }
          }
        }
      },
      function onDelete(err) {
        if (callback) {
          callback(err);
        }
      }
    );
  }

  function bulkDeleteEntities(entities, callback) {
    let body = entities.map(function mapToCommand(entity) {
      return {
        delete: {
          _index: config.elastic.indexName,
          _id: entity.entityId
        }
      };
    });

    es.bulk({ body }, callback);
  }

  function bulkUpdateEntities(entities, callback) {
    let body = [];

    for (let i in entities) {
      const entity = entities[i];
      const entityDoc = buildElasticDocument(entity, entity.library);

      body.push({
        index: {
          _index: config.elastic.indexName,
          _id: entity.entityId
        }
      });

      body.push(entityDoc);
    }

    es.bulk({ body }, callback);
  }

  function updateEntityLibrary(library, callback) {
    if (!library.name || !library.libraryId) {
      if (callback) {
        callback(new Error('invalid Library'));
      }
      return;
    }
    let total = 0;
    es.search(
      {
        index: config.elastic.indexName,
        type: config.elastic.indexType,
        scroll: '30s',
        source: false,
        body: {
          query: {
            term: { libraryId: library.libraryId }
          }
        }
      },
      function getMoreUntilDone(error, response) {
        if (error) {
          return;
        }

        let batch = [];
        response.body.hits.hits.forEach(function eachEntity(hit) {
          batch.push({
            update: {
              _index: config.elastic.indexName,
              _id: hit._id
            }
          });
          batch.push({
            doc: {
              libraryName: library.name
            }
          });
        });

        if (batch.length > 0) {
          es.bulk({ body: batch }, function onUpdate(err) {
            if (err) {
              console.error(err);
            }
          });
        }

        total += batch.length / 2;
        if (batch.length && response.body.hits.total > total) {
          es.scroll(
            {
              scrollId: response._scroll_id,
              scroll: '30s'
            },
            getMoreUntilDone
          );
        }
        if (callback) {
          callback();
        }
      }
    );
  }

  if (libraryDal) {
    indexEventEmitter.on('createEntity', indexEntity);
  }

  indexEventEmitter.on('deleteEntity', deleteEntity);
  indexEventEmitter.on('deleteLibraryEntities', deleteEntityByLibrary);
  indexEventEmitter.on('updateLibrary', updateEntityLibrary);

  indexEventEmitter.sync = {
    _indexEntity: libraryDal ? indexEntity : undefined,
    _deleteEntity: deleteEntity,
    _deleteLibraryEntities: deleteEntityByLibrary,
    _updateEntityLibrary: updateEntityLibrary,
    _buildElasticDocument: buildElasticDocument,
    _bulkDeleteEntities: bulkDeleteEntities,
    _bulkUpdateEntities: bulkUpdateEntities
  };

  return indexEventEmitter;
}

module.exports = {
  init: init
};
