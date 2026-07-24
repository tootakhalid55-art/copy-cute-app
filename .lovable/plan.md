
# Phase C2C — Fixed Assets Lifecycle Engine

نطاق كبير. سأشحنه على 3 دفعات متتالية بدون توقف بينها، لكن الخطة مقسّمة لتفهم ماذا ستستلم.

## Batch 1 — Event Engine + Revaluation + Impairment + Disposal + Transfer (Core)

### Database (migration واحد)
- جدول `fixed_asset_events` موحّد:
  - `event_type` ∈ {`acquisition`, `capitalization`, `improvement_capital`, `improvement_expense`, `partial_disposal`, `full_disposal`, `sale`, `transfer`, `revaluation_up`, `revaluation_down`, `impairment`, `impairment_reversal`, `restoration`, `split`, `merge`, `write_off`, `retirement`, `reactivation`}
  - `status` ∈ {`draft`, `posted`, `reversed`}
  - `payload jsonb`, `journal_id`, `effective_date`, `amount`, `created_by`, `notes`.
- جدول `fixed_asset_reserves` (Revaluation Reserve + Impairment Reserve per asset).
- إضافة أعمدة على `fixed_assets`: `revaluation_model` (cost|revaluation)، `revalued_amount`، `impairment_amount`، `custodian_id`، `location`، `health_score`، `last_used_at`.
- View موحّد `v_asset_timeline` يجمع: capitalization + schedules + events.
- Determination keys جديدة:
  - `fa.revaluation_surplus_oci`, `fa.revaluation_deficit`, `fa.impairment_loss`, `fa.impairment_reversal`, `fa.disposal_gain`, `fa.disposal_loss`, `fa.writeoff_expense`, `fa.transfer_clearing`.

### RPCs (atomic, SECURITY DEFINER, period-locked, audit-logged)
- `fa_post_event(_asset, _type, _payload)` — Dispatcher رئيسي.
- `fa_revalue(_asset, _new_value, _date, _model)` — Upward → OCI Reserve، Downward → P&L أو ضد Reserve.
- `fa_impair(_asset, _recoverable, _date, _reason)` + `fa_reverse_impairment(...)`.
- `fa_dispose(_asset, _method, _proceeds, _date)` — يحسب Cost - AccDep = NBV، Gain/Loss تلقائي.
- `fa_partial_dispose(_asset, _pct, _proceeds, _date)`.
- `fa_transfer(_asset, _to_branch, _to_cc, _custodian, _location, _date)`.
- `fa_improve(_asset, _amount, _extend_life_months, _bill_line_id, _date)`.
- `fa_split(_asset, _splits jsonb)` — ينشئ أصول أبناء، يوزّع Cost + AccDep نسبيًا.
- `fa_merge(_asset_ids[], _target_name)`.
- `fa_writeoff(_asset, _reason, _date)`, `fa_retire(_asset, _date)`, `fa_reactivate(_asset, _date)`.
- كل RPC يُنشئ قيدًا محاسبيًا عبر `post_journal` باستخدام determination keys.

### Server & UI
- `src/lib/assets/lifecycle.functions.ts` — wrappers لكل RPCs.
- `src/routes/assets.$id.tsx` — صفحة أصل مفصّلة (لو غير موجودة) مع تبويبات: Overview / Schedule / **Timeline** / Events / Documents.
- Wizards متعددة الخطوات:
  - `DisposalWizard.tsx` (اختيار → نوع → سعر → معاينة قيود → ترحيل).
  - `TransferWizard.tsx` (فرع/CC/مسؤول/موقع).
  - `RevaluationWizard.tsx` (قيمة جديدة → up/down → معاينة OCI/P&L).
  - `ImpairmentWizard.tsx` (recoverable amount → loss).
  - `SplitWizard.tsx` / `MergeWizard.tsx`.
  - `ImprovementDialog.tsx`.
- `src/routes/assets.disposals.tsx` — قائمة عمليات التخارج.
- روابط في Shell تحت "الأصول الثابتة".

## Batch 2 — Health Score + Copilot + Reports

### Health Score
- SQL function `fa_compute_health_score(_asset)` يرجع (score 0–100, tier: excellent|good|aging|replace_soon).
- عوامل: age vs useful_life, NBV/cost ratio, `last_used_at`, maintenance count (متاح لاحقًا).
- Nightly cron يحدّث `health_score` لكل الأصول النشطة.
- عمود Health على `/assets` مع Badge ملوّن.

### Copilot Intents (في `erp-copilot.functions.ts`)
- `explain_nbv(asset_id)` — يفسر تركيبة القيمة الدفترية.
- `explain_disposal_loss(event_id)` — سبب الخسارة.
- `should_revalue(asset_id)` — يحلل المؤشرات.
- `idle_assets(months)` — استعلام Health + last_used.
- `replacement_candidates(horizon_months)` — يستخدم Health Score.

### Reports (`/reports/assets.*`)
- Asset Register, Depreciation Rollforward, Disposal, Revaluation, Impairment, Transfer, CIP, Asset History, Movement Ledger, NBV by Category.
- كلها تعتمد على `v_asset_timeline` + `fixed_asset_events` — لا حساب client-side.

## ما لن يُشحن في هذه الدفعة
- Maintenance module الكامل (فواتير قطع غيار، جدولة صيانة، تنبيهات) — سيأتي في C2D منفصل.
- Barcoding / RFID integration.
- Physical Inventory Count workflows.

## ترتيب التسليم
1. Batch 1 (Core Event Engine + كل الـ Wizards + Timeline) — الآن.
2. Batch 2 (Health Score + Copilot + Reports) — بعد Batch 1 مباشرة بدون انتظار.

قل **"ابدأ"** لأشحن Batch 1 الآن، أو **"ابدأ الاثنين"** لتنفيذ الدفعتين متتاليًا.
