exports.up = function(knex) {
  return knex.schema.table('messages', (table) => {
    // JSON array to store user IDs who deleted this message
    table.jsonb('deleted_for').defaultTo('[]');
    // If true, message is deleted for everyone
    table.boolean('deleted_for_everyone').defaultTo(false);
  });
};

exports.down = function(knex) {
  return knex.schema.table('messages', (table) => {
    table.dropColumn('deleted_for');
    table.dropColumn('deleted_for_everyone');
  });
};
