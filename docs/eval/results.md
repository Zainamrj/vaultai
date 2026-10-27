# Evaluation results

Run: 2026-10-27 | Answer model: `nvidia/nemotron-3-super-120b-a12b` | Judge: `nvidia/Nemotron-3-Ultra-550b-a55b` | Embeddings: `Qwen/Qwen3-Embedding-8B` (512 dims) | Top-k: 4

**9/10 questions passed.** Retrieval on answerable questions: right document first for 5/7, within the top 4 for 7/7. Estimated cost of the whole run: about $0.0323.

Average time per question: 12403 ms in total (embed 8136 ms, answer 2502 ms, judge 1763 ms).

| Type | Passed |
|---|---|
| answerable | 7/7 |
| unanswerable | 1/1 |
| extraction | 1/1 |
| ambiguous | 0/1 |

| ID | Type | Result | Top-1 doc | In top-4 | Judge | Answer (ms) | Judge (ms) | Answer |
|---|---|---|---|---|---|---|---|---|
| q1 | answerable | pass | yes | yes | verified (5) | 4127 | 1718 | £569.00 [3] |
| q2 | answerable | pass | yes | yes | verified (5) | 3927 | 1637 | £455.20 [3] |
| q3 | answerable | pass | yes | yes | verified (5) | 1477 | 1332 | Each installment is £56.90 and there are 2 installments. [2] |
| q4 | answerable | pass | no | yes | verified (5) | 3840 | 1688 | The new metformin dose is 1000 mg taken twice daily. [2] |
| q5 | answerable | pass | no | yes | verified (5) | 1948 | 1332 | Amlodipine 5 mg once daily was added to improve blood pressure control【2】. |
| q6 | answerable | pass | yes | yes | verified (5) | 872 | 1684 | The HbA1c result at the visit was 8.4 %.[1] |
| q7 | answerable | pass | yes | yes | verified (5) | 1736 | 1987 | Penicillin [2][3] |
| q8 | unanswerable | pass | no | yes | verified (5) | 1175 | 1384 | I do not have enough information. |
| q9 | extraction | pass | no | yes | verified (5) | 2456 | 3688 | [SSN_1] [EMAIL_1] |
| q10 | ambiguous | FAIL | no | yes | unverified (1) | 3459 | 1184 | I do not have enough information. |

Checks: every `mustContain` string must appear in the answer; no `mustNotContain` string may appear. Documents and questions are synthetic.
