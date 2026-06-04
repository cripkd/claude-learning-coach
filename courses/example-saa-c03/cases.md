# Case Patterns

> **Case mode:** pool-derived
>
> SAA-C03 doesn't enumerate named scenarios; questions cross two pools at runtime: a Use Case dimension and an Architecture dimension. The coach generates scenario-based MCQs by picking one item from each pool.

---

## Pool A: Use Cases

- High availability (Multi-AZ failover, RTO/RPO constraints)
- Disaster recovery (cross-region replication, pilot-light, warm standby)
- Cost optimization (Spot, Reserved Instances, Savings Plans, S3 lifecycle)
- Security & compliance (encryption, IAM least-privilege, audit logging)
- Performance (caching, CDN, autoscaling, instance sizing)
- Decoupling (queues, pub/sub, event-driven)

## Pool B: Architectures

- 3-tier web application (ALB → EC2 ASG → RDS)
- Serverless (API Gateway → Lambda → DynamoDB)
- Containerized microservices (ECS/EKS + service discovery)
- Data lake / analytics pipeline (S3 + Glue + Athena/Redshift)
- Media delivery (S3 + CloudFront + Lambda@Edge)
- Hybrid (Direct Connect + on-prem + VPC)

---

## Cross-rule

Each generated question picks **one** item from Pool A and **one** from Pool B. Example: *HA × serverless* → "How do you achieve multi-AZ resilience for a serverless API?" The trap is usually that "multi-AZ" doesn't apply the same way (Lambda is regional by default; the question hinges on understanding what "AZ" means for a serverless surface).

The coach should rotate through pool-cross combinations across the course rather than repeating the same crossing. Two unused-yet crossings as of Day 5: *Cost × hybrid* and *DR × media delivery*.
