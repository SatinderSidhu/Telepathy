exports.up = function (knex) {
  return knex.schema.createTable('messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.uuid('sender_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('content');
    table.enum('type', ['text', 'image', 'file', 'voice']).defaultTo('text');
    table.string('file_url', 500);
    table.jsonb('read_by').defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index(['conversation_id', 'created_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('messages');
};
