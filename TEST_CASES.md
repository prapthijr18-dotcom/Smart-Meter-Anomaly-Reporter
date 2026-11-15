# Test Cases (15 minimum)

| # | Input / Scenario | Expected result |
|---|---|---|
| 1 | `GRIDA123R`, `12345.67kWh`, "seal broken" | Accepted; Tampering; section A |
| 2 | `GRID123R` | Rejected: malformed meter ID |
| 3 | `GRIDA12R` | Rejected: incomplete meter ID |
| 4 | `GRIDA123X` | Rejected: unsupported phase |
| 5 | `GRIDA123R`, `1234.67kWh` | Rejected: reading must have five integer digits |
| 6 | `GRIDA123R`, `12345.6kWh` | Rejected: reading must have two decimal digits |
| 7 | `GRIDA123R`, `12345.67kWh`, "power outage" | Accepted; Outage |
| 8 | `GRIDB123Y`, valid reading, "high usage spike" | Accepted; Overconsumption; section B |
| 9 | `GRIDC123B`, valid reading, "display is blank" | Accepted; Hardware |
| 10 | `GRIDD123R`, valid reading, "meter communication offline" | Accepted; Communication |
| 11 | Description contains "seal broken" and "outage" | Tampering wins by documented precedence |
| 12 | Unknown grid section `GRIDZ123R` | Rejected: only grid sections A-E are configured |
| 13 | Section A crew unavailable | Dispatch to nearest available section |
| 14 | Section A has six open cases | Overflow to nearest eligible crew |
| 15 | All crews unavailable/full | Report remains Pending in central queue |
| 16 | Urgency Emergency | Priority becomes Critical and is escalated in queue ordering |
| 17 | Submit same report creation request twice | Each accepted submission has its own report ID; dispatch retry on same document does not duplicate assignment |
| 18 | Update status to In Progress then Resolved | Status persists in MongoDB |
| 19 | Restart API after report creation | Report remains stored in MongoDB; dispatch audit remains in SQLite |
| 20 | Two simultaneous submissions | MongoDB creates distinct reports; crew assignment is capacity-checked (for strict concurrency locking, add a transaction/lock before production use) |
