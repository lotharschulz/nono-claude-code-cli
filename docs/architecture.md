# System architecture

## Overview

This service ingests user-uploaded files, processes them asynchronously, and stores results in S3. The API layer is a Node.js/Express app. Workers are long-running processes that pull jobs from an SQS queue.

```
┌─────────────┐     POST /upload      ┌─────────────┐
│   Client    │ ───────────────────▶  │  API server │
└─────────────┘                       └──────┬──────┘
                                             │ enqueue job
                                             ▼
                                      ┌─────────────┐
                                      │  SQS queue  │
                                      └──────┬──────┘
                                             │ poll
                                             ▼
                                      ┌─────────────┐     put object
                                      │   Worker    │ ──────────────▶  S3
                                      └─────────────┘
```

## Components

### API server

- **Runtime:** Node.js 20, Express 4
- **Port:** 3000
- **Responsibilities:** validate uploads, write job metadata to DynamoDB, enqueue to SQS, return a `jobId` to the caller
- **Does not** interact with S3 directly — all object storage goes through the worker

### Worker

- **Runtime:** Node.js 20
- **Concurrency:** 4 workers per host, each polling SQS independently
- **Responsibilities:** download the raw upload from the staging prefix, process it, write the result object to the results prefix, update job status in DynamoDB

### Storage layout (S3)

All objects live in a single bucket. The bucket name is supplied via `S3_BUCKET_NAME` at runtime.

| Prefix | Contents | Written by |
|---|---|---|
| `uploads/raw/{jobId}` | Original user upload | API server |
| `uploads/processed/{jobId}` | Worker output | Worker |
| `uploads/failed/{jobId}` | Error payload if processing fails | Worker |

Object keys use the `jobId` (UUID v4) as the leaf segment. No sub-prefixes within a job.

### DynamoDB

Single table: `jobs`. Partition key: `jobId` (string). Sort key: none.

| Attribute | Type | Description |
|---|---|---|
| `jobId` | S | UUID v4 |
| `status` | S | `pending` / `processing` / `done` / `failed` |
| `createdAt` | N | Unix timestamp (ms) |
| `updatedAt` | N | Unix timestamp (ms) |
| `s3Key` | S | Full S3 key of the result object (set on completion) |
| `errorMessage` | S | Set on failure |

## Configuration

All runtime configuration is supplied via environment variables. No config files are committed to the repo.

| Variable | Required | Description |
|---|---|---|
| `AWS_REGION` | yes | AWS region for all SDK clients (e.g. `eu-west-1`) |
| `AWS_ACCESS_KEY_ID` | yes | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | yes | IAM secret key |
| `S3_BUCKET_NAME` | yes | Target bucket (no `s3://` prefix) |
| `SQS_QUEUE_URL` | yes | Full SQS queue URL |
| `DYNAMODB_TABLE` | yes | DynamoDB table name (default: `jobs`) |
| `PORT` | no | API server port (default: `3000`) |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error` (default: `info`) |

Credentials are **never** read from `~/.aws/credentials` in production. The deployment (ECS task role / EC2 instance profile) provides them via the instance metadata service. For local development, export the variables in your shell or use a `.env` file that is git-ignored.

## AWS IAM permissions

The service requires a single IAM role with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:SendMessage"],
      "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:YOUR_QUEUE_NAME"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/jobs"
    }
  ]
}
```

## Error handling

- If a worker fails to process a job it writes an error payload to `uploads/failed/{jobId}` and sets `status: failed` in DynamoDB.
- SQS visibility timeout is 30 seconds. A job that does not complete within that window becomes visible again and will be retried by another worker.
- After 3 delivery attempts SQS moves the message to the dead-letter queue (`{queue-name}-dlq`).

## Local development

```bash
# Install dependencies
npm install

# Copy the example env file and fill in your values
cp .env.example .env

# Start the API server
npm run dev:api

# Start a single worker
npm run dev:worker
```

The `.env.example` file lists all required variables with placeholder values. Do not commit real credentials.
