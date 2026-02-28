exports.up = function (knex) {
  return knex.schema
    .createTable('conversations', (table) => {
      table.uuid('id').primary().defaultTo(knex.fn.uuid());
      table.enum('type', ['direct', 'group']).notNullable().defaultTo('direct');
      table.string('name', 100);
      table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('conversation_members', (table) => {
      table.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('joined_at').defaultTo(knex.fn.now());
      table.primary(['conversation_id', 'user_id']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('conversation_members')
    .dropTableIfExists('conversations');
};
