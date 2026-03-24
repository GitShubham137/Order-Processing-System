const TOPICS = {
  ORDER_CREATED: 'order.created',
  PAYMENT_PROCESSED: 'payment.processed',
  PAYMENT_FAILED: 'payment.failed',
  INVENTORY_UPDATED: 'inventory.updated',
  INVENTORY_INSUFFICIENT: 'inventory.insufficient',
  NOTIFICATION_SEND: 'notification.send',
};

const CONSUMER_GROUPS = {
  PAYMENT_SERVICE: 'payment-service-group',
  INVENTORY_SERVICE: 'inventory-service-group',
  NOTIFICATION_SERVICE: 'notification-service-group',
  ORDER_SERVICE: 'order-service-group',
};

module.exports = { TOPICS, CONSUMER_GROUPS };