# Evaluation results

Run: 2026-10-28 | Answer model: `nvidia/nemotron-3-super-120b-a12b` | Judge: `nvidia/Nemotron-3-Ultra-550b-a55b` | Embeddings: `Qwen/Qwen3-Embedding-8B` (512 dims) | Top-k: 4

**10/10 questions passed.** Retrieval on answerable questions: right document first for 7/7, within the top 4 for 7/7. Estimated cost of the whole run: about $0.0546.

**Judge check:** 7/7 deliberately wrong answers were flagged (not marked verified); 7/7 correct answers were marked verified.

Average time per question: 5262 ms in total (embed 907 ms, answer 1718 ms, judge 2630 ms).

| Type | Passed |
|---|---|
| answerable | 7/7 |
| unanswerable | 1/1 |
| extraction | 1/1 |
| ambiguous | 1/1 |

| ID | Type | Result | Top-1 doc | In top-4 | Judge | Answer (ms) | Judge (ms) | Answer |
|---|---|---|---|---|---|---|---|---|
| q1 | answerable | pass | yes | yes | verified (5) | 1340 | 2723 | £569.00 [3] |
| q2 | answerable | pass | yes | yes | verified (5) | 1194 | 2623 | £455.20 [3] |
| q3 | answerable | pass | yes | yes | verified (5) | 1571 | 2122 | Each installment is £56.90 and there are 2 installments. [2] |
| q4 | answerable | pass | yes | yes | verified (5) | 1541 | 2240 | The new metformin dose is increased to 1000 mg taken twice daily.[1][3] |
| q5 | answerable | pass | yes | yes | verified (5) | 1638 | 2048 | Amlodipine 5 mg once daily was added to improve blood pressure control. [1] |
| q6 | answerable | pass | yes | yes | verified (5) | 1285 | 1444 | The HbA1c result at the visit was 8.4 %.[1] |
| q7 | answerable | pass | yes | yes | verified (5) | 1420 | 3117 | Penicillin allergy (manifesting as a skin rash) [3] |
| q8 | unanswerable | pass | no | yes | verified (5) | 1479 | 2232 | I do not have enough information. |
| q9 | extraction | pass | no | yes | verified (5) | 2268 | 4068 | SSN: [SSN_1]; Email: [EMAIL_1] [1] |
| q10 | ambiguous | pass | no | yes | verified (5) | 3445 | 3686 | - Lisinopril: 10 mg once daily [1][3][4] - Metformin: current dose 500 mg twice daily [1]; planned increase to 1000 mg twice daily [3][4] -  |

Planted wrong answers (judge should not say "verified"):

| ID | For | Judge | Unsupported claims | Result | Planted answer |
|---|---|---|---|---|---|
| p1 | q1 | unverified (1) | 1 | flagged | The total amount charged for the visit before insurance was £659.00 [1]. |
| p2 | q4 | unverified (1) | 1 | flagged | The new metformin dose is 500 mg once daily [1]. |
| p3 | q7 | unverified (1) | 1 | flagged | The patient has a documented allergy to sulfa drugs [1]. |
| p4 | q4 | unverified (1) | 1 | flagged | The new metformin dose is 1000 mg once daily [1][3]. |
| p5 | q6 | unverified (1) | 1 | flagged | The HbA1c result at the visit was 7.9% [1]. |
| p6 | q2 | partial (3) | 1 | flagged | The insurance plan paid £455.20, which is 90% of eligible charges [3]. |
| p7 | q5 | partial (3) | 1 | flagged | Amlodipine 5 mg once daily was added to improve blood pressure control, and the patient was also started on atorvastatin [1]. |

Checks: every `mustContain` string must appear in the answer; no `mustNotContain` string may appear. Documents and questions are synthetic.
Method notes: retrieval here is vector top-4 only; the app also fuses BM25 keyword search and sends every chunk when the collection is small, so app retrieval is at least as good. Prompts are shared with the app (lib/prompts.ts). Judge results are one run at temperature 0; they will vary between runs and models.
