exports.up = function (knex) {
  return knex.schema.createTable('contacts', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('contact_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('status', ['pending', 'accepted', 'blocked']).defaultTo('pending');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['user_id', 'contact_id']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('contacts');
};
