# خطة التنفيذ — C2B Hardening + C2C Lifecycle

سأنفذها على مرحلتين متتاليتين. C2B Hardening أولاً (يُشحن ويُختبر)، ثم C2C.

---

## المرحلة الأولى: C2B Hardening

### 1) Depreciation Calendar — `/assets/calendar`
- شبكة سنوية × 12 شهر لكل سنة مالية.
- حالة كل خلية: `open` / `closed` / `posted` / `partial` / `warning` (من `accounting_periods` + `fixed_asset_runs`).
- نقر على خلية → قائمة الأصول المؤهلة/المرحّلة/المستثناة في هذا الشهر مع سبب الاستثناء.
- شارة تحذيرات: فجوات في الإهلاك، فترات مغلقة بدون ترحيل.

### 2) Exception Dashboard — `/assets/exceptions`
- SQL view `v_fixed_asset_exceptions` تُصنّف كل أصل نشط تحت واحدة من:
  - `missing_gl_accounts` — لا يوجد `expense_account_id` أو `accumulated_account_id`.
  - `missing_useful_life` — `useful_life_months` فارغ/صفر.
  - `invalid_salvage` — `salvage_value >= cost` أو سالبة.
  - `ready_not_started` — `status='active'` و `depreciation_start_date <= today` وبدون schedule rows.
  - `fully_depreciated_active` — `accumulated_depreciation >= depreciable_base` و `status='active'`.
- لكل استثناء: زر "إصلاح" يفتح شاشة تعديل الأصل مع تمييز الحقل.

### 3) Batch Simulation
- توسيع `fa_preview_depreciation` لإرجاع `simulation_summary`:
  - `asset_count`, `total_depreciation`, `journal_lines_preview` (Dr/Cr مجمّعة حسب الحساب والمركز)، `blocking_errors[]` (فترة مغلقة/حساب مفقود/فجوة).
- في `/assets/depreciation` قبل زر "ترحيل": نافذة Simulation تعرض القيود المقترحة سطرًا سطرًا وأي أخطاء مانعة (زر الترحيل معطّل إن وُجدت).

### 4) Audit & Explainability
- عمود `computation` (jsonb) على `fixed_asset_schedules` يخزّن: `{method, formula, inputs:{opening_nbv, useful_life_months, days_in_period, salvage, ddb_factor, units}, adjustments:[{type, delta, reason}]}`.
- RPC `fa_explain_schedule(_schedule_id)` يعيد نصًا مقروءًا + JSON بنيوي.
- Copilot intent جديد `explain_depreciation` يستدعيه ويعرضه في `ExplainabilityPanel`.
- زر "لماذا؟" على كل صف في `assets.depreciation` وعلى تبويب Schedule في صفحة الأصل.

### 5) Locking
- حقول جديدة على `accounting_periods`: `fa_locked_at`, `fa_locked_by` (بجانب locks الحالية).
- Trigger على `fixed_asset_runs`:
  - عند `status='posted'` يقفل الشهر لِـ FA.
  - يمنع `INSERT` جديد بنفس `period_end` لنفس المؤسسة (unique partial index حيث `status='posted'`).
- Trigger على `fixed_assets`: يرفض `UPDATE` للحقول المؤثرة (cost, useful_life, salvage, method, dates) إذا كان `last_depreciated_period >= period` — إلا عن طريق RPC `fa_reopen_period` أو `fa_reverse_depreciation_run`.
- كل عملية (post/reverse/reopen/override) تُكتب في `financial_audit_log` مع payload كامل.

**ملفات ستُعدّل/تُنشأ في المرحلة الأولى:**
- migration جديد: schedules.computation + views + triggers + RPCs.
- `src/lib/assets/depreciation.functions.ts` — إضافة `simulateRun`, `getExceptions`, `getCalendar`, `explainSchedule`, `reopenPeriod`.
- `src/routes/assets.calendar.tsx` — جديد.
- `src/routes/assets.exceptions.tsx` — جديد.
- `src/routes/assets.depreciation.tsx` — نافذة Simulation + زر "لماذا؟".
- `src/routes/assets.$id.tsx` — تبويب Schedule/Forecast مع Explainability (إن لم يكن موجودًا).
- `src/lib/copilot/erp-copilot.functions.ts` — intent `explain_depreciation`.
- `src/components/haseem/Shell.tsx` — روابط Calendar + Exceptions تحت "الأصول الثابتة".

