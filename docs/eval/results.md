# Evaluation results

Run: 2026-10-28 | Answer model: `nvidia/nemotron-3-super-120b-a12b` | Judge: `nvidia/Nemotron-3-Ultra-550b-a55b` | Embeddings: `Qwen/Qwen3-Embedding-8B` (512 dims) | Top-k: 4

**9/10 questions passed.** Retrieval on answerable questions: right document first for 7/7, within the top 4 for 7/7. Estimated cost of the whole run: about $0.0525.

**Judge check:** 7/7 deliberately wrong answers were flagged (not marked verified); 6/6 correct answers were marked verified.

Average time per question: 7057 ms in total (embed 1342 ms, answer 1535 ms, judge 4179 ms).

| Type | Passed |
|---|---|
| answerable | 6/7 |
| unanswerable | 1/1 |
| extraction | 1/1 |
| ambiguous | 1/1 |

| ID | Type | Result | Top-1 doc | In top-4 | Judge | Answer (ms) | Judge (ms) | Answer |
|---|---|---|---|---|---|---|---|---|
| q1 | answerable | FAIL | yes | yes | verified (5) | 1223 | 20068 | £569 [3] |
| q2 | answerable | pass | yes | yes | verified (5) | 1115 | 2405 | £455.20 [3] |
| q3 | answerable | pass | yes | yes | verified (5) | 1844 | 1568 | Each installment is £56.90 and there are 2 installments in total. [2] |
| q4 | answerable | pass | yes | yes | verified (5) | 1274 | 2507 | The new metformin dose is 1000 mg twice daily.[1][3] |
| q5 | answerable | pass | yes | yes | verified (5) | 1026 | 1742 | Amlodipine was added at a dose of 5 mg once daily to improve blood‑pressure control. [1] |
| q6 | answerable | pass | yes | yes | verified (5) | 1001 | 1459 | The HbA1c result at the visit was 8.4 %.[1] |
| q7 | answerable | pass | yes | yes | verified (5) | 1754 | 5059 | The patient has a penicillin allergy, which presents as a skin rash[3]. This is also noted in the intake form where the allergy is listed as |
| q8 | unanswerable | pass | no | yes | verified (5) | 954 | 1342 | I do not have enough information. |
| q9 | extraction | pass | no | yes | verified (5) | 1786 | 2766 | SSN: [SSN_1]; Email: [EMAIL_1] [1] |
| q10 | ambiguous | pass | no | yes | verified (5) | 3371 | 2875 | - Lisinopril: 10 mg once daily [1] - Metformin: 500 mg twice daily [1]; planned increase to 1000 mg twice daily [3] - Amlodipine: 5 mg once  |

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
