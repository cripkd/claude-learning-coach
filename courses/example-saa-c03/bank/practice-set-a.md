# Practice Set A (worked-example bank)

> Two verbatim practice questions, illustrative format only. A real bank would hold dozens to hundreds of questions from declared sources (vendor packs, course packs, official sample sets).
>
> Format spec: `templates/question-bank.md`.

---

## Q-001 [domain: D1]

A startup stores customer PII in an S3 bucket. Compliance requires that the data remain encrypted at rest with keys the company controls and that access is restricted to a single application IAM role running on EC2. Which combination of services BEST meets these requirements?

A. S3 Default Encryption with AWS-managed keys (SSE-S3) + bucket policy restricting the application role
B. S3 Default Encryption with a KMS Customer-Managed Key (CMK) + IAM role policy granting `s3:GetObject` and `kms:Decrypt`
C. S3 Object Lock in Compliance mode + ACLs restricting `READ` to the application role
D. CloudHSM-backed envelope encryption + VPC Endpoint policy restricting the source subnet

**Correct:** B

**Source:** Worked-example fixture

**Explanation:** Customer-controlled keys requires a KMS Customer-Managed Key (CMK), not SSE-S3 (AWS owns those keys). Access scoped to one IAM identity is naturally expressed as a role policy on the calling principal, which also needs `kms:Decrypt` to use the CMK. Object Lock is for retention/immutability, not access control. CloudHSM is over-engineered for "company-controlled keys" — KMS CMKs satisfy that constraint and are the SAA-C03 default answer for it.

---

## Q-002 [domain: D2]

A media-processing application receives upload events from external partners. Each partner has a contractual SLA that requires strict per-partner processing order and exactly-once handling for any single upload. Combined throughput across all partners is ~2,500 events/second. Which queue choice BEST fits?

A. One SQS Standard queue with a partner_id attribute used by consumers to sort messages
B. One SQS FIFO queue with `MessageGroupId = partner_id`
C. One Kinesis Data Stream with `partitionKey = partner_id`
D. One SNS topic with a per-partner subscription filter

**Correct:** B

**Source:** Worked-example fixture

**Explanation:** Strict per-partner ordering plus exactly-once handling requires SQS FIFO with `MessageGroupId = partner_id` — FIFO guarantees in-order delivery and dedup within a group. Standard provides at-least-once + best-effort ordering, so sorting in the consumer cannot rebuild strict order across redelivers. Kinesis preserves order per shard via `partitionKey`, but its delivery is at-least-once unless you add EFO + idempotent consumers — more moving parts for the same goal. SNS doesn't queue or order events. The 2,500 events/s figure is below FIFO's ~3,000 msg/s per group ceiling only if grouped per partner (the limit is per group, not aggregate).
