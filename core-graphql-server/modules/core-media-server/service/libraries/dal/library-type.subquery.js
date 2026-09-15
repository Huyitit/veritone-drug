'use strict';

module.exports = function init(schemaName) {
  if (!schemaName) {
    throw new Error('schemaName is required');
  }

  return `
		SELECT
			s.library_type_id,
			jsonb_agg(s.entity_identifier_type_id) AS entity_identifier_type_ids,
			jsonb_agg(s.entity_identifier_type_link) AS entity_identifier_types
		FROM (
			SELECT
				library_type_id,
				entity_identifier_type_id,
				json_build_object('entity_identifier_type_id', entity_identifier_type_id, 'min_items', min_items, 'max_items', max_items) AS entity_identifier_type_link
			FROM ${schemaName}.library_type__entity_identifier_type
		) s
		GROUP BY s.library_type_id`;
};
