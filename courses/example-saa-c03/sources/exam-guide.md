# Official SAA-C03 Exam Guide (synthetic placeholder)

> This file is a **synthetic placeholder** for the worked-example course. It does not contain real AWS exam guide content. A real course would replace this with the official AWS Exam Guide for SAA-C03 (typically a PDF converted to markdown).
>
> The coach treats this file as the **primary** source — when sources disagree on a fact, this wins. In the fixture this rule is illustrative only; no real facts live here.

---

## Domain coverage (illustrative)

The real exam guide enumerates four domains with task statements. The example course uses the following synthetic shape (also reflected in `data/state.json` `domains[].taskStatements`):

| Domain | Weight | Task Statements |
|---|---|---|
| D1 — Design Secure Architectures | 30% | IAM core; Data protection (KMS); Network security (VPC/SG/NACL/WAF) |
| D2 — Design Resilient Architectures | 26% | High availability; Decoupling (SQS/SNS/EventBridge) |
| D3 — Design High-Performing Architectures | 24% | Caching and compute (ElastiCache, CloudFront, EC2 sizing) |
| D4 — Design Cost-Optimized Architectures | 20% | Storage and compute cost (S3 tiers, Spot/RI/SP) |

A real exam guide also describes the question format (4 options, single-correct), scoring model (scaled 100–1000, ~720 passing), and any non-scenario question types. The example fixture uses `fixed_percent` scoring with a 72% cut for simplicity.
