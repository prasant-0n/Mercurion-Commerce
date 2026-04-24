# Infrastructure

This directory holds local-development and deployment infrastructure assets.

## Local stack

The local dependency stack lives at `infra/docker/compose.yml`.

Services:

- PostgreSQL 16
- MongoDB 8 replica set
- Redis 7
- RabbitMQ 3 with management UI
- OpenSearch 2 single node

Useful commands:

```bash
npm run infra:up
npm run infra:logs
npm run infra:down
```

Default local ports:

- PostgreSQL: `5432`
- MongoDB: `27017`
- Redis: `6379`
- RabbitMQ AMQP: `5672`
- RabbitMQ Management: `15672`
- OpenSearch HTTP: `9200`
