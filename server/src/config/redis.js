const { createClient } = require('redis');

const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

async function connectRedis() {
  await redisClient.connect();
}

module.exports = { redisClient, connectRedis };