---

## المرحلة الثانية: Phase C2C — Asset Lifecycle

### قاعدة البيانات
- `fixed_asset_events` — سجل موحّد بـ `event_type` من:
  `revaluation | impairment | improvement | transfer | split | merge | disposal | write_off | cip_finalize`
  + `payload jsonb` + `journal_id` + `effective_date` + `status(draft|posted|reversed)`.
- `fixed_asset_maintenance` — مواعيد صيانة + تنبيهات.
- View `v_asset_timeline` — يوحّد: capitalize, schedules, events, maintenance, docs.

### RPCs (atomic + مقفولة بالفترة + audit)
- `fa_revalue_asset(_asset, _new_value, _model, _date)` — IFRS Revaluation Model / Cost Model.
- `fa_impair_asset(_asset, _impairment_amount, _reason, _date)`.
- `fa_improve_asset(_asset, _bill_line_id, _amount, _extends_life)` — رسملة تحسين على أصل قائم.
- `fa_transfer_asset(_asset, _to_branch, _to_cc, _date)`.
- `fa_split_asset(_asset, _splits jsonb[])` — إنشاء أصول أبناء وحفظ النسبة.
- `fa_merge_assets(_asset_ids[], _target)`.
- `fa_dispose_asset(_asset, _proceeds, _date, _method)` — Sale / Scrap.
- `fa_writeoff_asset(_asset, _reason, _date)`.
- `fa_finalize_cip(_asset, _capitalization_date)` — نقل من CIP إلى Active.
- كل RPC يُنشئ Journal Entry عبر `post_journal` باستخدام determination keys جديدة:
  `fa.revaluation_surplus`, `fa.impairment_loss`, `fa.disposal_gain`, `fa.disposal_loss`, `fa.writeoff`.

### الواجهات
- `src/routes/assets.$id.tsx` — تبويب **Timeline** (chronological) + أزرار الإجراءات (Revalue / Impair / Improve / Transfer / Split / Merge / Dispose / Write-off / Finalize CIP) كل واحد بنافذة مخصصة.
- `src/routes/assets.disposals.tsx` — قائمة عمليات التخارج.
- `src/routes/assets.maintenance.tsx` — جدول الصيانة.
- توسيع `reports.assets.*` — تعبئة تقارير Disposals / Impairment / Revaluation الآن.

### Copilot Integration (C2C)
- Intents:
  - `explain_asset_event(event_id)` — يفسّر القيد الناتج عن أي حدث.
  - `asset_valuation_history(asset_id)` — منحنى القيمة الدفترية عبر الزمن.
  - `recommend_disposal` — أصول مؤهلة للتخارج (idle, fully depreciated, low utilization).
  - `impairment_candidates` — أصول عليها مؤشرات انخفاض قيمة.
- Action Proposals (تحتاج موافقة):
  - `propose_impairment`, `propose_disposal`, `propose_revaluation`, `propose_cip_finalize`.

### Approvals & Guardrails
- Disposal / Impairment / Revaluation تمر عبر `approval_workflows` (موجود مسبقًا).
- كل حدث محفوظ في `financial_audit_log`.
- Feature flag `fixed_assets.lifecycle` على `organizations.settings`.

---

## Technical Details

- كل الـ RPCs `SECURITY DEFINER` مع `has_org_role` gating (`admin`/`accountant` للأحداث المالية).
- Locking عبر Postgres advisory locks لضمان عدم تكرار post لنفس المؤسسة+الفترة.
- Simulation & Explainability تعتمد على set-based SQL (CTE) — لا loops.
- كل event في C2C = صف في `fixed_asset_events` + قيد في `journal_entries` مربوطان عبر FK.
- التقارير الجديدة تستخدم views لتفادي حسابات client-side.

## ترتيب الشحن

1. **الآن**: migration + server + UI للمرحلة الأولى (C2B Hardening) بالكامل.
2. **بعد تأكيدك**: Phase C2C كاملة.

قل "ابدأ" لأنفذ المرحلة الأولى الآن، أو "ابدأ الاثنين" لضمّ C2C في نفس الجولة.
