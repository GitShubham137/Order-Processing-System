const { Kafka, logLevel } = require('kafkajs');
const logger = require('./logger');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'order-processing-system',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  logLevel: logLevel.WARN,
});

// ─── Producer ───────────────────────────────────────────────────────────────
let producer = null;

const getProducer = async () => {
  if (producer) return producer;
  producer = kafka.producer();
  await producer.connect();
  logger.info('Kafka producer connected');
  return producer;
};

const publishEvent = async (topic, message) => {
  const p = await getProducer();
  await p.send({
    topic,
    messages: [
      {
        key: message.id || String(Date.now()),
        value: JSON.stringify(message),
      },
    ],
  });
  logger.debug(`Event published to topic "${topic}"`, { eventType: message.type });
};

// ─── Consumer ───────────────────────────────────────────────────────────────
const createConsumer = (groupId) => {
  return kafka.consumer({ groupId });
};

/**
 * Subscribe and process messages from a Kafka topic.
 * @param {string} groupId   - Kafka consumer group ID
 * @param {string[]} topics  - Topics to subscribe to
 * @param {Function} handler - async (topic, message) => void
 */
const consumeEvents = async (groupId, topics, handler) => {
  const consumer = createConsumer(groupId);
  await consumer.connect();

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  logger.info(`Kafka consumer subscribed`, { groupId, topics });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const parsed = JSON.parse(message.value.toString());
        await handler(topic, parsed);
      } catch (err) {
        logger.error('Error processing Kafka message', { topic, err: err.message });
      }
    },
  });

  return consumer;
};

// ─── Graceful shutdown ───────────────────────────────────────────────────────
const disconnectProducer = async () => {
  if (producer) {
    await producer.disconnect();
    logger.info('Kafka producer disconnected');
  }
};

module.exports = {
  kafka,
  getProducer,
  publishEvent,
  createConsumer,
  consumeEvents,
  disconnectProducer,
};