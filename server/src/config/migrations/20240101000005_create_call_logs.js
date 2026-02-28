exports.up = function (knex) {
  return knex.schema.createTable('call_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.uuid('initiator_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['audio', 'video']).notNullable();
    table.enum('status', ['missed', 'answered', 'declined']).defaultTo('missed');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('ended_at');
    table.jsonb('participants').defaultTo('[]');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('call_logs');
};
