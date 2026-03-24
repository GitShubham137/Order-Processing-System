module.exports = {
  logger: require('./logger'),
  kafkaClient: require('./kafkaClient'),
  redisClient: require('./redisClient'),
  errorHandler: require('./errorHandler'),
  topics: require('./topics'),
};